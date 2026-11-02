import { and, desc, eq, inArray } from "drizzle-orm";
import { credentialViews } from "@/lib/credentials/store";
import { db, schema } from "@/lib/db";
import { formatClock, formatTime, formatWhen, runName } from "@/lib/format/time";
import { nextScheduledRun } from "./status";

// What Home shows about runs: the date line, and the stopped-run block when
// the latest run failed. The figures, chart and summaries are in lib/home.

const r = schema.runs;

export type StoppedRun = {
  title: string;
  reason: string;
  detail: string;
  keyHref: string | null;
};

export type HomeRuns = {
  /** "Last run 14:00, next run 15:00", or null before the first run. */
  idleLine: string | null;
  stopped: StoppedRun | null;
  hasFinishedRun: boolean;
};

const KEY_ACTORS: Record<string, { service: string; href: string }> = {
  "Companies House": { service: "companies_house", href: "/connections#key-companies_house" },
  Claude: { service: "anthropic", href: "/connections#key-anthropic" },
  ChatGPT: { service: "openai", href: "/connections#key-openai" },
  Grok: { service: "xai", href: "/connections#key-xai" },
};

function stoppedRun(workspaceId: string, run: typeof r.$inferSelect, next: string | null): StoppedRun {
  const l = schema.runLog;
  const lastError = db
    .select({ actor: l.actor })
    .from(l)
    .where(and(eq(l.runId, run.id), eq(l.level, "error")))
    .orderBy(desc(l.at))
    .get();
  const key = lastError ? KEY_ACTORS[lastError.actor] : undefined;
  const keyStillRejected =
    key && credentialViews(workspaceId).some((c) => c.service === key.service && c.status === "rejected");
  const repeat = keyStillRejected && next ? ` The ${runName(next).slice(4)} will stop the same way until the key is replaced.` : "";
  const at = run.finishedAt ?? run.startedAt ?? run.queuedAt;
  return {
    title: `The ${formatTime(run.startedAt ?? run.queuedAt)} run stopped`,
    reason: `${run.error ?? "The run stopped part way."}${repeat}`,
    detail: `Stopped at ${formatClock(at)}, step ${run.step} of 4`,
    keyHref: keyStillRejected ? key.href : null,
  };
}

export function homeRuns(workspaceId: string): HomeRuns {
  const latest = db
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), inArray(r.status, ["done", "failed"])))
    .orderBy(desc(r.finishedAt))
    .get();
  const lastGood = db
    .select({ startedAt: r.startedAt })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.status, "done")))
    .orderBy(desc(r.finishedAt))
    .get();
  const next = nextScheduledRun(workspaceId);
  const failed = latest?.status === "failed";

  let idleLine: string | null = null;
  if (lastGood?.startedAt) {
    const nextText = next ? `, next run ${formatWhen(next)}` : "";
    idleLine = `${failed ? "Last good run" : "Last run"} ${formatTime(lastGood.startedAt)}${nextText}`;
  } else if (next) {
    idleLine = `Next run ${formatWhen(next)}`;
  }

  return {
    idleLine,
    stopped: latest && failed ? stoppedRun(workspaceId, latest, next) : null,
    hasFinishedRun: Boolean(lastGood),
  };
}
