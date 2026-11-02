import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { formatTime } from "@/lib/format/time";
import { getSetting } from "@/lib/settings";
import { conversationItems } from "@/lib/targets/conversations";
import { tabItems } from "@/lib/targets/filters";
import type { WorkspaceItem } from "@/lib/targets/types";
import { workspaceItems } from "@/lib/targets/workspace";
import { homeServices, type ServiceItem } from "./services";
import { summaryParagraphs, type Segment } from "./summary-text";

// Everything Home shows below the welcome line: the day's figures, one bar
// per run with its leads split by decision, each run's summary with linked
// company names, and the sources line.

const r = schema.runs;
const MAX_BARS = 24;

export type RunBar = {
  id: string;
  /** "14:00" */
  time: string;
  /** Under the bar: "14", or "14:06" when two runs share an hour. */
  label: string;
  failed: boolean;
  total: number;
  kept: number;
  discarded: number;
  waiting: number;
};

export type RunSummaryView = { time: string; paragraphs: Segment[][] };

export type HomeFigures = {
  runsToday: number;
  found: number;
  keptToday: number;
  waiting: number;
  conversations: number;
};

export type HomeData = {
  hasFinishedRun: boolean;
  figures: HomeFigures;
  chart: { title: string; bars: RunBar[] };
  summaries: Record<string, RunSummaryView>;
  /** The last run that finished well: the summary Home opens on. */
  lastGoodId: string | null;
  latestFailed: boolean;
  nextRunAt: string | null;
  services: ServiceItem[];
};

type RunRow = typeof r.$inferSelect;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function at(run: RunRow): string {
  return run.startedAt ?? run.queuedAt;
}

function finishedRuns(workspaceId: string, from: Date, to: Date): RunRow[] {
  return db
    .select()
    .from(r)
    .where(
      and(
        eq(r.workspaceId, workspaceId),
        inArray(r.status, ["done", "failed"]),
        gte(r.queuedAt, from.toISOString()),
        lt(r.queuedAt, to.toISOString()),
      ),
    )
    .orderBy(asc(r.queuedAt))
    .all();
}

// Today's runs, or the last day that had any, so the chart is never empty
// while there is history to show.
function chartRuns(workspaceId: string, now: Date): { runs: RunRow[]; title: string; today: RunRow[] } {
  const today0 = startOfDay(now);
  const tomorrow = new Date(today0.getTime() + 86_400_000);
  const today = finishedRuns(workspaceId, today0, tomorrow);
  if (today.length > 0) return { runs: today.slice(-MAX_BARS), title: "Leads found per run today", today };

  const last = db
    .select({ queuedAt: r.queuedAt })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), inArray(r.status, ["done", "failed"])))
    .orderBy(desc(r.queuedAt))
    .get();
  if (!last) return { runs: [], title: "Leads found per run today", today };
  const day0 = startOfDay(new Date(last.queuedAt));
  const runs = finishedRuns(workspaceId, day0, new Date(day0.getTime() + 86_400_000)).slice(-MAX_BARS);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(day0);
  return { runs, title: `Leads found per run on ${day}`, today };
}

function bars(runs: RunRow[], items: WorkspaceItem[], threshold: number): RunBar[] {
  const hours = runs.map((run) => formatTime(at(run)).slice(0, 2));
  const shared = new Set(hours).size < hours.length;
  return runs.map((run) => {
    const leads = items.filter((i) => i.runId === run.id && i.score >= threshold);
    const time = formatTime(at(run));
    return {
      id: run.id,
      time,
      label: shared ? time : time.slice(0, 2),
      failed: run.status === "failed",
      total: leads.length,
      kept: leads.filter((i) => i.decision === "kept").length,
      discarded: leads.filter((i) => i.decision === "discarded").length,
      waiting: leads.filter((i) => i.decision === null).length,
    };
  });
}

function summaryOf(run: RunRow, linkable: Map<string, string>): RunSummaryView | null {
  if (run.status !== "done" || !run.summary) return null;
  const entities = (run.summaryHighlights ?? []).flatMap((id) => {
    const name = linkable.get(id);
    return name ? [{ id, name }] : [];
  });
  return { time: formatTime(at(run)), paragraphs: summaryParagraphs(run.summary, entities) };
}

export function homePageData(workspaceId: string, nextRunAt: string | null, now = new Date()): HomeData {
  const threshold = getSetting(workspaceId, "score_threshold");
  const items = workspaceItems(workspaceId, threshold, now.getTime());
  const { runs, title, today } = chartRuns(workspaceId, now);
  const chartBars = bars(runs, items, threshold);

  const latest = db
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), inArray(r.status, ["done", "failed"])))
    .orderBy(desc(r.finishedAt))
    .get();
  const lastGood = db
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.status, "done")))
    .orderBy(desc(r.finishedAt))
    .get();

  // Only companies the New Companies page can open are linked.
  const linkable = new Map(items.map((i) => [i.id, i.name]));
  const summaries: Record<string, RunSummaryView> = {};
  for (const run of lastGood ? [...runs, lastGood] : runs) {
    const view = summaryOf(run, linkable);
    if (view) summaries[run.id] = view;
  }

  const midnight = startOfDay(now).toISOString();
  return {
    hasFinishedRun: Boolean(lastGood),
    figures: {
      runsToday: today.length,
      found: bars(today, items, threshold).reduce((sum, b) => sum + b.total, 0),
      keptToday: items.filter((i) => i.decision === "kept" && i.decidedAt !== null && i.decidedAt >= midnight).length,
      waiting: tabItems(items, "new", threshold).length,
      conversations: conversationItems(workspaceId).filter((c) => c.decision === null).length,
    },
    chart: { title, bars: chartBars },
    summaries,
    lastGoodId: lastGood?.id ?? null,
    latestFailed: latest?.status === "failed",
    nextRunAt,
    services: homeServices(workspaceId),
  };
}
