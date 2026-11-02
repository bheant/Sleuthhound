import { z } from "zod";
import type { FetchCtx } from "../types";
import { createCompaniesHouseClient, type CompaniesHouseClient } from "./client";
import type { CompaniesHouseScope } from "./connector";
import type { AdvancedSearchItem } from "./types";

// Fetch reads two windows of incorporation dates each run:
//   firstAccounts: incorporated 15 to 21 months ago, so first accounts fall
//                  due within about 6 months (they're due 21 months after
//                  incorporation). Oldest day first, so the soonest deadlines
//                  come first. About 70% of the run's items.
//   recent:        incorporated in the last 90 days, newest day first. The rest.
// Advanced search can't page deep into a large result (it fails past about
// 10,000) and doesn't sort by date, so each request covers a single day and
// pages within it. The cursor remembers, per window, the days already read in
// full and where it stopped in any day read part way, so each run picks up
// days that have just entered a window first and never asks twice.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const windowCursor = z.object({ done: z.array(day), partial: z.record(day, z.number().int().min(0)) });
export const chCursor = z.object({ firstAccounts: windowCursor, recent: windowCursor });
export type ChCursor = z.infer<typeof chCursor>;
type WindowCursor = z.infer<typeof windowCursor>;
type WindowKey = keyof ChCursor;

export type FetchWindow = { key: WindowKey; label: string; start: string; end: string; order: "oldest" | "newest" };

const PAGE = 200;
const FIRST_ACCOUNTS_SHARE = 0.7;

export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const previousDay = (iso: string) => shiftDay(iso, -1);
export const nextDay = (iso: string) => shiftDay(iso, 1);

function monthsBefore(now: Date, months: number): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return localDate(d);
}

function daysBefore(now: Date, days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return localDate(d);
}

// Both windows, clipped to the scope's "incorporated after" date. A window
// the scope rules out entirely is left out.
export function fetchWindows(scope: CompaniesHouseScope, now = new Date()): FetchWindow[] {
  const all: FetchWindow[] = [
    {
      key: "firstAccounts",
      label: "incorporated 15 to 21 months ago",
      start: monthsBefore(now, 21),
      end: monthsBefore(now, 15),
      order: "oldest",
    },
    { key: "recent", label: "in the last 90 days", start: daysBefore(now, 90), end: localDate(now), order: "newest" },
  ];
  return all
    .map((w) => ({ ...w, start: w.start < scope.incorporatedAfter ? scope.incorporatedAfter : w.start }))
    .filter((w) => w.start <= w.end);
}

// Anything that isn't today's cursor shape (such as the old forward walk's)
// starts both windows afresh.
export function startCursor(raw: unknown): ChCursor {
  const parsed = chCursor.safeParse(raw);
  if (parsed.success) return parsed.data;
  const empty = (): WindowCursor => ({ done: [], partial: {} });
  return { firstAccounts: empty(), recent: empty() };
}

type Search = (day: string, startIndex: number, size: number) => Promise<{ items: AdvancedSearchItem[]; hits: number }>;

// Reads one window day by day in its order, skipping days already read, until
// `limit` items.
export async function walkWindow(
  search: Search,
  w: FetchWindow,
  cursor: WindowCursor,
  limit: number,
  today: string,
): Promise<{ items: AdvancedSearchItem[]; cursor: WindowCursor }> {
  const inWindow = (d: string) => d >= w.start && d <= w.end;
  const done = new Set(cursor.done.filter(inWindow));
  const partial: Record<string, number> = Object.fromEntries(Object.entries(cursor.partial).filter(([d]) => inWindow(d)));
  const items: AdvancedSearchItem[] = [];

  const oldestFirst = w.order === "oldest";
  const step = oldestFirst ? nextDay : previousDay;
  for (let d = oldestFirst ? w.start : w.end; inWindow(d) && items.length < limit; d = step(d)) {
    if (done.has(d)) continue;
    let index = partial[d] ?? 0;
    for (;;) {
      const size = Math.min(PAGE, limit - items.length);
      const page = await search(d, index, size);
      items.push(...page.items);
      index += page.items.length;
      const exhausted = page.items.length < size || index >= page.hits;
      if (exhausted && d !== today) {
        // Today isn't over, so it's never marked done: later registrations
        // are picked up from where this run stopped.
        done.add(d);
        delete partial[d];
      } else {
        partial[d] = index;
      }
      if (exhausted || items.length >= limit) break;
    }
  }
  return { items, cursor: { done: [...done].sort(), partial } };
}

export async function fetchCompanies(
  ctx: FetchCtx<CompaniesHouseScope>,
  client: CompaniesHouseClient = createCompaniesHouseClient(ctx.apiKey ?? ""),
  now = new Date(),
): Promise<{ items: AdvancedSearchItem[]; cursor: ChCursor }> {
  const { scope, limit } = ctx;
  const today = localDate(now);
  const cursor = startCursor(ctx.cursor);
  const search: Search = async (d, startIndex, size) => {
    const page = await client.advancedSearch({
      location: scope.location,
      incorporatedFrom: d,
      incorporatedTo: d,
      sicCodes: scope.sicCodes.length ? scope.sicCodes : undefined,
      companyType: scope.companyType,
      size,
      startIndex,
    });
    // Companies House answers 404 when a day has no matches.
    return { items: page?.items ?? [], hits: page?.hits ?? 0 };
  };

  const windows = fetchWindows(scope, now);
  const byKey = new Map(windows.map((w) => [w.key, w]));
  const counts: Partial<Record<WindowKey, number>> = {};
  const items: AdvancedSearchItem[] = [];

  async function read(key: WindowKey, budget: number) {
    const w = byKey.get(key);
    if (!w || budget <= 0) return;
    const result = await walkWindow(search, w, cursor[key], budget, today);
    cursor[key] = result.cursor;
    items.push(...result.items);
    counts[key] = (counts[key] ?? 0) + result.items.length;
  }

  // About 70/30; whatever one window can't fill goes to the other.
  await read("firstAccounts", byKey.has("recent") ? Math.round(limit * FIRST_ACCOUNTS_SHARE) : limit);
  await read("recent", limit - items.length);
  await read("firstAccounts", limit - items.length);

  const parts = windows.filter((w) => counts[w.key]).map((w) => `${counts[w.key]} ${w.label}`);
  if (parts.length) ctx.log(`Fetched ${parts.join(", ")}`);
  return { items, cursor };
}
