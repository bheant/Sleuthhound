// Estimated AI costs. Prices are each provider's list prices in US dollars as
// of October 2026 (short-context tier), converted at a fixed rate, so every
// figure the UI shows from here is labelled an estimate.

type Price = { inputPerM: number; outputPerM: number; searchUsd: number };

// Web search per call: Anthropic and OpenAI $10 per 1,000, xAI $5 per 1,000.
const ANTHROPIC_SEARCH = 0.01;
const OPENAI_SEARCH = 0.01;
const XAI_SEARCH = 0.005;

export const PRICES_USD: Record<string, Price> = {
  "claude-haiku-5-5": { inputPerM: 0.1, outputPerM: 0.5, searchUsd: ANTHROPIC_SEARCH },
  "claude-sonnet-5-5": { inputPerM: 2, outputPerM: 10, searchUsd: ANTHROPIC_SEARCH },
  "claude-opus-5-5": { inputPerM: 4, outputPerM: 20, searchUsd: ANTHROPIC_SEARCH },
  "gpt-6-luna": { inputPerM: 0.1, outputPerM: 0.5, searchUsd: OPENAI_SEARCH },
  "gpt-5.6-luna": { inputPerM: 0.2, outputPerM: 1.2, searchUsd: OPENAI_SEARCH },
  "gpt-6-sol": { inputPerM: 2, outputPerM: 10, searchUsd: OPENAI_SEARCH },
  "gpt-6.1-sol": { inputPerM: 2, outputPerM: 10, searchUsd: OPENAI_SEARCH },
  "gpt-6-astra": { inputPerM: 10, outputPerM: 50, searchUsd: OPENAI_SEARCH },
  "grok-4.3": { inputPerM: 1.25, outputPerM: 2.5, searchUsd: XAI_SEARCH },
  "grok-4.5": { inputPerM: 2, outputPerM: 6, searchUsd: XAI_SEARCH },
  "grok-4.6": { inputPerM: 2, outputPerM: 6, searchUsd: XAI_SEARCH },
  "grok-4.7": { inputPerM: 2, outputPerM: 6, searchUsd: XAI_SEARCH },
};

// An unknown model is priced like Sonnet, so estimates err high, not low.
const FALLBACK: Price = PRICES_USD["claude-sonnet-5-5"];

/** Fixed conversion for estimates. Not a live rate. */
export const USD_TO_GBP = 0.79;

export type UsageForCost = {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  webSearches?: number;
};

export function estimateCostGbp({ modelId, inputTokens, outputTokens, webSearches = 0 }: UsageForCost): number {
  const price = PRICES_USD[modelId] ?? FALLBACK;
  const usd =
    (inputTokens / 1_000_000) * price.inputPerM +
    (outputTokens / 1_000_000) * price.outputPerM +
    webSearches * price.searchUsd;
  return Math.round(usd * USD_TO_GBP * 1_000_000) / 1_000_000;
}

/** "£0.02", or "under £0.01" for the smallest amounts. */
export function formatGbp(amount: number): string {
  if (amount > 0 && amount < 0.005) return "under £0.01";
  return `£${amount.toFixed(2)}`;
}
