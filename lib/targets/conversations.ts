import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { formatAge, sectorOf } from "./format";
import type { ConversationItem, Decision, Link } from "./types";

// The Conversations tab: every reviewed conversation that isn't settled
// (discarded, or confirmed as a company's post), with its current review, the
// possible company the AI named and where it was found.

const t = schema.targets;
const r = schema.reviews;
const l = schema.links;

const PROVIDER_NAMES: Record<string, string> = { anthropic: "Claude", openai: "ChatGPT", xai: "Grok" };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

function decisionsFor(ids: string[]): Map<string, Decision> {
  const out = new Map<string, Decision>();
  if (ids.length === 0) return out;
  const d = schema.decisions;
  const rows = db.select().from(d).where(inArray(d.targetId, ids)).orderBy(desc(d.decidedAt)).all();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.targetId)) continue;
    seen.add(row.targetId);
    if (!row.undoneAt) out.set(row.targetId, row.decision);
  }
  return out;
}

function possibleCompanies(ids: string[]): Map<string, ConversationItem["possibleCompany"]> {
  const out = new Map<string, ConversationItem["possibleCompany"]>();
  if (ids.length === 0) return out;
  const p = schema.places;
  const rows = db
    .select({
      from: l.fromId,
      id: t.id,
      name: t.name,
      sicCodes: t.sicCodes,
      incorporatedOn: t.incorporatedOn,
      borough: p.borough,
      score: sql<number | null>`(select ${r.score} from ${r} where ${r.targetId} = ${t.id} order by ${r.reviewedAt} desc limit 1)`,
      whatTheyDo: sql<string | null>`(select ${r.whatTheyDo} from ${r} where ${r.targetId} = ${t.id} order by ${r.reviewedAt} desc limit 1)`,
    })
    .from(l)
    .innerJoin(t, eq(t.id, l.toId))
    .leftJoin(p, eq(p.id, t.placeId))
    .where(and(eq(l.kind, "possible_match"), inArray(l.fromId, ids)))
    .all();
  for (const row of rows) {
    const meta = [sectorOf(row.sicCodes), row.borough, formatAge(row.incorporatedOn)].filter(Boolean).join(", ");
    out.set(row.from, { id: row.id, name: row.name, score: row.score, meta, whatTheyDo: row.whatTheyDo });
  }
  return out;
}

function sourceLink(where: string, url: string | null): Link[] {
  return url ? [{ label: `${where} thread`, url }] : [];
}

export function conversationItems(workspaceId: string): ConversationItem[] {
  const src = schema.sources;
  const rows = db
    .select({
      id: t.id,
      name: t.name,
      url: t.url,
      profile: t.profile,
      firstSeenAt: t.firstSeenAt,
      isDemo: t.isDemo,
      sourceName: src.name,
      score: r.score,
      summary: r.summary,
      whyFit: r.whyFit,
      suggestedReply: r.suggestedReply,
      sources: r.sources,
      provider: r.provider,
      reviewedAt: r.reviewedAt,
      postedAt: sql<string | null>`(select max(${schema.signals.occurredAt}) from ${schema.signals} where ${schema.signals.targetId} = ${t.id})`,
    })
    .from(r)
    .innerJoin(t, eq(t.id, r.targetId))
    .leftJoin(src, eq(src.id, t.firstSourceId))
    .where(
      and(
        eq(t.workspaceId, workspaceId),
        eq(t.kind, "conversation"),
        ne(sql`coalesce(${t.status}, 'open')`, "matched"),
        sql`${r.reviewedAt} = (select max(r2.reviewed_at) from ${r} r2 where r2.target_id = ${t.id})`,
      ),
    )
    .all();
  const ids = rows.map((x) => x.id);
  const decisions = decisionsFor(ids);
  const companies = possibleCompanies(ids);

  return rows
    .filter((row) => decisions.get(row.id) !== "discarded")
    .map((row) => {
      const p = row.profile ?? {};
      const where = str(p.where) ?? row.sourceName ?? "Online";
      const posted = str(p.posted_at) ?? row.postedAt;
      const extra = (row.sources ?? []).filter((u) => u !== row.url).map((u) => ({ label: u.replace(/^https?:\/\/(www\.)?/, ""), url: u }));
      return {
        id: row.id,
        title: row.name,
        score: row.score,
        summary: row.summary,
        postedAt: posted,
        where,
        quote: str(p.text) ?? str(p.quote),
        thread: str(p.thread),
        url: row.url,
        whyFit: row.whyFit,
        suggestedReply: row.suggestedReply,
        possibleCompany: companies.get(row.id) ?? null,
        sources: [...sourceLink(where, row.url), ...extra],
        foundBy: row.sourceName ?? where,
        foundAt: row.firstSeenAt,
        reviewedBy: PROVIDER_NAMES[row.provider] ?? row.provider,
        reviewedAt: row.reviewedAt,
        decision: decisions.get(row.id) ?? null,
        isDemo: row.isDemo === 1,
      };
    })
    .sort((a, b) => (a.decision === b.decision ? b.score - a.score : a.decision ? 1 : -1));
}

/** Posts confirmed as each company's, for the company panel. */
export function postsFor(ids: string[]): Map<string, Link[]> {
  const out = new Map<string, Link[]>();
  if (ids.length === 0) return out;
  const s = schema.signals;
  const rows = db
    .select({ targetId: s.targetId, title: s.title, url: s.url })
    .from(s)
    .where(and(eq(s.type, "community_post"), inArray(s.targetId, ids)))
    .all();
  for (const row of rows) {
    if (!row.url || !row.targetId) continue;
    out.set(row.targetId, [...(out.get(row.targetId) ?? []), { label: row.title, url: row.url }]);
  }
  return out;
}

