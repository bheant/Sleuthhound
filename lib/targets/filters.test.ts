import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  inTab,
  isNew,
  NO_FILTERS,
  filterChips,
  matchesQuery,
  passesFilters,
  removeChip,
  visibleItems,
  type Filters,
} from "./filters";
import { formatAge, industryLines, scoreStep, sectorOf, shortName } from "./format";
import type { WorkspaceItem } from "./types";

const NOW = new Date("2026-10-19T12:00:00").getTime();

function item(over: Partial<WorkspaceItem>): WorkspaceItem {
  return {
    id: "x",
    name: "Northwind Labs Ltd",
    companyNumber: "14829301",
    score: 70,
    summary: "First accounts due May",
    whatTheyDo: null,
    whyFit: null,
    whyNow: null,
    sector: "Software",
    incorporatedOn: "2025-08-14",
    borough: "Hackney",
    postcode: null,
    lat: null,
    lng: null,
    placeId: null,
    addressLine: null,
    registeredOffice: null,
    industries: [],
    accountsDue: null,
    confirmation: null,
    directors: [{ id: "p1", name: "Jo Okafor", email: null }],
    corporate: true,
    hubspotSentAt: null,
    resembles: [],
    placeCount: 0,
    tags: [],
    filings: [],
    raisedAt: null,
    skipped: null,
    trading: null,
    deadline: null,
    posts: [],
    sources: [],
    reviewedBy: "Claude",
    reviewedAt: "2026-10-19T14:03:00Z",
    runId: null,
    decision: null,
    decidedAt: null,
    reason: null,
    reasonNote: null,
    isDemo: false,
    ...over,
  };
}

describe("filters", () => {
  const f = (over: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...over });

  it("filters by score step and borough", () => {
    expect(passesFilters(item({ score: 75 }), f({ minScore: 70 }), NOW)).toBe(true);
    expect(passesFilters(item({ score: 65 }), f({ minScore: 70 }), NOW)).toBe(false);
    expect(passesFilters(item({ borough: "Hackney" }), f({ boroughs: ["Islington"] }), NOW)).toBe(false);
    expect(passesFilters(item({ borough: null }), f({ boroughs: ["Islington"] }), NOW)).toBe(false);
  });

  it("filters overdue and due in the next three months", () => {
    const overdue = item({ deadline: { dueAt: "2026-07-21", label: "Accounts overdue", overdue: true } });
    const soon = item({ deadline: { dueAt: "2026-12-01", label: "Accounts due", overdue: false } });
    const later = item({ deadline: { dueAt: "2027-05-14", label: "First accounts due", overdue: false } });
    expect(passesFilters(overdue, f({ deadline: "overdue" }), NOW)).toBe(true);
    expect(passesFilters(soon, f({ deadline: "overdue" }), NOW)).toBe(false);
    expect(passesFilters(soon, f({ deadline: "soon" }), NOW)).toBe(true);
    expect(passesFilters(later, f({ deadline: "soon" }), NOW)).toBe(false);
    expect(passesFilters(overdue, f({ deadline: "soon" }), NOW)).toBe(false);
    expect(passesFilters(item({}), f({ deadline: "soon" }), NOW)).toBe(false);
  });

  it("matches the list filter against name, number and directors", () => {
    expect(matchesQuery(item({}), "northwind")).toBe(true);
    expect(matchesQuery(item({}), "1482")).toBe(true);
    expect(matchesQuery(item({}), "okafor")).toBe(true);
    expect(matchesQuery(item({}), "quill")).toBe(false);
    expect(matchesQuery(item({}), "  ")).toBe(true);
  });

  it("splits items into tabs and sorts by score", () => {
    const items = [
      item({ id: "a", score: 61 }),
      item({ id: "b", score: 92 }),
      item({ id: "c", score: 55 }),
      item({ id: "d", score: 80, decision: "kept" }),
      item({ id: "e", score: 40, decision: "discarded" }),
    ];
    const ids = (tab: "new" | "kept" | "discarded") => visibleItems(items, tab, 60, NO_FILTERS, "", NOW).map((i) => i.id);
    expect(ids("new")).toEqual(["b", "a"]);
    expect(ids("kept")).toEqual(["d"]);
    expect(ids("discarded")).toEqual(["e"]);
  });

  it("turns active filters into chips and back", () => {
    const active = f({ minScore: 70, deadline: "soon", boroughs: ["Hackney", "Islington"] });
    expect(activeFilterCount(active)).toBe(4);
    expect(filterChips(active).map((c) => c.label)).toEqual([
      "70 and above",
      "Due in the next 3 months",
      "Hackney",
      "Islington",
    ]);
    expect(removeChip(active, "borough:Hackney").boroughs).toEqual(["Islington"]);
    expect(removeChip(active, "score").minScore).toBeNull();
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
  });
});

describe("format", () => {
  const now = new Date("2026-10-19T12:00:00");

  it("writes company age as years and months", () => {
    expect(formatAge("2025-08-14", now)).toBe("1 yr 2 mo");
    expect(formatAge("2026-01-02", now)).toBe("9 mo");
    expect(formatAge("2024-10-19", now)).toBe("2 yr");
    expect(formatAge("2026-10-01", now)).toBe("Under 1 mo");
    expect(formatAge("2025-10-20", now)).toBe("11 mo");
    expect(formatAge(null, now)).toBeNull();
  });

  it("names the sector from SIC codes", () => {
    expect(sectorOf(["62012"])).toBe("Software");
    expect(sectorOf(["47910"])).toBe("E-commerce");
    expect(sectorOf(["99999", "73110"])).toBe("Agency");
    expect(sectorOf(["99999"])).toBeNull();
    expect(sectorOf(null)).toBeNull();
  });

  it("lists industries with their codes", () => {
    expect(industryLines(["62012"])).toEqual(["Business and domestic software development (62012)"]);
    expect(industryLines(["43390"])).toEqual(["SIC 43390"]);
  });

  it("steps scores and shortens names", () => {
    expect([92, 79, 60, 59].map(scoreStep)).toEqual(["high", "mid", "low", "under"]);
    expect(shortName("Northwind Labs Ltd")).toBe("Northwind Labs");
    expect(shortName("Quill & Co Limited")).toBe("Quill & Co");
  });
});

describe("raised money", () => {
  const now = new Date("2026-10-20T12:00:00Z").getTime();
  it("keeps companies with an allotment or funding round in the last 12 months", () => {
    const recent = item({ id: "r", raisedAt: "2026-02-01" });
    const old = item({ id: "o", raisedAt: "2025-06-01" });
    const none = item({ id: "n", raisedAt: null });
    const shown = [recent, old, none].filter((i) => passesFilters(i, { ...NO_FILTERS, raised: true }, now)).map((i) => i.id);
    expect(shown).toEqual(["r"]);
    expect(filterChips({ ...NO_FILTERS, raised: true })).toEqual([{ key: "raised", label: "Raised money" }]);
  });
});

describe("skipped companies", () => {
  it("leave the New tab once they're skipped, but stay where a decision put them", () => {
    expect(isNew(item({ skipped: "proposed for strike-off on 22 Sep 2026" }), 60)).toBe(false);
    expect(inTab(item({ skipped: "filed dormant accounts", decision: "kept" }), "kept", 60)).toBe(true);
  });
});
