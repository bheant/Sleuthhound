import { sampleRefusal } from "@/lib/net/external";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace } from "@/lib/vault/workspace";
import { isCorporateBody } from "@/lib/connectors/companies-house/company-types";
import { markKeyUsed, readKey } from "@/lib/credentials/store";
import { rejectedCopy } from "@/lib/credentials/services";
import { db, schema } from "@/lib/db";
import { rejectKey } from "@/lib/pipeline/errors";
import { currentDecisions, PROVIDER_NAMES } from "@/lib/targets/workspace";
import { ApolloError, matchWorkEmail, splitName } from "./apollo";
import { HubSpotError, sendCompany } from "./hubspot";
import { directorOf, emailOf, saveEmail } from "./people";

// Find email (Apollo) and Send to HubSpot. Both run only when someone presses
// the button. They return plain messages, never an upstream error or a key.

export type FindEmailResult =
  | { ok: true; email: string; foundOn: string }
  | { ok: false; message: string; notFound?: boolean };

export type SendResult = { ok: true; sentAt: string; hubspotId: string } | { ok: false; message: string };

const Id = z.string().uuid();
const gone = "That company is no longer here. Reload the page.";

function companyTarget(workspaceId: string, targetId: string) {
  const t = schema.targets;
  return db
    .select()
    .from(t)
    .where(and(eq(t.id, targetId), eq(t.workspaceId, workspaceId), eq(t.kind, "company")))
    .get();
}

function apolloMessage(status: number): string {
  if (status === 402 || status === 422) return "Apollo has no credits left for this lookup. Add credits in Apollo, then try again.";
  if (status === 429) return "Apollo is limiting requests. Try again in a minute.";
  return `Apollo returned an error (${status}). Try again in a minute.`;
}

export async function findDirectorEmail(targetId: string, personId: string): Promise<FindEmailResult> {
  const sample = sampleRefusal();
  if (sample) return { ok: false, message: sample };
  const workspaceId = requireWorkspace();
  const ids = z.tuple([Id, Id]).safeParse([targetId, personId]);
  if (!ids.success) return { ok: false, message: gone };
  const target = companyTarget(workspaceId, ids.data[0]);
  const person = target ? directorOf(workspaceId, target.id, ids.data[1]) : undefined;
  if (!target || !person) return { ok: false, message: gone };
  if (!isCorporateBody(target.companyType)) return { ok: false, message: "Find email is only for limited companies, PLCs and LLPs." };

  const existing = emailOf(person.attributes);
  if (existing) return { ok: true, email: existing.address, foundOn: existing.foundOn };

  const apiKey = readKey(workspaceId, "apollo");
  if (!apiKey) return { ok: false, message: "Connect Apollo on Connections to find emails." };
  try {
    const email = await matchWorkEmail(apiKey, { name: person.name, domain: target.domain, organisation: target.name });
    markKeyUsed(workspaceId, "apollo");
    if (!email) return { ok: false, notFound: true, message: `Apollo has no work email for ${splitName(person.name).first}.` };
    const foundOn = new Date().toISOString();
    saveEmail(person.id, email, foundOn);
    return { ok: true, email, foundOn };
  } catch (error) {
    if (error instanceof ApolloError) {
      if (error.status === 401 || error.status === 403) {
        rejectKey(workspaceId, "apollo");
        return { ok: false, message: rejectedCopy("apollo") };
      }
      return { ok: false, message: apolloMessage(error.status) };
    }
    return { ok: false, message: "Couldn’t reach Apollo. Check your connection, then try again." };
  }
}

function latestReview(targetId: string) {
  const r = schema.reviews;
  return db.select().from(r).where(eq(r.targetId, targetId)).orderBy(desc(r.reviewedAt)).get();
}

function directorContacts(targetId: string) {
  const p = schema.people;
  const l = schema.links;
  return db
    .select({ name: p.name, attributes: p.attributes })
    .from(l)
    .innerJoin(p, eq(p.id, l.fromId))
    .where(and(eq(l.kind, "directs"), eq(l.fromType, "person"), eq(l.toId, targetId)))
    .all()
    .flatMap((d) => {
      const email = emailOf(d.attributes);
      if (!email) return [];
      const { first, last } = splitName(d.name);
      return [{ email: email.address, firstName: first, lastName: last }];
    });
}

function setHubSpotAttributes(targetId: string, values: { hubspot_id: string; hubspot_sent_at?: string }) {
  const t = schema.targets;
  const row = db.select({ attributes: t.attributes }).from(t).where(eq(t.id, targetId)).get();
  db.update(t)
    .set({ attributes: { ...(row?.attributes ?? {}), ...values } })
    .where(eq(t.id, targetId))
    .run();
}

function hubspotMessage(error: HubSpotError): string {
  if (error.status === 403) {
    return `HubSpot refused ${error.step}. Give the private app company, contact and note write scopes, then Send again.`;
  }
  if (error.status === 429) return "HubSpot is limiting requests. Send again in a minute.";
  return `HubSpot returned an error (${error.status}) while ${error.step}. Send again in a minute.`;
}

// Link back to the company, on whichever address the app is served from.
const appUrl = () => window.location.origin;

export async function sendToHubSpot(targetId: string): Promise<SendResult> {
  const sample = sampleRefusal();
  if (sample) return { ok: false, message: sample };
  const workspaceId = requireWorkspace();
  const id = Id.safeParse(targetId);
  const target = id.success ? companyTarget(workspaceId, id.data) : undefined;
  if (!target) return { ok: false, message: gone };
  if (currentDecisions([target.id]).get(target.id)?.decision !== "kept") {
    return { ok: false, message: "Only kept companies can be sent to HubSpot." };
  }
  const review = latestReview(target.id);
  if (!review) return { ok: false, message: "This company hasn’t been reviewed yet." };
  const token = readKey(workspaceId, "hubspot");
  if (!token) return { ok: false, message: "Connect HubSpot on Connections to send companies." };

  const knownId = typeof target.attributes?.hubspot_id === "string" ? target.attributes.hubspot_id : null;
  try {
    const sent = await sendCompany(
      token,
      {
        company: { name: target.name, domain: target.domain, description: review.whatTheyDo },
        knownId,
        contacts: directorContacts(target.id),
        note: {
          score: review.score,
          summary: review.summary,
          whyFit: review.whyFit,
          whyNow: review.whyNow,
          reviewedBy: PROVIDER_NAMES[review.provider] ?? review.provider,
          link: `${appUrl()}/companies?tab=kept&c=${target.id}`,
        },
      },
      (hubspotId) => setHubSpotAttributes(target.id, { hubspot_id: hubspotId }),
    );
    const sentAt = new Date().toISOString();
    setHubSpotAttributes(target.id, { hubspot_id: sent.id, hubspot_sent_at: sentAt });
    markKeyUsed(workspaceId, "hubspot");
    return { ok: true, sentAt, hubspotId: sent.id };
  } catch (error) {
    if (error instanceof HubSpotError) {
      if (error.status === 401) {
        rejectKey(workspaceId, "hubspot");
        return { ok: false, message: rejectedCopy("hubspot") };
      }
      return { ok: false, message: hubspotMessage(error) };
    }
    return { ok: false, message: "Couldn’t reach HubSpot. Check your connection, then Send again." };
  }
}
