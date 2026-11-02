import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// What every run step shares: the run's identity, its log and its counts.
// Counts are written to runs.counts as they change, so /api/runs/current can
// show each step's note and the review progress while the run is going.

export type StepNotes = [string | null, string | null, string | null, string | null];

export type RunCounts = {
  /** One short note per step once it's done, e.g. "57 new companies". */
  steps: StepNotes;
  /** Progress within the current step, when it has a known size. */
  progress: { done: number; total: number } | null;
  /** Companies fetched from Companies House (Connections shows "312 companies"). */
  scanned: number;
  fetched: number;
  newTargets: number;
  enriched: number;
  reviewed: number;
  /** Reviewed at or above the score threshold. */
  matches: number;
  reviewCostGbp: number;
  /** Total time spent on reviews, summed across the parallel workers. */
  reviewMs: number;
  /** Reviews that went on to the web research pass. */
  researched: number;
  /** Reviews whose web research failed, so the first pass stands. */
  researchFailed: number;
  /** Targets this run created, for the summary and the Home bar chart. */
  newTargetIds: string[];
  sources: Record<string, { fetched: number; newTargets: number; error?: string }>;
};

export function emptyCounts(): RunCounts {
  return {
    steps: [null, null, null, null],
    progress: null,
    scanned: 0,
    fetched: 0,
    newTargets: 0,
    enriched: 0,
    reviewed: 0,
    matches: 0,
    reviewCostGbp: 0,
    reviewMs: 0,
    researched: 0,
    researchFailed: 0,
    newTargetIds: [],
    sources: {},
  };
}

export type Level = "info" | "error";

export class RunContext {
  readonly counts: RunCounts = emptyCounts();
  readonly startedAt = Date.now();

  constructor(
    readonly runId: string,
    readonly workspaceId: string,
    readonly kind: "manual" | "scheduled",
    /** Set when the run is for one source only. */
    readonly sourceId: string | null = null,
    /** A lookalike search from Clients: no sources are fetched. */
    readonly lookalikes = false,
  ) {}

  /** Targets the review takes before any others, such as new lookalikes. */
  priorityIds: string[] = [];

  log(actor: string, message: string, level: Level = "info") {
    db.insert(schema.runLog).values({ runId: this.runId, actor, message, level }).run();
  }

  step(n: 1 | 2 | 3 | 4) {
    this.counts.progress = null;
    db.update(schema.runs).set({ step: n, counts: this.counts }).where(eq(schema.runs.id, this.runId)).run();
  }

  note(n: 1 | 2 | 3 | 4, text: string) {
    this.counts.steps[n - 1] = text;
    this.save();
  }

  progress(done: number, total: number) {
    this.counts.progress = { done, total };
    this.save();
  }

  save() {
    db.update(schema.runs).set({ counts: this.counts }).where(eq(schema.runs.id, this.runId)).run();
  }
}
