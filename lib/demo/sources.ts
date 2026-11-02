import { and, eq, inArray } from "drizzle-orm";
import { companiesHouseConnector } from "@/lib/connectors/companies-house/connector";
import { hackerNewsConnector } from "@/lib/connectors/hacker-news/connector";
import { redditConnector } from "@/lib/connectors/reddit/connector";
import { schema, type Writer } from "@/lib/db";
import { emptyCounts } from "@/lib/pipeline/context";
import type { SourceConfig } from "@/lib/sources/config";

// The sample's sources, and one finished run that found its companies, so
// every page has something to show. Reddit waits for approval, as a real
// Reddit source would.

const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

function config(scope: unknown, schedule: SourceConfig["schedule"]): SourceConfig {
  return { scope: scope as SourceConfig["scope"], schedule, max_items: 200, spend_cap_gbp: 10, weight: "normal", describe_text: null };
}

export function seedSourcesAndRun(tx: Writer, workspaceId: string) {
  const s = schema.sources;
  const source = (connector: string, name: string, cfg: SourceConfig, status: "connected" | "awaiting_approval") => {
    const row = tx
      .insert(s)
      .values({
        workspaceId,
        connector,
        name,
        status,
        config: cfg,
        lastRunAt: status === "connected" ? ago(2) : null,
        nextRunAt: null,
        isDemo: 1,
      })
      .returning({ id: s.id })
      .get();
    tx.insert(schema.sourceVersions).values({ sourceId: row.id, version: 1, config: cfg }).run();
    return row.id;
  };
  const ch = source("companies_house", "New London companies", config(companiesHouseConnector.defaultScope(), "daily"), "connected");
  const hn = source("hacker_news", "Hacker News: bookkeeping", config(hackerNewsConnector.defaultScope(), "every_6_hours"), "connected");
  const reddit = source("reddit", "r/smallbusiness, r/UKPersonalFinance", config(redditConnector.defaultScope(), "every_6_hours"), "awaiting_approval");

  const t = schema.targets;
  tx.update(t).set({ firstSourceId: ch }).where(and(eq(t.workspaceId, workspaceId), eq(t.kind, "company"), eq(t.isClient, 0))).run();
  const sig = schema.signals;
  tx.update(sig).set({ sourceId: reddit }).where(and(eq(sig.type, "community_post"), eq(sig.url, "https://www.reddit.com/r/smallbusiness/"))).run();
  tx.update(sig).set({ sourceId: hn }).where(and(eq(sig.type, "community_post"), eq(sig.url, "https://news.ycombinator.com/"))).run();

  // The run: every company and conversation it "found", and a summary that
  // names the two best leads.
  const found = tx
    .select({ id: t.id, name: t.name, kind: t.kind, score: schema.reviews.score })
    .from(t)
    .innerJoin(schema.reviews, eq(schema.reviews.targetId, t.id))
    .where(and(eq(t.workspaceId, workspaceId), eq(t.isClient, 0), inArray(t.kind, ["company", "conversation"])))
    .all()
    .sort((a, b) => b.score - a.score);
  const companies = found.filter((f) => f.kind === "company");
  const [first, second] = companies;
  const counts = {
    ...emptyCounts(),
    steps: [`${companies.length} new companies`, `${found.length - companies.length} conversations`, `${found.length} reviewed`, "done"] as [string, string, string, string],
    scanned: 186,
    fetched: 186,
    newTargets: found.length,
    enriched: companies.length,
    reviewed: found.length,
    matches: found.filter((f) => f.score >= 60).length,
    newTargetIds: found.map((f) => f.id),
    sources: {
      [ch]: { fetched: 186, newTargets: companies.length },
      [hn]: { fetched: 12, newTargets: 1 },
    },
  };
  const summary = first && second
    ? `${first.name} and ${second.name} lead this sample run: both are young UK companies with no finance team yet.\n\nEverything here is made-up data. Create an account and add your own keys to find real leads.`
    : "Everything here is made-up data. Create an account and add your own keys to find real leads.";
  const run = tx
    .insert(schema.runs)
    .values({
      workspaceId,
      kind: "scheduled",
      status: "done",
      step: 4,
      counts,
      summary,
      summaryHighlights: [first?.id, second?.id].filter((x): x is string => Boolean(x)),
      queuedAt: ago(2.1),
      startedAt: ago(2.1),
      finishedAt: ago(2),
    })
    .returning({ id: schema.runs.id })
    .get();
  // Each lead counts towards the run that reviewed it.
  const ids = found.map((f) => f.id);
  if (ids.length) tx.update(schema.reviews).set({ runId: run.id }).where(inArray(schema.reviews.targetId, ids)).run();
}
