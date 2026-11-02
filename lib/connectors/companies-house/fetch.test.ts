import { describe, expect, it } from "vitest";
import type { CompaniesHouseClient } from "./client";
import type { CompaniesHouseScope } from "./connector";
import { fetchCompanies, fetchWindows, previousDay, startCursor, walkWindow } from "./fetch";
import type { AdvancedSearchParams } from "./types";

const scope: CompaniesHouseScope = {
  location: "London",
  sicCodes: [],
  incorporatedAfter: "2024-01-01",
  companyType: "ltd",
  signals: [],
};

const now = new Date(2026, 9, 19, 12);

// A fake register: each day has a fixed number of companies.
function fakeSearch(perDay: Record<string, number>) {
  const calls: Array<{ day: string; startIndex: number }> = [];
  const search = async (day: string, startIndex: number, size: number) => {
    calls.push({ day, startIndex });
    const hits = perDay[day] ?? 0;
    const n = Math.max(0, Math.min(size, hits - startIndex));
    return {
      hits,
      items: Array.from({ length: n }, (_, i) => ({ company_number: `${day}-${startIndex + i}`, company_name: "X LTD" })),
    };
  };
  return { search, calls };
}

const w = { key: "recent" as const, label: "in the last 90 days", start: "2026-10-15", end: "2026-10-19", order: "newest" as const };
const empty = () => ({ done: [], partial: {} });

describe("fetchWindows", () => {
  it("covers 15 to 21 months ago and the last 90 days", () => {
    expect(fetchWindows(scope, now)).toMatchObject([
      { key: "firstAccounts", start: "2025-01-19", end: "2025-07-19", order: "oldest" },
      { key: "recent", start: "2026-07-21", end: "2026-10-19", order: "newest" },
    ]);
  });

  it("clips windows to the scope's start date", () => {
    const [first] = fetchWindows({ ...scope, incorporatedAfter: "2025-05-01" }, now);
    expect(first.start).toBe("2025-05-01");
    expect(fetchWindows({ ...scope, incorporatedAfter: "2026-09-01" }, now).map((x) => x.key)).toEqual(["recent"]);
  });
});

describe("walkWindow", () => {
  it("reads newest day first and pages within a day", async () => {
    const { search, calls } = fakeSearch({ "2026-10-19": 2, "2026-10-18": 3, "2026-10-17": 4 });
    const r = await walkWindow(search, w, empty(), 6, "2026-10-19");
    expect(calls.map((c) => c.day)).toEqual(["2026-10-19", "2026-10-18", "2026-10-17"]);
    expect(r.items).toHaveLength(6);
    // Today isn't marked done; the day it stopped in records where.
    expect(r.cursor).toEqual({ done: ["2026-10-18"], partial: { "2026-10-19": 2, "2026-10-17": 1 } });
  });

  it("skips days already read and resumes part-read days", async () => {
    const { search, calls } = fakeSearch({ "2026-10-19": 3, "2026-10-18": 3, "2026-10-17": 4, "2026-10-16": 1 });
    const cursor = { done: ["2026-10-18"], partial: { "2026-10-19": 2, "2026-10-17": 1 } };
    const r = await walkWindow(search, w, cursor, 10, "2026-10-19");
    expect(calls).toEqual([
      { day: "2026-10-19", startIndex: 2 },
      { day: "2026-10-17", startIndex: 1 },
      { day: "2026-10-16", startIndex: 0 },
      { day: "2026-10-15", startIndex: 0 },
    ]);
    expect(r.items.map((i) => i.company_number)).toEqual([
      "2026-10-19-2",
      "2026-10-17-1",
      "2026-10-17-2",
      "2026-10-17-3",
      "2026-10-16-0",
    ]);
  });

  it("reads the first-accounts window oldest day first", async () => {
    const { search, calls } = fakeSearch({ "2025-01-19": 2, "2025-01-20": 5 });
    const first = { key: "firstAccounts" as const, label: "", start: "2025-01-19", end: "2025-07-19", order: "oldest" as const };
    const r = await walkWindow(search, first, empty(), 4, "2026-10-19");
    expect(calls.map((c) => c.day)).toEqual(["2025-01-19", "2025-01-20"]);
    expect(r.cursor).toEqual({ done: ["2025-01-19"], partial: { "2025-01-20": 2 } });
  });

  it("forgets days that have slid out of the window", async () => {
    const { search } = fakeSearch({});
    const r = await walkWindow(search, w, { done: ["2026-01-01"], partial: { "2026-01-02": 5 } }, 10, "2026-10-19");
    expect(r.cursor.done).not.toContain("2026-01-01");
    expect(r.cursor.partial).not.toHaveProperty("2026-01-02");
  });
});

describe("fetchCompanies", () => {
  function client(perDay: Record<string, number>) {
    const { search } = fakeSearch(perDay);
    return {
      advancedSearch: async (p: AdvancedSearchParams) => {
        const r = await search(p.incorporatedFrom ?? "", p.startIndex ?? 0, p.size ?? 200);
        return r.hits ? r : null;
      },
    } as unknown as CompaniesHouseClient;
  }
  const ctx = (limit: number, cursor: unknown = null) => ({ workspaceId: "w", sourceId: "s", scope, apiKey: "k", cursor, limit, log: () => {} });

  it("splits about 70/30 between the windows", async () => {
    const r = await fetchCompanies(ctx(100), client({ "2025-01-19": 500, "2026-10-19": 500 }), now);
    expect(r.items.filter((i) => i.company_number.startsWith("2025"))).toHaveLength(70);
    expect(r.items.filter((i) => i.company_number.startsWith("2026"))).toHaveLength(30);
  });

  it("gives what one window can't fill to the other", async () => {
    const r = await fetchCompanies(ctx(100), client({ "2025-01-19": 500, "2026-10-19": 10 }), now);
    expect(r.items).toHaveLength(100);
    expect(r.items.filter((i) => i.company_number.startsWith("2025"))).toHaveLength(90);
  });

  it("starts afresh from the old forward-walk cursor", () => {
    expect(startCursor({ from: "2024-10-21", startIndex: 161 })).toEqual({
      firstAccounts: { done: [], partial: {} },
      recent: { done: [], partial: {} },
    });
  });

  it("counts days back across month ends", () => {
    expect(previousDay("2026-11-01")).toBe("2026-10-31");
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
  });
});

describe("locationFilter", () => {
  const item = (locality: string, line: string) => ({
    company_number: "1",
    company_name: "X LTD",
    registered_office_address: { address_line_1: line, locality, postal_code: "ST4 5BA" },
  });

  it("drops addresses that only mention the place in a street name", async () => {
    const { locationFilter } = await import("./connector");
    expect(locationFilter(item("Stoke-On-Trent", "628a London Road"), scope)).toMatchObject({ keep: false });
    expect(locationFilter(item("London", "81 Katherine Road"), scope)).toEqual({ keep: true });
  });
});
