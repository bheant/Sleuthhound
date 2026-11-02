import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Universe, UniverseLead } from "./types";

// The client universe: clients grouped by segment, and the leads that
// resemble each segment's clients (resembles links, from lookalikes) in the
// last 8 weeks, with their current score and whether today's run found them.

const t = schema.targets;
const c = schema.clients;
const l = schema.links;
const r = schema.reviews;
const DAY = 86_400_000;

/** When a lead joined a client: the lookalike search that found it, else when the target was first seen. */
export const foundAt = sql<string>`coalesce(json_extract(${l.attributes}, '$.found_at'), ${t.firstSeenAt})`;

const sameLocalDay = (iso: string, now: number) => new Date(iso).toDateString() === new Date(now).toDateString();

export function clientUniverse(workspaceId: string, now = Date.now()): Universe {
  const clients = db
    .select({ id: t.id, name: t.name, segment: c.segment })
    .from(t)
    .innerJoin(c, eq(c.targetId, t.id))
    .where(and(eq(t.workspaceId, workspaceId), eq(t.isClient, 1)))
    .all();
  const segmentOf = new Map(clients.filter((x) => x.segment).map((x) => [x.id, x.segment!]));
  const since = new Date(now - 56 * DAY).toISOString();

  const rows = segmentOf.size
    ? db
        .select({
          id: t.id,
          name: t.name,
          clientId: l.toId,
          foundAt,
          score: sql<number | null>`(select ${r.score} from ${r} where ${r.targetId} = ${t.id} order by ${r.reviewedAt} desc limit 1)`,
        })
        .from(l)
        .innerJoin(t, eq(t.id, l.fromId))
        .where(and(eq(l.kind, "resembles"), eq(l.fromType, "target"), eq(t.isClient, 0), inArray(l.toId, [...segmentOf.keys()]), sql`${foundAt} >= ${since}`))
        .all()
    : [];

  type Group = { clients: Array<{ id: string; name: string }>; leads: Map<string, UniverseLead> };
  const segments = new Map<string, Group>();
  for (const client of clients) {
    if (!client.segment) continue;
    const seg: Group = segments.get(client.segment) ?? { clients: [], leads: new Map() };
    seg.clients.push({ id: client.id, name: client.name });
    segments.set(client.segment, seg);
  }
  for (const row of rows) {
    const seg = segments.get(segmentOf.get(row.clientId)!)!;
    // A lead like two clients of one type counts once for that type.
    if (seg.leads.has(row.id)) continue;
    seg.leads.set(row.id, { id: row.id, name: row.name, score: row.score, today: sameLocalDay(row.foundAt, now), clientId: row.clientId });
  }

  const list = [...segments.entries()]
    .map(([name, seg]) => ({ name, clients: seg.clients, leads: [...seg.leads.values()] }))
    .sort((a, b) => b.clients.length - a.clients.length || a.name.localeCompare(b.name));
  const allLeads = new Set(rows.map((x) => x.id));
  const today = new Set(list.flatMap((s) => s.leads.filter((x) => x.today).map((x) => x.id)));
  return {
    segments: list,
    totals: { clients: clients.length, leads: allLeads.size, today: today.size },
    unsorted: clients.filter((x) => !x.segment).length,
  };
}
