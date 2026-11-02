import { describe, expect, it } from "vitest";
import { cleanSicPrefixes } from "@/lib/ai/schemas";
import { matchesIndustry, preScore, rankByPreScore, type PreScoreInput } from "./prescore";

const now = new Date("2026-10-19T12:00:00Z");
// Nothing scores: wrong industry, 2 years old, nothing due, no filings of note.
const base: PreScoreInput = {
  sicCodes: [],
  incorporatedOn: "2024-10-01",
  nextDue: "2027-07-31",
  firstAccountsOverdue: false,
  overdue: false,
  fundingAt: null,
  allotmentAt: null,
  backingAt: null,
  movedFromSharedAddress: false,
  sharedAddress: false,
  newestSignal: null,
};
const score = (over: Partial<PreScoreInput>, prefixes: string[] = []) => preScore({ ...base, ...over }, prefixes, now);
// A software company, so funding rows count (2 points for the industry).
const soft: Partial<PreScoreInput> = { sicCodes: ["62012"] };

describe("preScore", () => {
  it("starts at zero", () => {
    expect(score({})).toBe(0);
  });

  it("gives two points for an industry match", () => {
    expect(matchesIndustry(["62012"], ["62"])).toBe(true);
    expect(matchesIndustry(["47910"], ["62", "73110"])).toBe(false);
    expect(score({ sicCodes: ["62012"] }, ["62"])).toBe(2);
  });

  it("gives four points for a funding round in the last 12 months, and nothing for an older one", () => {
    expect(score({ ...soft, fundingAt: "2026-09-03", allotmentAt: "2026-09-03" }, ["62"])).toBe(6);
    expect(score({ ...soft, fundingAt: "2025-06-01" }, ["62"])).toBe(2);
  });

  it("gives three points for a share allotment in the last 12 months, only without a funding round", () => {
    expect(score({ ...soft, allotmentAt: "2026-01-30" }, ["62"])).toBe(5);
    expect(score({ ...soft, allotmentAt: "2026-01-30", fundingAt: "2026-01-30" }, ["62"])).toBe(6);
    expect(score({ ...soft, allotmentAt: "2025-01-30" }, ["62"])).toBe(2);
  });

  it("gives a point for a corporate shareholder or new articles in the last 12 months", () => {
    expect(score({ ...soft, backingAt: "2026-03-04" }, ["62"])).toBe(3);
    expect(score({ ...soft, backingAt: "2025-03-04" }, ["62"])).toBe(2);
  });

  it("counts funding only when the industry matches the ideal client", () => {
    const funded = { fundingAt: "2026-09-03", allotmentAt: "2026-09-03", backingAt: "2026-08-20" };
    expect(score({ ...funded, sicCodes: ["64209"] }, ["62"])).toBe(0);
    expect(score({ ...funded, sicCodes: ["62012"] }, ["62"])).toBe(7);
    expect(score({ allotmentAt: "2026-01-30", sicCodes: ["68209"] }, ["62"])).toBe(0);
  });

  it("gives a point for a deadline within 90 days or overdue first accounts, but none for a late confirmation alone", () => {
    expect(score({ nextDue: "2026-12-31" })).toBe(1);
    expect(score({ nextDue: "2027-03-31" })).toBe(0);
    expect(score({ firstAccountsOverdue: true, overdue: true })).toBe(1);
    expect(score({ overdue: true })).toBe(0);
  });

  it("gives a point to companies under 24 months old", () => {
    expect(score({ incorporatedOn: "2025-06-01" })).toBe(1);
    expect(score({ incorporatedOn: "2024-10-01" })).toBe(0);
  });

  it("gives a point for moving away from a formation agent or shared address", () => {
    expect(score({ movedFromSharedAddress: true })).toBe(1);
  });

  it("takes two points from a shared address with an overdue filing and no allotment", () => {
    expect(score({ sharedAddress: true, overdue: true })).toBe(-2);
    expect(score({ sharedAddress: true })).toBe(0);
    expect(score({ sharedAddress: true, overdue: true, allotmentAt: "2023-01-01" })).toBe(0);
  });

  it("ranks a funded startup above an overdue shell in the right industry", () => {
    const funded = { ...base, id: "funded", sicCodes: ["47990"], fundingAt: "2026-09-03", allotmentAt: "2026-09-03" };
    const shell = { ...base, id: "shell", sicCodes: ["47910"], sharedAddress: true, overdue: true, firstAccountsOverdue: true, incorporatedOn: "2025-01-01" };
    // Shell: 2 industry + 1 overdue first accounts + 1 young - 2 = 2. Funded: 2 industry + 4.
    expect(rankByPreScore([shell, funded], ["47"], now).map((x) => x.id)).toEqual(["funded", "shell"]);
  });

  it("breaks ties by newest signal, then keeps input order", () => {
    const a = { ...base, id: "a", newestSignal: "2025-01-01" };
    const b = { ...base, id: "b", sicCodes: ["62020"], newestSignal: "2024-10-01" };
    const c = { ...base, id: "c", newestSignal: "2026-01-01" };
    const d = { ...base, id: "d", newestSignal: "2026-01-01" };
    expect(rankByPreScore([a, b, c, d], ["62"], now).map((x) => x.id)).toEqual(["b", "c", "d", "a"]);
  });
});

describe("cleanSicPrefixes", () => {
  it("keeps 2 to 5 digit prefixes, once each", () => {
    expect(cleanSicPrefixes(["62", " 58290 ", "62", "7311a", "1", "123456"])).toEqual(["62", "58290"]);
  });
});
