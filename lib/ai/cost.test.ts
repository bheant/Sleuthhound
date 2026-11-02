import { describe, expect, it } from "vitest";
import { estimateCostGbp, formatGbp, USD_TO_GBP } from "./cost";

describe("estimateCostGbp", () => {
  it("prices tokens per million for a known model", () => {
    const gbp = estimateCostGbp({ modelId: "claude-haiku-5-5", inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(gbp).toBeCloseTo(0.6 * USD_TO_GBP, 6);
  });

  it("adds web searches at a cent each", () => {
    const withSearch = estimateCostGbp({ modelId: "claude-haiku-5-5", inputTokens: 0, outputTokens: 0, webSearches: 2 });
    expect(withSearch).toBeCloseTo(0.02 * USD_TO_GBP, 6);
  });

  it("prices each provider's models and searches at its own rates", () => {
    const grok = estimateCostGbp({ modelId: "grok-4.3", inputTokens: 1_000_000, outputTokens: 1_000_000, webSearches: 2 });
    expect(grok).toBeCloseTo((1.25 + 2.5 + 0.01) * USD_TO_GBP, 6);
    const gpt = estimateCostGbp({ modelId: "gpt-6-luna", inputTokens: 1_000_000, outputTokens: 0, webSearches: 1 });
    expect(gpt).toBeCloseTo((0.1 + 0.01) * USD_TO_GBP, 6);
  });

  it("prices an unknown model like Sonnet so estimates err high", () => {
    const unknown = estimateCostGbp({ modelId: "claude-new", inputTokens: 1_000_000, outputTokens: 0 });
    const sonnet = estimateCostGbp({ modelId: "claude-sonnet-5-5", inputTokens: 1_000_000, outputTokens: 0 });
    expect(unknown).toBe(sonnet);
  });
});

describe("formatGbp", () => {
  it("rounds to pence and calls tiny amounts what they are", () => {
    expect(formatGbp(0.0234)).toBe("£0.02");
    expect(formatGbp(0.001)).toBe("under £0.01");
    expect(formatGbp(0)).toBe("£0.00");
  });
});
