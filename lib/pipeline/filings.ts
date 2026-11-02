import { and, eq, sql } from "drizzle-orm";
import type { CompaniesHouseClient } from "@/lib/connectors/companies-house/client";
import { filingSignals, skipReason, type SkipReason } from "@/lib/connectors/companies-house/filings";
import type { FilingHistoryItem } from "@/lib/connectors/companies-house/types";
import { isVehicle } from "@/lib/connectors/companies-house/vehicles";
import { db, schema } from "@/lib/db";
import { upsertDraft } from "@/lib/ontology/upsert";

// Filing history for one company: one page (100 filings) through the shared
// limiter, its signals saved, and whether the company should be skipped
// before review. Used by enrich for new companies and by backfill:filings.

const t = schema.targets;
const s = schema.signals;

export type Skipped = SkipReason & { at: string };

export type FilingsResult = { filings: number; added: Record<string, number>; removed: Record<string, number>; skipped: Skipped | null };

/** New director signals already on the target: they can back a funding round. */
function newDirectors(targetId: string) {
  return db
    .select({ type: s.type, occurredAt: s.occurredAt, title: s.title, url: s.url, externalId: s.externalId })
    .from(s)
    .where(and(eq(s.targetId, targetId), eq(s.type, "new_director")))
    .all()
    .flatMap((x) => (x.occurredAt ? [{ ...x, occurredAt: x.occurredAt }] : []));
}

export function saveFilings(
  target: { id: string; name: string; sicCodes: string[] | null; companyNumber: string; incorporatedOn: string | null; status: string | null },
  items: FilingHistoryItem[],
  ctx: { workspaceId: string; sourceId: string },
): FilingsResult {
  const drafts = filingSignals(items, target.companyNumber, target.incorporatedOn, newDirectors(target.id), { vehicle: isVehicle(target) });

  // Signals an earlier mapping made that this one doesn't, such as an
  // allotment now read as founder shares or a funding round that no longer
  // qualifies, are removed, so a re-run corrects as well as adds.
  const wanted = new Set(drafts.map((d) => `${d.externalId}|${d.type}`));
  const removed: Record<string, number> = {};
  const stale = db
    .select({ id: s.id, type: s.type, externalId: s.externalId })
    .from(s)
    .where(and(eq(s.targetId, target.id), sql`(${s.externalId} like 'ch:filing:%' or ${s.externalId} like 'ch:funding:%')`))
    .all()
    .filter((x) => !wanted.has(`${x.externalId}|${x.type}`));
  for (const x of stale) {
    db.delete(s).where(eq(s.id, x.id)).run();
    removed[x.type] = (removed[x.type] ?? 0) + 1;
  }

  const before = new Set(
    db.select({ id: s.externalId }).from(s).where(eq(s.targetId, target.id)).all().map((x) => x.id),
  );
  upsertDraft(
    { workspaceId: ctx.workspaceId, sourceId: ctx.sourceId },
    { targets: [], places: [], people: [], links: [], signals: drafts },
    { company: { type: "target", id: target.id } },
  );
  const added: Record<string, number> = {};
  for (const d of drafts) if (!before.has(d.externalId)) added[d.type] = (added[d.type] ?? 0) + 1;

  // The filing history as it is now decides: a strike-off later stopped no longer counts.
  const reason = skipReason(target.status, drafts, items);
  const skipped = reason ? { ...reason, at: new Date().toISOString() } : null;
  const row = db.select({ attributes: t.attributes, profile: t.profile }).from(t).where(eq(t.id, target.id)).get();
  const attributes = { ...(row?.attributes ?? {}) };
  if (skipped) attributes.skipped = skipped;
  else delete attributes.skipped;
  db.update(t)
    .set({ attributes, profile: { ...(row?.profile ?? {}), filings_at: new Date().toISOString() } })
    .where(eq(t.id, target.id))
    .run();
  return { filings: items.length, added, removed, skipped };
}

export async function fetchFilings(client: CompaniesHouseClient, companyNumber: string): Promise<FilingHistoryItem[]> {
  return (await client.filingHistory(companyNumber))?.items ?? [];
}

const SKIP_PHRASES: Record<SkipReason["reason"], string> = {
  strike_off: "proposed for or applying for strike-off",
  dormant: "filed dormant accounts",
  not_active: "no longer active",
};

/** "12 not reviewed: 7 proposed for strike-off, 5 filed dormant accounts". */
export function skippedLine(skips: Skipped[]): string | null {
  if (skips.length === 0) return null;
  const parts = (["strike_off", "dormant", "not_active"] as const)
    .map((r) => [r, skips.filter((x) => x.reason === r).length] as const)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${SKIP_PHRASES[r]}`);
  return `${skips.length} not reviewed: ${parts.join(", ")}`;
}
