import { getBusinessName } from "@/lib/business/store";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { estimateCostGbp } from "@/lib/ai/cost";
import { researchPrompt, reviewPrompt, reviewSystem, type ReviewSubject } from "@/lib/ai/prompts";
import { defaultAiName, getModel, type ResolvedModel } from "@/lib/ai/provider";
import { addSpend, searchCallsIn, spendOf, type Spend } from "@/lib/ai/usage";
import { ReviewDraft, toReview, type Review } from "@/lib/ai/schemas";
import { db, schema } from "@/lib/db";
import type { Target } from "@/lib/db/schema";
import { domainOf } from "@/lib/ontology/names";
import { getSetting, STARTER_IDEAL_CLIENT } from "@/lib/settings";
import type { RunContext } from "./context";
import { isAuthError, KeyRejectedError, plainReason, StopRunError } from "./errors";
import { idealSicPrefixes } from "./industries";
import { mapLimit } from "./pool";
import { runTradingChecks } from "./trading";
import { reviewCandidates, reviewContext } from "./review-input";

// The AI review step: up to review_cap_per_run unreviewed targets, picked by
// pre-score, three at a time. Web research runs only for companies the first,
// register-only pass scores RESEARCH_FROM or more.

const PARALLEL = 3;
const RESEARCH_FROM = 60;

export async function research(ai: ResolvedModel, subject: ReviewSubject, maxSearches: number) {
  const result = await generateText({
    model: ai.model,
    tools: ai.tools,
    providerOptions: ai.searchOptions,
    prompt: researchPrompt(subject, maxSearches),
    maxOutputTokens: 2000,
  });
  const urls = [
    ...new Set(
      result.sources.flatMap((s) => (s.sourceType === "url" ? [s.url] : [])).filter((u) => /^https?:\/\//.test(u)),
    ),
  ];
  return { notes: result.text, urls, spend: spendOf(result.totalUsage, searchCallsIn(result.steps)) };
}

export function saveReview(target: Target, review: Review, ai: ResolvedModel, spend: Spend, costGbp: number, runId: string | null) {
  db.transaction((tx) => {
    tx.insert(schema.reviews)
      .values({
        targetId: target.id,
        score: review.score,
        summary: review.summary,
        whatTheyDo: review.what_they_do,
        whyFit: review.why_fit,
        whyNow: review.why_now,
        suggestedReply: review.suggested_reply,
        possibleCompanyName: review.possible_company_name,
        sources: review.sources,
        provider: ai.provider,
        model: ai.modelId,
        inputTokens: spend.inputTokens,
        outputTokens: spend.outputTokens,
        costGbp,
        runId,
      })
      .run();
    // A website the research found becomes the target's URL if it has none.
    if (review.website && target.kind === "company" && !target.url) {
      tx.update(schema.targets)
        .set({ url: review.website, domain: target.domain ?? domainOf(review.website) })
        .where(eq(schema.targets.id, target.id))
        .run();
    }
  });
}

type Context = ReturnType<typeof reviewContext>;
type Research = Awaited<ReturnType<typeof research>>;

// One structured review call, with research notes when there are any.
async function score(ai: ResolvedModel, context: Context, business: string | null, idealClient: string, found: Research | null) {
  const result = await generateText({
    model: ai.model,
    system: reviewSystem(business),
    prompt: reviewPrompt({
      today: new Date().toISOString().slice(0, 10),
      idealClient,
      ...context,
      research: found ? { notes: found.notes, urls: found.urls } : null,
    }),
    output: Output.object({ schema: ReviewDraft }),
    maxOutputTokens: 4000,
  });
  const trading = context.subject.trading;
  const allowed = new Set([
    ...(found?.urls ?? []),
    ...(context.subject.sourceUrl ? [context.subject.sourceUrl] : []),
    ...(trading?.sources ?? []),
    ...(trading?.website ? [trading.website] : []),
  ]);
  return { review: toReview(result.output, allowed), spend: spendOf(result.totalUsage) };
}

export type Assessment = { review: Review; spend: Spend; costGbp: number; researched: boolean; researchFailed: boolean };

// Two passes, to spend on web search only where it might matter: every target
// is scored from register data first, and companies scoring RESEARCH_FROM or
// more are then researched on the web and scored again. Saves nothing.
export async function assess(workspaceId: string, ai: ResolvedModel, target: Target, idealClient: string): Promise<Assessment> {
  const context = reviewContext(workspaceId, target);
  const business = getBusinessName(workspaceId);
  const first = await score(ai, context, business, idealClient, null);
  let { review, spend } = first;
  let researched = false;
  let researchFailed = false;

  // TODO(share allotments): fetch filing history (GET /company/{n}/filing-history)
  // only for companies scoring RESEARCH_FROM or more here, add a share_allotment
  // signal for a recent SH01, and pass it to the second pass. Not fetched for
  // every company: it would double the Companies House requests per run.
  const searching = Object.keys(ai.tools).length > 0 && target.kind === "company";
  if (searching && first.review.score >= RESEARCH_FROM) {
    try {
      const found = await research(ai, context.subject, getSetting(workspaceId, "max_searches_per_review"));
      const second = await score(ai, context, business, idealClient, found);
      review = second.review;
      spend = addSpend(addSpend(spend, found.spend), second.spend);
      researched = true;
    } catch (error) {
      // The first-pass review stands when research fails.
      if (isAuthError(error)) throw error;
      researchFailed = true;
    }
  }
  return { review, spend, costGbp: estimateCostGbp({ modelId: ai.modelId, ...spend }), researched, researchFailed };
}

// One review row is saved, carrying the cost of both passes.
async function reviewOne(run: RunContext, ai: ResolvedModel, target: Target, idealClient: string) {
  const result = await assess(run.workspaceId, ai, target, idealClient);
  if (result.researchFailed) run.counts.researchFailed++;
  saveReview(target, result.review, ai, result.spend, result.costGbp, run.runId);
  run.counts.reviewCostGbp += result.costGbp;
  return result;
}

export async function reviewTargets(run: RunContext): Promise<void> {
  const cap = getSetting(run.workspaceId, "review_cap_per_run");
  const threshold = getSetting(run.workspaceId, "score_threshold");
  const ideal = getSetting(run.workspaceId, "ideal_client").text.trim() || STARTER_IDEAL_CLIENT;

  let ai: ResolvedModel;
  try {
    ai = getModel("review", run.workspaceId);
  } catch (error) {
    // getModel's messages are written for the user: "Claude isn't connected…"
    throw new StopRunError(defaultAiName(run.workspaceId), error instanceof Error ? error.message : "The AI isn’t set up.");
  }

  const prefixes = await idealSicPrefixes(run, ideal);
  const picked = reviewCandidates(run.workspaceId, cap, prefixes, run.sourceId, run.priorityIds);
  const targets = await runTradingChecks(run, ai, picked).catch((error) => {
    if (isAuthError(error)) throw new KeyRejectedError(ai.provider);
    run.log(ai.name, `Trading checks stopped (${ai.vendor} ${plainReason(error)}); reviews go ahead without them`, "error");
    return picked;
  });
  if (targets.length === 0) {
    run.log(ai.name, "Nothing new to review");
    run.note(3, "nothing new");
    return;
  }

  let done = 0;
  let rejected = false;
  run.progress(0, targets.length);
  await mapLimit(targets, PARALLEL, async (target) => {
    if (rejected) return;
    const started = Date.now();
    try {
      const { review, researched } = await reviewOne(run, ai, target, ideal);
      run.counts.reviewed++;
      if (researched) run.counts.researched++;
      if (review.score >= threshold) run.counts.matches++;
      run.counts.reviewMs += Date.now() - started;
    } catch (error) {
      if (isAuthError(error)) {
        rejected = true;
        return;
      }
      run.log(ai.name, `Couldn’t review ${target.name}: ${ai.vendor} ${plainReason(error)}`, "error");
    }
    run.progress(++done, targets.length);
  });
  if (rejected) throw new KeyRejectedError(ai.provider);

  const { reviewed, researched, matches, researchFailed } = run.counts;
  const web = researched ? `, ${researched} researched on the web` : "";
  run.log(ai.name, `${reviewed} reviewed${web}, ${matches} scored ${threshold} or more`);
  if (researchFailed) {
    run.log(ai.name, `Web research failed for ${researchFailed}, so their first review stands`, "error");
  }
  run.note(3, `${matches} scored ${threshold} or more`);
}
