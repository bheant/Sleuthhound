// HubSpot's CRM API with a private app token (Bearer). Sends one kept company:
import { externalFetch } from "@/lib/net/external";
// finds it by domain, else by name, creates or updates it, attaches directors
// whose work emails Apollo found, and adds a note with the review. A send is
// a handful of requests, well inside a private app's 100 per 10 seconds.

const API = "https://api.hubapi.com";

// HubSpot-defined association types: note to company.
const NOTE_TO_COMPANY = 190;

export class HubSpotError extends Error {
  constructor(
    readonly status: number,
    readonly step: string,
  ) {
    super(`HubSpot returned ${status} at ${step}`);
    this.name = "HubSpotError";
  }
}

export type HubSpotCompany = { name: string; domain: string | null; description: string | null };
export type HubSpotContact = { email: string; firstName: string; lastName: string };
export type HubSpotNote = {
  score: number;
  summary: string;
  whyFit: string | null;
  whyNow: string | null;
  reviewedBy: string;
  link: string;
};

type Request = { method: string; path: string; body?: unknown; step: string };

function client(token: string) {
  return async function call<T>({ method, path, body, step }: Request): Promise<T> {
    const res = await externalFetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new HubSpotError(res.status, step);
    return (res.status === 204 ? null : await res.json()) as T;
  };
}

type Call = ReturnType<typeof client>;
type SearchResult = { results: Array<{ id: string }> };

async function findOne(call: Call, object: "companies" | "contacts", propertyName: string, value: string): Promise<string | null> {
  const found = await call<SearchResult>({
    method: "POST",
    path: `/crm/v3/objects/${object}/search`,
    body: { filterGroups: [{ filters: [{ propertyName, operator: "EQ", value }] }], properties: [propertyName], limit: 1 },
    step: `finding the ${object === "companies" ? "company" : "contact"}`,
  });
  return found.results[0]?.id ?? null;
}

function companyProperties(c: HubSpotCompany): Record<string, string> {
  const props: Record<string, string> = { name: c.name };
  if (c.domain) props.domain = c.domain;
  if (c.description) props.description = c.description;
  return props;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The note's HTML body: the review's summary, why it fits, why now and the link. */
export function noteBody(n: HubSpotNote): string {
  const parts = [
    `<p><strong>Sleuthhound: score ${n.score}</strong></p>`,
    `<p>${escape(n.summary)}</p>`,
    n.whyFit ? `<p><strong>Why it fits</strong><br>${escape(n.whyFit)}</p>` : "",
    n.whyNow ? `<p><strong>Why now</strong><br>${escape(n.whyNow)}</p>` : "",
    `<p>Reviewed by ${escape(n.reviewedBy)}. <a href="${escape(n.link)}">Open in Sleuthhound</a></p>`,
  ];
  return parts.filter(Boolean).join("");
}

/** Creates or updates the company; returns its HubSpot ID and whether it was new. */
async function upsertCompany(call: Call, company: HubSpotCompany, knownId: string | null): Promise<{ id: string; created: boolean }> {
  const properties = companyProperties(company);
  const update = (id: string) =>
    call({ method: "PATCH", path: `/crm/v3/objects/companies/${id}`, body: { properties }, step: "updating the company" });
  if (knownId) {
    try {
      await update(knownId);
      return { id: knownId, created: false };
    } catch (error) {
      // Deleted in HubSpot since the last send: match or create it again.
      if (!(error instanceof HubSpotError && error.status === 404)) throw error;
    }
  }
  const id =
    (company.domain ? await findOne(call, "companies", "domain", company.domain) : null) ??
    (await findOne(call, "companies", "name", company.name));
  if (id) {
    await update(id);
    return { id, created: false };
  }
  const made = await call<{ id: string }>({ method: "POST", path: "/crm/v3/objects/companies", body: { properties }, step: "creating the company" });
  return { id: made.id, created: true };
}

async function attachContact(call: Call, companyId: string, c: HubSpotContact) {
  const existing = await findOne(call, "contacts", "email", c.email);
  const id =
    existing ??
    (
      await call<{ id: string }>({
        method: "POST",
        path: "/crm/v3/objects/contacts",
        body: { properties: { email: c.email, firstname: c.firstName, lastname: c.lastName, jobtitle: "Director" } },
        step: "creating a contact",
      })
    ).id;
  await call({
    method: "PUT",
    path: `/crm/v4/objects/contact/${id}/associations/default/company/${companyId}`,
    step: "linking a contact",
  });
}

async function addNote(call: Call, companyId: string, note: HubSpotNote) {
  await call({
    method: "POST",
    path: "/crm/v3/objects/notes",
    body: {
      properties: { hs_timestamp: new Date().toISOString(), hs_note_body: noteBody(note) },
      associations: [{ to: { id: companyId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTE_TO_COMPANY }] }],
    },
    step: "adding the note",
  });
}

export type SendInput = { company: HubSpotCompany; knownId: string | null; contacts: HubSpotContact[]; note: HubSpotNote };

/**
 * Sends a company. onCompany is called as soon as the company exists, so a
 * later failure still leaves its ID stored and Send again updates it rather
 * than making a duplicate.
 */
export async function sendCompany(token: string, input: SendInput, onCompany: (id: string) => void) {
  const call = client(token);
  const { id, created } = await upsertCompany(call, input.company, input.knownId);
  onCompany(id);
  for (const contact of input.contacts) await attachContact(call, id, contact);
  await addNote(call, id, input.note);
  return { id, created };
}
