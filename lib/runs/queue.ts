import { and, asc, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { db, rowsChanged, schema } from "@/lib/db";

const r = schema.runs;

export type ActiveRun = { id: string; status: "queued" | "running"; step: number };

export function activeRun(workspaceId: string): ActiveRun | undefined {
  return db
    .select({ id: r.id, status: r.status, step: r.step })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), inArray(r.status, ["queued", "running"])))
    .get() as ActiveRun | undefined;
}

// Adds a run for the runner to claim, unless one is already queued or running.
// A run for one source (sourceId) fetches and reviews only what it finds; a
// lookalike search fetches no sources.
export function queueRun(
  workspaceId: string,
  kind: "manual" | "scheduled",
  sourceId: string | null = null,
  { lookalikes = false }: { lookalikes?: boolean } = {},
): string {
  const existing = activeRun(workspaceId);
  if (existing) return existing.id;
  const row = db
    .insert(r)
    .values({ workspaceId, kind, sourceId, findLookalikes: lookalikes ? 1 : 0, status: "queued" })
    .returning({ id: r.id })
    .get();
  return row.id;
}

// Takes the oldest queued run, unless a run is already going.
export function claimNextRun(): string | null {
  return db.transaction(
    (tx) => {
      const running = tx.select({ id: r.id }).from(r).where(eq(r.status, "running")).get();
      if (running) return null;
      const next = tx.select({ id: r.id }).from(r).where(eq(r.status, "queued")).orderBy(asc(r.queuedAt)).get();
      if (!next) return null;
      tx.update(r).set({ status: "running", step: 1, startedAt: new Date().toISOString() }).where(eq(r.id, next.id)).run();
      return next.id;
    },
    { behavior: "immediate" },
  );
}

const STALE_MS = 20 * 60_000;

// Runs left "running" for over 20 minutes stopped without finishing.
// `all` marks every running run, for when the runner has just started and so
// can't be running one itself.
export function failStaleRuns({ all = false } = {}): number {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const result = db
    .update(r)
    .set({
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: all
        ? "Sleuthhound was locked or closed during the run, so it stopped part way. Earlier runs aren’t affected."
        : "The run took longer than 20 minutes, so it was stopped. Earlier runs aren’t affected.",
    })
    .where(and(eq(r.status, "running"), all ? undefined : or(isNull(r.startedAt), lt(r.startedAt, cutoff))))
    .run();
  return rowsChanged(result);
}

// Queues a scheduled run for each workspace with a source whose next run time
// has passed. queueRun skips workspaces that already have one going.
export function queueScheduledRuns(): number {
  const s = schema.sources;
  const due = db
    .selectDistinct({ workspaceId: s.workspaceId })
    .from(s)
    .where(
      and(eq(s.isDemo, 0), inArray(s.status, ["connected", "failed"]), lte(s.nextRunAt, new Date().toISOString())),
    )
    .all();
  for (const { workspaceId } of due) queueRun(workspaceId, "scheduled");
  return due.length;
}
