import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sourceConfig } from "@/lib/sources/config";
import type { RunContext } from "./context";

// A source whose reviews and trading checks this month cost more than its cap
// is paused. AI cost belongs to the source that first found the target.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function capReachedMessage(cap: number, now = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const amount = Number.isInteger(cap) ? String(cap) : cap.toFixed(2);
  return `Paused: £${amount} cap reached. Raise the cap or wait until 1 ${MONTHS[next.getMonth()]}.`;
}

export function monthToDateCost(sourceId: string, now = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const r = schema.reviews;
  const t = schema.targets;
  const reviews = db
    .select({ total: sql<number>`coalesce(sum(${r.costGbp}), 0)` })
    .from(r)
    .innerJoin(t, eq(t.id, r.targetId))
    .where(and(eq(t.firstSourceId, sourceId), gte(r.reviewedAt, start)))
    .get();
  // Trading checks keep their cost on the target (attributes.trading).
  const checks = db
    .select({ total: sql<number>`coalesce(sum(json_extract(${t.attributes}, '$.trading.cost_gbp')), 0)` })
    .from(t)
    .where(and(eq(t.firstSourceId, sourceId), sql`json_extract(${t.attributes}, '$.trading.checked_at') >= ${start}`))
    .get();
  return (reviews?.total ?? 0) + (checks?.total ?? 0);
}

export function enforceSpendCaps(run: RunContext): void {
  const s = schema.sources;
  const sources = db
    .select()
    .from(s)
    .where(and(eq(s.workspaceId, run.workspaceId), eq(s.status, "connected")))
    .all();
  for (const source of sources) {
    const cap = sourceConfig.safeParse(source.config).data?.spend_cap_gbp;
    if (cap == null) continue;
    if (monthToDateCost(source.id) < cap) continue;
    const message = capReachedMessage(cap);
    db.update(s).set({ status: "paused", lastError: message }).where(eq(s.id, source.id)).run();
    run.log(source.name, message, "error");
  }
}
