import type { LanguageModelUsage } from "ai";
import { z } from "zod";
import { WEB_SEARCH_TOOL } from "./provider";

// What an AI call used, for cost estimates: tokens and web searches.

export type Spend = { inputTokens: number; outputTokens: number; webSearches: number };

const rawUsage = z.object({ server_tool_use: z.object({ web_search_requests: z.number() }).optional() });

// Anthropic reports its searches in the raw usage; OpenAI and xAI only as
// provider-executed tool calls, so searchCalls counts those. The larger of the
// two is used, so a search is never counted twice.
export function spendOf(usage: LanguageModelUsage, searchCalls = 0): Spend {
  const raw = rawUsage.safeParse((usage as { raw?: unknown }).raw);
  const reported = raw.success ? (raw.data.server_tool_use?.web_search_requests ?? 0) : 0;
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    webSearches: Math.max(reported, searchCalls),
  };
}

type Step = { toolCalls: readonly { toolName: string; providerExecuted?: boolean }[] };

export function searchCallsIn(steps: readonly Step[]): number {
  return steps.flatMap((s) => s.toolCalls).filter((c) => c.providerExecuted && c.toolName === WEB_SEARCH_TOOL).length;
}

export const addSpend = (a: Spend, b: Spend): Spend => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  webSearches: a.webSearches + b.webSearches,
});
