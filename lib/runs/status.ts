import { and, desc, eq, inArray, min } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { RunCounts, StepNotes } from "@/lib/pipeline/context";
import { stepLabels } from "./steps";

// What the header and Home need to show a run as it happens. The header's
// RunStatusProvider reads it every few seconds.

export type RunStatus = {
  active: {
    id: string;
    status: "queued" | "running";
    step: number;
    notes: StepNotes;
    progress: { done: number; total: number } | null;
    /** A lookalike search from Clients. */
    lookalikes: boolean;
  } | null;
  labels: [string, string, string, string];
  /** Changes whenever a run finishes, so the page knows to refresh. */
  lastFinishedId: string | null;
};

const r = schema.runs;

export function runStatus(workspaceId: string): RunStatus {
  const active = db
    .select({ id: r.id, status: r.status, step: r.step, counts: r.counts, findLookalikes: r.findLookalikes })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), inArray(r.status, ["queued", "running"])))
    .orderBy(desc(r.queuedAt))
    .get();
  const finished = db
    .select({ id: r.id })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), inArray(r.status, ["done", "failed"])))
    .orderBy(desc(r.finishedAt))
    .get();
  const connectors = db
    .selectDistinct({ connector: schema.sources.connector })
    .from(schema.sources)
    .where(and(eq(schema.sources.workspaceId, workspaceId), eq(schema.sources.status, "connected")))
    .all()
    .map((x) => x.connector);
  const counts = active?.counts as Partial<RunCounts> | null | undefined;
  return {
    active: active
      ? {
          id: active.id,
          status: active.status as "queued" | "running",
          step: active.step,
          notes: counts?.steps ?? [null, null, null, null],
          progress: counts?.progress ?? null,
          lookalikes: active.findLookalikes === 1,
        }
      : null,
    labels: stepLabels(connectors),
    lastFinishedId: finished?.id ?? null,
  };
}

/** The earliest next run among sources that run on a schedule. */
export function nextScheduledRun(workspaceId: string): string | null {
  const s = schema.sources;
  const row = db
    .select({ at: min(s.nextRunAt) })
    .from(s)
    .where(and(eq(s.workspaceId, workspaceId), eq(s.isDemo, 0), inArray(s.status, ["connected", "failed"])))
    .get();
  return row?.at ?? null;
}
