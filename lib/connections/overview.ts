import { and, asc, desc, eq, inArray, isNotNull, min } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { credentialViews, type CredentialView } from "@/lib/credentials/store";
import { failedLabel, type KeyService } from "@/lib/credentials/services";
import { formatClock, formatDayTime, formatShort, formatTime } from "@/lib/format/time";
import { canRunNow } from "@/lib/readiness";
import { getSetting } from "@/lib/settings";
import type { KeyRowData } from "@/components/connections/ConnectionsBoard";
import type { HubSourceInput } from "@/components/connections/hub-model";

// Everything the Connections page shows, read from the database and shaped
// for the browser. Nothing here carries a key or its ciphertext.

export type RunFigures = {
  lastRun: string;
  lastRunFailed: boolean;
  scanned: string;
  newMatches: string;
  nextRun: string;
};

export type LogRow = { id: string; at: string; actor: string; message: string; error: boolean };

export type FailedRun = { at: string; actor: string; keyAnchor: string | null };

function keyRow(service: KeyService, views: CredentialView[]): KeyRowData {
  const v = views.find((c) => c.service === service);
  if (!v) return { service, status: "off", last4: null, message: null, failedLabel: "Not connected", sub: null };
  const sub = v.lastUsedAt
    ? `Last used ${formatShort(v.lastUsedAt)}`
    : v.lastTestedAt
      ? `Tested ${formatShort(v.lastTestedAt)}`
      : null;
  return {
    service,
    status: v.status,
    last4: v.last4,
    message: v.message,
    failedLabel: failedLabel(service, v.message),
    sub,
  };
}

const runs = schema.runs;

function latestRuns(workspaceId: string, limit: number) {
  return db.select().from(runs).where(eq(runs.workspaceId, workspaceId)).orderBy(desc(runs.queuedAt)).limit(limit).all();
}

// counts.scanned and counts.matches are written by the run pipeline (phase 3).
function countOf(counts: Record<string, unknown> | null, key: string): number {
  const n = counts?.[key];
  return typeof n === "number" ? n : 0;
}

function figures(workspaceId: string, ready: boolean): RunFigures {
  const finished = db
    .select()
    .from(runs)
    .where(and(eq(runs.workspaceId, workspaceId), inArray(runs.status, ["done", "failed"]), isNotNull(runs.finishedAt)))
    .orderBy(desc(runs.finishedAt))
    .limit(1)
    .get();
  const active = db
    .select({ status: runs.status })
    .from(runs)
    .where(and(eq(runs.workspaceId, workspaceId), inArray(runs.status, ["queued", "running"])))
    .get();
  const next = db
    .select({ at: min(schema.sources.nextRunAt) })
    .from(schema.sources)
    .where(and(eq(schema.sources.workspaceId, workspaceId), eq(schema.sources.status, "connected")))
    .get();

  const failed = finished?.status === "failed";
  let nextRun = "Not scheduled";
  if (!ready) nextRun = "After setup";
  else if (active) nextRun = active.status === "running" ? "Running now" : "Queued";
  else if (next?.at) nextRun = formatShort(next.at);

  return {
    lastRun: finished?.finishedAt ? `${formatDayTime(finished.finishedAt)}${failed ? ", stopped" : ""}` : "Not yet",
    lastRunFailed: failed,
    scanned: `${countOf(finished?.counts ?? null, "scanned")} companies`,
    newMatches: String(countOf(finished?.counts ?? null, "matches")),
    nextRun,
  };
}

function logRows(runIds: string[]): LogRow[] {
  if (runIds.length === 0) return [];
  const l = schema.runLog;
  return db
    .select()
    .from(l)
    .where(inArray(l.runId, runIds))
    .orderBy(asc(l.at))
    .all()
    .map((r) => ({ id: r.id, at: formatClock(r.at), actor: r.actor, message: r.message, error: r.level === "error" }));
}

const KEY_ANCHORS: Record<string, string> = {
  "Companies House": "#key-companies_house",
  Claude: "#key-anthropic",
  ChatGPT: "#key-openai",
  Grok: "#key-xai",
};

/** The keys with a row on Connections. Reddit's key lives with its source. */
export const BOARD_KEYS = ["anthropic", "openai", "xai", "companies_house", "apollo", "hubspot"] as const;
export type BoardKey = (typeof BOARD_KEYS)[number];

function failedRun(workspaceId: string): FailedRun | null {
  const latest = latestRuns(workspaceId, 1)[0];
  if (latest?.status !== "failed") return null;
  const l = schema.runLog;
  const lastError = db
    .select({ actor: l.actor })
    .from(l)
    .where(and(eq(l.runId, latest.id), eq(l.level, "error")))
    .orderBy(desc(l.at))
    .get();
  const actor = lastError?.actor ?? "Run";
  return {
    at: formatTime(latest.finishedAt ?? latest.startedAt ?? latest.queuedAt),
    actor,
    keyAnchor: KEY_ANCHORS[actor] ?? null,
  };
}

// Added sources, for the hub. Their rows come from lib/sources/detail.ts.
function hubSources(workspaceId: string): HubSourceInput[] {
  const s = schema.sources;
  return db
    .select()
    .from(s)
    .where(eq(s.workspaceId, workspaceId))
    .orderBy(asc(s.createdAt))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      label: row.name,
      connector: row.connector,
      state: row.status,
      sub: row.lastRunAt ? `Last run ${formatShort(row.lastRunAt)}` : "Not run yet",
      failedLine: row.lastRunAt ? `Failed at ${formatTime(row.lastRunAt)}` : "Failed",
    }));
}

export function connectionsOverview(workspaceId: string) {
  const views = credentialViews(workspaceId);
  const ready = canRunNow(workspaceId);
  const failed = failedRun(workspaceId);
  return {
    keys: Object.fromEntries(BOARD_KEYS.map((k) => [k, keyRow(k, views)])) as Record<BoardKey, KeyRowData>,
    defaultAi: getSetting(workspaceId, "default_ai"),
    sources: hubSources(workspaceId),
    ready,
    figures: figures(workspaceId, ready),
    log: logRows(latestRuns(workspaceId, 2).map((r) => r.id)),
    failed,
    showFirstRunBanner: !ready && !failed,
  };
}

/** Every key row, for Settings. */
export function keyRows(workspaceId: string): KeyRowData[] {
  const views = credentialViews(workspaceId);
  return BOARD_KEYS.map((k) => keyRow(k, views));
}
