import { describe, expect, it } from "vitest";
import { discardCountsLine, reasonForKey, reasonText } from "./reasons";

describe("reasonForKey", () => {
  it("maps 1 to 5 to the reasons in order", () => {
    expect(reasonForKey("1")).toBe("not_trading");
    expect(reasonForKey("5")).toBe("other");
    expect(reasonForKey("6")).toBeNull();
    expect(reasonForKey("0")).toBeNull();
    expect(reasonForKey("n")).toBeNull();
  });
});

describe("discardCountsLine", () => {
  it("lists counts above zero in reason order, then those with no reason", () => {
    const line = discardCountsLine(["too_small", "not_trading", null, "not_trading", "wrong_industry"]);
    expect(line).toBe("5 discarded: 2 not trading, 1 too small, 1 wrong industry, 1 with no reason");
  });

  it("says just the total when nothing is discarded", () => {
    expect(discardCountsLine([])).toBe("0 discarded");
  });
});

describe("reasonText", () => {
  it("never falls back to anything but the user's words", () => {
    expect(reasonText(null, null)).toBe("no reason given");
    expect(reasonText("has_accountant", null)).toBe("already has an accountant");
    expect(reasonText("other", " Holding company for a restaurant ")).toBe("other: Holding company for a restaurant");
  });
});
