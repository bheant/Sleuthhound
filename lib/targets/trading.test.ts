import { describe, expect, it } from "vitest";
import { oldEnoughForTradingCheck } from "./trading";

describe("oldEnoughForTradingCheck", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("checks companies 90 days old or more, never brand-new or undated ones", () => {
    expect(oldEnoughForTradingCheck("2026-10-20", now)).toBe(false);
    expect(oldEnoughForTradingCheck("2026-07-23", now)).toBe(false);
    expect(oldEnoughForTradingCheck("2026-07-22", now)).toBe(true);
    expect(oldEnoughForTradingCheck("2025-01-20", now)).toBe(true);
    expect(oldEnoughForTradingCheck(null, now)).toBe(false);
  });
});
