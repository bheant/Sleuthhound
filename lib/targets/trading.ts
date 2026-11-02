import type { TradingCheck } from "@/lib/ai/schemas";

// A target's saved trading check, in attributes.trading. Read by the review,
// the panel and the spend cap.

export type SavedTrading = TradingCheck & { checked_at: string; by: string; model: string; cost_gbp: number };

export function tradingOf(attributes: Record<string, unknown> | null | undefined): SavedTrading | null {
  const v = attributes?.trading as SavedTrading | undefined;
  return v && typeof v.trading === "string" ? v : null;
}

/** A trading check needs the company to be at least this old: newer ones rarely have a web presence yet. */
export const TRADING_CHECK_MIN_DAYS = 90;

export function oldEnoughForTradingCheck(incorporatedOn: string | null, now = new Date()): boolean {
  if (!incorporatedOn) return false;
  return now.getTime() - new Date(incorporatedOn).getTime() >= TRADING_CHECK_MIN_DAYS * 86_400_000;
}
