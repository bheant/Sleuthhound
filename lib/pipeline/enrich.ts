import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { createCompaniesHouseClient, type CompaniesHouseClient } from "@/lib/connectors/companies-house/client";
import type { CompaniesHouseScope } from "@/lib/connectors/companies-house/connector";
import { officerDisplayName } from "@/lib/connectors/companies-house/names";
import { companyPageUrl } from "@/lib/connectors/companies-house/normalise";
import { isVehicle } from "@/lib/connectors/companies-house/vehicles";
import type { CompanyProfile, Officer } from "@/lib/connectors/companies-house/types";
import type { OntologyDraft, SignalDraft } from "@/lib/connectors/types";
import { db, schema } from "@/lib/db";
import { chunk, geocodeBatch, POSTCODES_BATCH } from "@/lib/geo/postcodes";
import { upsertDraft } from "@/lib/ontology/upsert";
import type { RunContext } from "./context";
import { isAuthError, KeyRejectedError, plainReason } from "./errors";
import { fetchFilings, saveFilings, skippedLine, type Skipped } from "./filings";
import { mapLimit } from "./pool";

// Enriches company targets that haven't been enriched yet: the full profile,
// the officers, one page of filing history, deadline, overdue and filing
// signals, people and directs links. Companies being struck off or filing
// dormant accounts are marked skipped, so the review spends nothing on them.
// Then geocodes every place still without coordinates.

const t = schema.targets;
const MAX_PER_RUN = 300;
const DAY = 86_400_000;

type Target = { id: string; name: string; companyNumber: string; incorporatedOn: string | null; sicCodes: string[] | null };

function enrichable(workspaceId: string): Target[] {
  return db
    .select({ id: t.id, name: t.name, companyNumber: t.companyNumber, incorporatedOn: t.incorporatedOn, sicCodes: t.sicCodes })
    .from(t)
    .where(
      and(
        eq(t.workspaceId, workspaceId),
        eq(t.kind, "company"),
        eq(t.isDemo, 0),
        isNotNull(t.companyNumber),
        sql`json_extract(${t.profile}, '$.enriched_at') is null`,
      ),
    )
    .orderBy(sql`${t.firstSeenAt} desc`)
    .limit(MAX_PER_RUN)
    .all() as Target[];
}

const soon = (iso: string) => new Date(iso).getTime() - Date.now() < 90 * DAY;

export function deadlineSignals(profile: CompanyProfile, signals: CompaniesHouseScope["signals"]): SignalDraft[] {
  const out: SignalDraft[] = [];
  const url = `${companyPageUrl(profile.company_number)}/filing-history`;
  const accounts = profile.accounts;
  // One signal per deadline: an overdue one replaces the "due" one, so the
  // review never sees the same date twice and reads it as a conflict.
  if (accounts?.next_due) {
    const first = !accounts.last_accounts?.made_up_to;
    const overdue = signals.includes("overdue_filings") && accounts.overdue;
    const due = signals.includes("first_accounts_due");
    if (overdue || due) {
      out.push({
        targetRef: "company",
        type: overdue ? "accounts_overdue" : first ? "first_accounts_due" : "accounts_due",
        title: `${first ? "First accounts" : "Accounts"} ${overdue ? "overdue" : "due"}`,
        occurredAt: accounts.next_made_up_to ?? accounts.next_due,
        dueAt: accounts.next_due,
        weight: overdue || soon(accounts.next_due) ? "high" : "normal",
        url,
        attributes: { first },
      });
    }
  }
  const cs = profile.confirmation_statement;
  if (signals.includes("overdue_filings") && cs?.overdue && cs.next_due) {
    out.push({
      targetRef: "company",
      type: "confirmation_overdue",
      title: "Confirmation statement overdue",
      occurredAt: cs.next_due,
      dueAt: cs.next_due,
      weight: "high",
      url,
    });
  }
  return out;
}

function officerId(o: Officer): string | undefined {
  return o.links?.officer?.appointments?.match(/\/officers\/([^/]+)\//)?.[1];
}

// Only name, role, appointed date and officer ID are kept: never date of
// birth, nationality or address.
export function officerDrafts(
  officers: Officer[],
  companyNumber: string,
  incorporatedOn: string | null,
  watchNewDirectors: boolean,
): Pick<OntologyDraft, "people" | "links" | "signals"> {
  const draft: Pick<OntologyDraft, "people" | "links" | "signals"> = { people: [], links: [], signals: [] };
  const active = officers.filter((o) => !o.resigned_on).slice(0, 20);
  active.forEach((o, i) => {
    const ref = `officer-${i}`;
    const name = officerDisplayName(o.name);
    const role = o.officer_role ?? "officer";
    draft.people.push({ ref, name, externalId: officerId(o), attributes: { role, appointed_on: o.appointed_on ?? null } });
    draft.links.push({ fromRef: ref, toRef: "company", kind: "directs", attributes: { role, appointed_on: o.appointed_on ?? null } });
    // A director who joined well after incorporation is a change worth noting.
    const joinedLater =
      incorporatedOn && o.appointed_on && new Date(o.appointed_on).getTime() - new Date(incorporatedOn).getTime() > 30 * DAY;
    if (watchNewDirectors && role === "director" && joinedLater && o.appointed_on) {
      draft.signals.push({
        targetRef: "company",
        type: "new_director",
        title: `New director: ${name}`,
        occurredAt: o.appointed_on,
        url: `${companyPageUrl(companyNumber)}/officers`,
      });
    }
  });
  return draft;
}

async function enrichOne(
  client: CompaniesHouseClient,
  target: Target,
  ctx: { workspaceId: string; sourceId: string; scope: CompaniesHouseScope },
): Promise<{ overdue: boolean; filings: number; skipped: Skipped | null }> {
  const [profile, officers, filings] = await Promise.all([
    client.company(target.companyNumber),
    client.officers(target.companyNumber),
    fetchFilings(client, target.companyNumber),
  ]);
  const people = officerDrafts(
    officers?.items ?? [],
    target.companyNumber,
    target.incorporatedOn,
    ctx.scope.signals.includes("new_directors"),
  );
  const signals = profile ? deadlineSignals(profile, ctx.scope.signals) : [];
  upsertDraft(
    { workspaceId: ctx.workspaceId, sourceId: ctx.sourceId },
    { targets: [], places: [], signals: [...signals, ...people.signals], people: people.people, links: people.links },
    { company: { type: "target", id: target.id } },
  );
  db.update(t)
    .set({
      profile: { ...(profile ?? {}), enriched_at: new Date().toISOString() },
      ...(profile ? { status: profile.company_status, companyType: profile.type } : {}),
    })
    .where(eq(t.id, target.id))
    .run();
  // After the officers are saved, so a new director can back a funding round.
  const saved = saveFilings(
    { ...target, status: profile?.company_status ?? null },
    filings,
    { workspaceId: ctx.workspaceId, sourceId: ctx.sourceId },
  );
  return { overdue: signals.some((s) => s.type.endsWith("_overdue")), filings: saved.filings, skipped: saved.skipped };
}

export async function enrichCompanies(
  run: RunContext,
  source: { id: string; scope: CompaniesHouseScope; apiKey: string },
): Promise<void> {
  const targets = enrichable(run.workspaceId);
  if (targets.length === 0) return;
  const client = createCompaniesHouseClient(source.apiKey);
  let done = 0;
  let overdue = 0;
  let filings = 0;
  let vehicles = 0;
  const skips: Skipped[] = [];
  let failed = 0;
  let lastReason = "";
  let rejected = false;

  // Two at a time keeps the shared limiter (2 a second) busy; it does the pacing.
  await mapLimit(targets, 2, async (target) => {
    if (rejected) return;
    try {
      const r = await enrichOne(client, target, { workspaceId: run.workspaceId, sourceId: source.id, scope: source.scope });
      if (r.overdue) overdue++;
      filings += r.filings;
      if (r.skipped) skips.push(r.skipped);
      else if (isVehicle(target)) vehicles++;
      done++;
    } catch (error) {
      if (isAuthError(error)) {
        rejected = true;
        return;
      }
      failed++;
      lastReason = plainReason(error);
    }
    run.progress(done + failed, targets.length);
  });
  if (rejected) throw new KeyRejectedError("companies_house");

  run.counts.enriched += done;
  const overdueText = overdue ? `, ${overdue} overdue on filings` : "";
  run.log("Companies House", `${done} new companies checked for directors, deadlines and ${filings} filings${overdueText}`);
  const skipped = skippedLine(skips);
  if (skipped) run.log("Companies House", skipped);
  if (vehicles) run.log("Companies House", `${vehicles} not reviewed: holding or property companies`);
  if (failed) {
    run.log("Companies House", `${failed} couldn’t be checked (${lastReason}). They’ll be tried again next run.`, "error");
  }
}

export async function geocodePlaces(run: RunContext): Promise<void> {
  const p = schema.places;
  const rows = db
    .selectDistinct({ postcode: p.postcode })
    .from(p)
    .where(and(eq(p.workspaceId, run.workspaceId), eq(p.isDemo, 0), isNotNull(p.postcode), isNull(p.lat)))
    .all();
  const postcodes = rows.map((r) => r.postcode).filter((x): x is string => Boolean(x));
  if (postcodes.length === 0) return;

  let placed = 0;
  const boroughs = new Set<string>();
  for (const batch of chunk(postcodes, POSTCODES_BATCH)) {
    try {
      const found = await geocodeBatch(batch);
      for (const [postcode, geo] of found) {
        db.update(p)
          .set({ lat: geo.lat, lng: geo.lng, borough: geo.borough })
          .where(and(eq(p.workspaceId, run.workspaceId), eq(p.postcode, postcode)))
          .run();
        placed++;
        if (geo.borough) boroughs.add(geo.borough);
      }
    } catch (error) {
      run.log("postcodes.io", `A batch of ${batch.length} postcodes couldn’t be placed (${plainReason(error)})`, "error");
    }
  }
  const missed = postcodes.length - placed;
  run.log(
    "postcodes.io",
    `${placed} postcodes placed in ${boroughs.size} ${boroughs.size === 1 ? "borough" : "boroughs"}${missed ? `, ${missed} not found` : ""}`,
  );
}
