import { and, eq, like, sql } from "drizzle-orm";
import { clientLabel } from "@/lib/business/name";
import { getBusinessName } from "@/lib/business/store";
import { db, schema } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { matchesQuery } from "@/lib/targets/filters";
import { workspaceItems } from "@/lib/targets/workspace";

// Search (/ or ⌘K): companies in New Companies (any tab) and the user's
// clients. Companies are matched the same way as the list filter, so a search
// result is always somewhere the user can open it.

export type SearchResult = {
  kind: "company" | "client";
  id: string;
  name: string;
  sub: string;
  score: number | null;
  href: string;
};

export type SearchGroup = { label: string; items: SearchResult[] };

const DECISION_LABEL = { kept: "Kept", discarded: "Discarded" } as const;

export function search(workspaceId: string, query: string): SearchGroup[] {
  const business = getBusinessName(workspaceId);
  const q = query.trim();
  if (!q) return [];
  const threshold = getSetting(workspaceId, "score_threshold");
  const companies = workspaceItems(workspaceId, threshold)
    .filter((i) => matchesQuery(i, q))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map<SearchResult>((i) => ({
      kind: "company",
      id: i.id,
      name: i.name,
      sub: [i.sector, i.borough, i.decision ? DECISION_LABEL[i.decision] : null].filter(Boolean).join(", "),
      score: i.score,
      href: `/companies?c=${i.id}`,
    }));

  const t = schema.targets;
  // Companies skipped before review still open from search, saying why.
  const skipped = db
    .select({ id: t.id, name: t.name })
    .from(t)
    .where(
      and(
        eq(t.workspaceId, workspaceId),
        eq(t.kind, "company"),
        sql`json_extract(${t.attributes}, '$.skipped') is not null`,
        like(t.name, `%${q.replace(/[%_]/g, "")}%`),
      ),
    )
    .limit(Math.max(0, 6 - companies.length))
    .all()
    .map<SearchResult>((c) => ({ kind: "company", id: c.id, name: c.name, sub: "Not reviewed", score: null, href: `/companies?c=${c.id}` }));
  companies.push(...skipped);

  const clients = db
    .select({ id: t.id, name: t.name })
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.isClient, 1), like(t.name, `%${q.replace(/[%_]/g, "")}%`)))
    .limit(4)
    .all()
    .map<SearchResult>((c) => ({
      kind: "client",
      id: c.id,
      name: c.name,
      sub: `${clientLabel(business)}, opens in Clients`,
      score: null,
      href: `/clients?c=${c.id}`,
    }));

  const groups: SearchGroup[] = [];
  if (companies.length) groups.push({ label: "New companies", items: companies });
  if (clients.length) groups.push({ label: "Clients", items: clients });
  return groups;
}
