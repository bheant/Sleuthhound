import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { sicLabel } from "@/lib/connectors/companies-house/sic";
import { isVehicle } from "@/lib/connectors/companies-house/vehicles";
import { companyPageUrl } from "@/lib/connectors/companies-house/normalise";
import { db, schema } from "@/lib/db";
import { companiesHouseScope } from "@/lib/connectors/companies-house/connector";
import { fetchWindows, type FetchWindow } from "@/lib/connectors/companies-house/fetch";
import { knownFormationAgent } from "@/lib/ontology/formation-agents";
import { sourceConfig } from "@/lib/sources/config";
import type { Target } from "@/lib/db/schema";
import type { ReviewInput, ReviewSubject } from "@/lib/ai/prompts";
import { reasonText } from "@/lib/targets/reasons";
import { rankByPreScore } from "./prescore";
import { tradingOf } from "@/lib/targets/trading";

// Reads what a review needs from the ontology: the target with its place,
// officers and signals, the most similar clients and recent discards.

const t = schema.targets;
const l = schema.links;

// Officers, each with the other active companies they direct that we know of.
function officersOf(targetId: string): ReviewSubject["officers"] {
  const p = schema.people;
  const rows = db
    .select({ personId: p.id, name: p.name, attributes: l.attributes })
    .from(l)
    .innerJoin(p, eq(p.id, l.fromId))
    .where(and(eq(l.toId, targetId), eq(l.kind, "directs")))
    .all();
  return rows.map((r) => {
    const others = db
      .select({ name: t.name })
      .from(l)
      .innerJoin(t, eq(t.id, l.toId))
      .where(
        and(eq(l.fromId, r.personId), eq(l.kind, "directs"), ne(l.toId, targetId), sql`coalesce(${t.status}, 'active') = 'active'`),
      )
      .limit(3)
      .all();
    return {
      name: r.name,
      role: String(r.attributes?.role ?? "officer"),
      appointedOn: (r.attributes?.appointed_on as string | null | undefined) ?? null,
      otherCompanies: others.map((o) => o.name),
    };
  });
}

function companiesAtPlace(placeId: string | null, targetId: string): number {
  if (!placeId) return 0;
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(t)
    .where(and(eq(t.placeId, placeId), ne(t.id, targetId), eq(t.isDemo, 0)))
    .get();
  return row?.n ?? 0;
}

// "none" when the full profile shows no accounts filed; null when the profile
// hasn't been fetched, so nothing is claimed either way.
function lastAccountsType(target: Target): string | null {
  if (!target.profile?.enriched_at) return null;
  const accounts = target.profile.accounts as { last_accounts?: { type?: string } } | undefined;
  return accounts?.last_accounts?.type ?? "none";
}

// What a conversation's review reads: where it was posted, the thread a
// comment sits in, and the text.
function conversationBody(target: Target): string | null {
  const p = target.profile ?? {};
  const text = typeof p.text === "string" ? p.text : typeof p.quote === "string" ? p.quote : null;
  if (!text) return null;
  const where = typeof p.where === "string" ? `Posted on ${p.where}` : null;
  const thread = typeof p.thread === "string" && p.thread ? `as a comment on the thread “${p.thread}”` : null;
  const head = [where, thread].filter(Boolean).join(", ");
  return head ? `${head}.\n${text}` : text;
}

export function subjectOf(target: Target): ReviewSubject {
  const place = target.placeId
    ? db.select().from(schema.places).where(eq(schema.places.id, target.placeId)).get()
    : undefined;
  const signals = db
    .select({ title: schema.signals.title, occurredAt: schema.signals.occurredAt, dueAt: schema.signals.dueAt })
    .from(schema.signals)
    .where(eq(schema.signals.targetId, target.id))
    .orderBy(desc(schema.signals.occurredAt))
    // Deadlines sort first (their dates are ahead); filing signals follow.
    .limit(20)
    .all();
  const body = conversationBody(target);
  const officers = target.kind === "company" ? officersOf(target.id) : [];
  return {
    kind: target.kind,
    name: target.name,
    companyNumber: target.companyNumber,
    companyType: target.companyType,
    status: target.status,
    incorporatedOn: target.incorporatedOn,
    industries: (target.sicCodes ?? []).map((code) => `${code} ${sicLabel(code)}`),
    address: place?.address ?? null,
    borough: place?.borough ?? null,
    sourceUrl: target.companyNumber ? companyPageUrl(target.companyNumber) : target.url,
    body,
    officers,
    signals,
    trading: target.kind === "company" ? tradingOf(target.attributes) : null,
    facts:
      target.kind === "company"
        ? {
            formationAgent: knownFormationAgent(place?.postcode),
            companiesAtAddress: companiesAtPlace(target.placeId, target.id),
            directors: officers.filter((o) => o.role === "director").length,
            lastAccountsType: lastAccountsType(target),
          }
        : null,
  };
}

// Up to three clients: any the target was found as a lookalike of, then those
// sharing the most SIC codes with it.
function similarClients(workspaceId: string, targetId: string, sicCodes: string[]): ReviewInput["similarClients"] {
  const c = schema.clients;
  const l = schema.links;
  const rows = db
    .select({
      name: t.name,
      sicCodes: t.sicCodes,
      segment: c.segment,
      whySigned: c.whySigned,
      resembled: sql<number>`exists (select 1 from ${l} where ${l.kind} = 'resembles' and ${l.fromId} = ${targetId} and ${l.toId} = ${t.id})`,
    })
    .from(t)
    .innerJoin(c, eq(c.targetId, t.id))
    .where(and(eq(t.workspaceId, workspaceId), eq(t.isClient, 1)))
    .all();
  return rows
    .map((r) => ({ ...r, overlap: (r.sicCodes ?? []).filter((s) => sicCodes.includes(s)).length }))
    .filter((r) => r.resembled || r.overlap > 0)
    .sort((a, b) => b.resembled - a.resembled || b.overlap - a.overlap)
    .slice(0, 3)
    .map(({ name, segment, whySigned }) => ({ name, segment, whySigned }));
}

// The current decision of each target: its latest, unless undone. Decisions
// later undone, or superseded by a newer one, don't count.
function currentlyDecided(workspaceId: string, decision: "kept" | "discarded", limit: number) {
  const d = schema.decisions;
  return db
    .select({ targetId: t.id, name: t.name, reason: d.reason, note: d.note })
    .from(d)
    .innerJoin(t, eq(t.id, d.targetId))
    .where(
      and(
        eq(t.workspaceId, workspaceId),
        eq(d.decision, decision),
        isNull(d.undoneAt),
        sql`${d.decidedAt} = (select max(d2.decided_at) from ${d} d2 where d2.target_id = ${d.targetId} and d2.undone_at is null)`,
      ),
    )
    .orderBy(desc(d.decidedAt))
    .limit(limit)
    .all();
}

// The last 20 discards with the user's own reason. Never the AI's summary:
// that would teach the review its own opinion back.
function recentDiscards(workspaceId: string): ReviewInput["discarded"] {
  return currentlyDecided(workspaceId, "discarded", 20).map((x) => ({ name: x.name, reason: reasonText(x.reason, x.note) }));
}

// The last 10 keeps, with the review's one line so the model sees what kind of lead was kept.
function recentKeeps(workspaceId: string): ReviewInput["kept"] {
  const rows = currentlyDecided(workspaceId, "kept", 10);
  if (rows.length === 0) return [];
  const r = schema.reviews;
  const summaries = db
    .select({ targetId: r.targetId, summary: r.summary })
    .from(r)
    .where(inArray(r.targetId, rows.map((x) => x.targetId)))
    .orderBy(desc(r.reviewedAt))
    .all();
  return rows.map((x) => ({ name: x.name, summary: summaries.find((s) => s.targetId === x.targetId)?.summary ?? null }));
}

export function reviewContext(workspaceId: string, target: Target) {
  return {
    subject: subjectOf(target),
    similarClients: similarClients(workspaceId, target.id, target.sicCodes ?? []),
    discarded: recentDiscards(workspaceId),
    kept: recentKeeps(workspaceId),
  };
}

// Companies House sources' fetch windows, by source ID. A company that source
// found is only reviewed while its incorporation date is inside one of them,
// so companies from an earlier, wider fetch don't crowd out the windows.
function windowsBySource(workspaceId: string): Map<string, FetchWindow[]> {
  const src = schema.sources;
  const rows = db
    .select({ id: src.id, config: src.config })
    .from(src)
    .where(and(eq(src.workspaceId, workspaceId), eq(src.connector, "companies_house")))
    .all();
  const out = new Map<string, FetchWindow[]>();
  for (const row of rows) {
    const scope = companiesHouseScope.safeParse(sourceConfig.safeParse(row.config).data?.scope);
    if (scope.success) out.set(row.id, fetchWindows(scope.data));
  }
  return out;
}

function inWindows(target: Target, windows: Map<string, FetchWindow[]>): boolean {
  const ws = target.firstSourceId ? windows.get(target.firstSourceId) : undefined;
  if (!ws) return true;
  const d = target.incorporatedOn;
  return Boolean(d && ws.some((w) => d >= w.start && d <= w.end));
}

// Conversations always get some of the cap, so a backlog of companies can't
// keep them from ever being reviewed.
const CONVERSATION_SHARE = 0.25;

// Unreviewed targets up to the cap: companies first, ranked by the cheap
// pre-score (lib/pipeline/prescore.ts), then conversations by newest signal.
// A run for one source reviews only what that source found. Priority targets,
// such as this run's lookalikes, come first whatever their pre-score.
export function reviewCandidates(
  workspaceId: string,
  cap: number,
  sicPrefixes: string[],
  onlySourceId: string | null = null,
  priorityIds: string[] = [],
): Target[] {
  const r = schema.reviews;
  const s = schema.signals;
  const src = schema.sources;
  const p = schema.places;
  const latest = (types: string) =>
    sql<string | null>`(select max(${s.occurredAt}) from ${s} where ${s.targetId} = ${t.id} and ${s.type} in (${sql.raw(types)}))`;
  const rows = db
    .select({
      target: t,
      postcode: p.postcode,
      nextDue: sql<string | null>`(select min(${s.dueAt}) from ${s} where ${s.targetId} = ${t.id} and ${s.dueAt} >= date('now'))`,
      overdue: sql<number>`exists (select 1 from ${s} where ${s.targetId} = ${t.id} and ${s.type} like '%_overdue')`,
      firstOverdue: sql<number>`exists (select 1 from ${s} where ${s.targetId} = ${t.id} and ${s.type} = 'accounts_overdue' and json_extract(${s.attributes}, '$.first') = 1)`,
      fundingAt: latest("'funding_round'"),
      allotmentAt: latest("'share_allotment'"),
      backingAt: latest("'corporate_shareholder', 'new_articles'"),
      // Moved away from a formation agent, or from a postcode 3 or more of our companies share.
      movedFromShared: sql<number>`exists (select 1 from ${s} where ${s.targetId} = ${t.id} and ${s.type} = 'office_moved' and (
        json_extract(${s.attributes}, '$.from_formation_agent') = 1 or
        (select count(*) from ${t} t2 join ${p} p2 on p2.id = t2.place_id where p2.postcode = json_extract(${s.attributes}, '$.old_postcode')) >= 3))`,
      atPlace: sql<number>`(select count(*) from ${t} t3 where t3.place_id = ${t.placeId} and t3.is_demo = 0)`,
      newestSignal: sql<string | null>`(select max(${s.occurredAt}) from ${s} where ${s.targetId} = ${t.id} and ${s.occurredAt} <= date('now'))`,
    })
    .from(t)
    .leftJoin(p, eq(p.id, t.placeId))
    .where(
      and(
        eq(t.workspaceId, workspaceId),
        eq(t.isDemo, 0),
        eq(t.isClient, 0),
        onlySourceId && priorityIds.length === 0 ? eq(t.firstSourceId, onlySourceId) : undefined,
        sql`not exists (select 1 from ${r} where ${r.targetId} = ${t.id})`,
        sql`coalesce(${t.status}, 'active') in ('active', 'open')`,
        // Being struck off or filing dormant accounts: never worth a review.
        sql`json_extract(${t.attributes}, '$.skipped') is null`,
        // A source paused at its spend cap stops costing anything.
        sql`coalesce((select ${src.status} from ${src} where ${src.id} = ${t.firstSourceId}), 'connected') != 'paused'`,
      ),
    )
    .all()
    .map((row) => ({
      target: row.target,
      sicCodes: row.target.sicCodes ?? [],
      incorporatedOn: row.target.incorporatedOn,
      nextDue: row.nextDue,
      overdue: Boolean(row.overdue),
      firstAccountsOverdue: Boolean(row.firstOverdue),
      fundingAt: row.fundingAt,
      allotmentAt: row.allotmentAt,
      backingAt: row.backingAt,
      movedFromSharedAddress: Boolean(row.movedFromShared),
      sharedAddress: Boolean(knownFormationAgent(row.postcode)) || row.atPlace >= 3,
      newestSignal: row.newestSignal,
    }));
  const windows = windowsBySource(workspaceId);
  const first = new Set(priorityIds);
  const priority = rows.filter((x) => first.has(x.target.id));
  const companies = [
    ...priority,
    ...rankByPreScore(
      // Holding, property and head-office companies (by codes or name) are
      // vehicles, not startups: like skipped companies, they never enter the ranking.
      rows.filter((x) => x.target.kind === "company" && !first.has(x.target.id) && inWindows(x.target, windows) && !isVehicle(x.target)),
      sicPrefixes,
    ),
  ];
  const conversations = rows
    .filter((x) => x.target.kind === "conversation")
    .sort((a, b) => (b.newestSignal ?? "").localeCompare(a.newestSignal ?? ""));
  const reserved = Math.min(conversations.length, Math.ceil(cap * CONVERSATION_SHARE));
  const picked = companies.slice(0, cap - reserved);
  return [...picked, ...conversations.slice(0, cap - picked.length)].map((x) => x.target);
}
