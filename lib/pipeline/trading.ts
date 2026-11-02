import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { estimateCostGbp } from "@/lib/ai/cost";
import { tradingCheckPrompt, type ReviewSubject } from "@/lib/ai/prompts";
import type { ResolvedModel } from "@/lib/ai/provider";
import { toTradingCheck, TradingCheckDraft, type TradingCheck } from "@/lib/ai/schemas";
import { db, schema } from "@/lib/db";
import type { Target } from "@/lib/db/schema";
import { domainOf } from "@/lib/ontology/names";
import { getSetting } from "@/lib/settings";
import { oldEnoughForTradingCheck, tradingOf, type SavedTrading } from "@/lib/targets/trading";
import type { RunContext } from "./context";
import { isAuthError, plainReason } from "./errors";
import { mapLimit } from "./pool";
import { searchCallsIn, spendOf } from "@/lib/ai/usage";
import { subjectOf } from "./review-input";

// The trading check: before the reviews, the top
// companies by pre-score that have no known website get one web search for
// signs they trade. The website goes on the target; the result goes in
// attributes.trading, with its cost, which counts against the source's spend
// cap like a review's.

const t = schema.targets;
const PARALLEL = 3;

/** One check, saving nothing. */
export async function checkTrading(ai: ResolvedModel, subject: ReviewSubject): Promise<{ check: TradingCheck; costGbp: number }> {
  const search = ai.searchWith(1);
  const result = await generateText({
    model: ai.model,
    tools: search.tools,
    providerOptions: search.providerOptions,
    prompt: tradingCheckPrompt(subject),
    output: Output.object({ schema: TradingCheckDraft }),
    maxOutputTokens: 1500,
  });
  const urls = new Set(result.sources.flatMap((x) => (x.sourceType === "url" ? [x.url] : [])).filter((u) => /^https?:\/\//.test(u)));
  const spend = spendOf(result.totalUsage, searchCallsIn(result.steps));
  return { check: toTradingCheck(result.output, urls), costGbp: estimateCostGbp({ modelId: ai.modelId, ...spend }) };
}

export function saveTrading(target: Target, ai: ResolvedModel, check: TradingCheck, costGbp: number): SavedTrading {
  const saved: SavedTrading = { ...check, checked_at: new Date().toISOString(), by: ai.name, model: ai.modelId, cost_gbp: costGbp };
  const row = db.select({ attributes: t.attributes }).from(t).where(eq(t.id, target.id)).get();
  db.update(t)
    .set({
      attributes: { ...(row?.attributes ?? {}), trading: saved },
      ...(check.website && !target.url ? { url: check.website, domain: target.domain ?? domainOf(check.website) } : {}),
    })
    .where(eq(t.id, target.id))
    .run();
  return saved;
}

/**
 * Companies at least 90 days old without a website or an earlier check, in
 * the order given (pre-score order). Newer ones are reviewed without one.
 */
export function needsTradingCheck(targets: Target[], count: number, now = new Date()): Target[] {
  return targets
    .filter((x) => x.kind === "company" && !x.url && !tradingOf(x.attributes) && oldEnoughForTradingCheck(x.incorporatedOn, now))
    .slice(0, count);
}

/**
 * Checks up to trading_check_count of the candidates. Returns the targets as
 * they now are, with any website and result found, for the review to use.
 */
export async function runTradingChecks(run: RunContext, ai: ResolvedModel, candidates: Target[]): Promise<Target[]> {
  const count = getSetting(run.workspaceId, "trading_check_count");
  const due = needsTradingCheck(candidates, count);
  if (due.length === 0 || Object.keys(ai.searchWith(1).tools).length === 0) return candidates;

  const found = { yes: 0, no: 0, unclear: 0, websites: 0, failed: 0 };
  let lastReason = "";
  let authError: unknown = null;
  await mapLimit(due, PARALLEL, async (target) => {
    if (authError) return;
    try {
      const { check, costGbp } = await checkTrading(ai, subjectOf(target));
      saveTrading(target, ai, check, costGbp);
      run.counts.reviewCostGbp += costGbp;
      found[check.trading]++;
      if (check.website) found.websites++;
    } catch (error) {
      if (isAuthError(error)) authError = error;
      found.failed++;
      lastReason = plainReason(error);
    }
  });
  if (authError) throw authError;

  const checked = due.length - found.failed;
  const sites = found.websites ? `, ${found.websites} ${found.websites === 1 ? "website" : "websites"} found` : "";
  run.log(ai.name, `Trading check on ${checked}: ${found.yes} trading, ${found.no} not trading, ${found.unclear} unclear${sites}`);
  if (found.failed) run.log(ai.name, `${found.failed} trading checks failed (${ai.vendor} ${lastReason}); they're reviewed without one`, "error");

  // Reload the checked ones, so the review sees the website and the result.
  const ids = new Set(due.map((x) => x.id));
  return candidates.map((x) => (ids.has(x.id) ? (db.select().from(t).where(eq(t.id, x.id)).get() ?? x) : x));
}
