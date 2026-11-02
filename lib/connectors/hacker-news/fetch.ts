import { z } from "zod";
import type { FetchCtx } from "../types";
import type { HackerNewsScope } from "./connector";
import type { HnHit, HnSearchResult } from "./types";
import { externalFetch } from "@/lib/net/external";

// The Algolia Hacker News search API: no key. One request per keyword,
// newest first, merged and de-duplicated. Typo tolerance and prefix matching
// are off, so "accountant" doesn't also find "accountable".

export const HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date";
const PER_KEYWORD = 50;
const MAX_KEYWORDS = 10;

export class HackerNewsError extends Error {
  constructor(readonly status: number) {
    super(`Hacker News search returned ${status}`);
    this.name = "HackerNewsError";
  }
}

export const LOOK_BACK_SECONDS = { "24h": 86_400, "7d": 7 * 86_400, "30d": 30 * 86_400 } as const;

const hnCursor = z.object({ since: z.number().int() });

/** Quoted when it's a phrase, so every word must appear together. */
export function searchQuery(keyword: string): string {
  const k = keyword.trim().replace(/"/g, "");
  return /\s/.test(k) ? `"${k}"` : k;
}

export function searchUrl(keyword: string, scope: HackerNewsScope, since: number): string {
  const params = new URLSearchParams({
    query: searchQuery(keyword),
    tags: scope.includeComments ? "(story,comment)" : "story",
    numericFilters: `created_at_i>${since}`,
    hitsPerPage: String(PER_KEYWORD),
    advancedSyntax: "true",
    typoTolerance: "false",
    queryType: "prefixNone",
  });
  return `${HN_SEARCH_URL}?${params}`;
}

async function search(url: string): Promise<HnHit[]> {
  const res = await externalFetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new HackerNewsError(res.status);
  const body = (await res.json()) as HnSearchResult;
  return body.hits ?? [];
}

export async function fetchHackerNews(ctx: FetchCtx<HackerNewsScope>): Promise<{ items: HnHit[]; cursor: unknown }> {
  const now = Math.floor(Date.now() / 1000);
  const lookBackStart = now - LOOK_BACK_SECONDS[ctx.scope.lookBack];
  // A saved source only asks for what's new since its last run.
  const cursor = hnCursor.safeParse(ctx.cursor);
  const since = cursor.success ? Math.max(cursor.data.since, lookBackStart) : lookBackStart;

  const seen = new Map<string, HnHit>();
  for (const keyword of ctx.scope.keywords.slice(0, MAX_KEYWORDS)) {
    for (const hit of await search(searchUrl(keyword, ctx.scope, since))) seen.set(hit.objectID, hit);
  }
  const items = [...seen.values()].sort((a, b) => b.created_at_i - a.created_at_i).slice(0, ctx.limit);
  const newest = items.reduce((max, h) => Math.max(max, h.created_at_i), since);
  return { items, cursor: { since: newest } };
}
