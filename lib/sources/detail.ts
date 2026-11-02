import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { getConnector } from "@/lib/connectors/registry";
import { db, schema } from "@/lib/db";
import type { Source } from "@/lib/db/schema";
import { formatDayTime, formatShort, formatTime, formatWhen } from "@/lib/format/time";
import { describeChange } from "./changes";
import { sourceConfig, type SourceConfig } from "./config";
import type { SourceDetail, SourceRow, WizardConfig, WizardStart } from "./types";

// What Connections shows for each added source: its row (status, last run,
// result line) and its detail panel (runs chart, this week's funnel,
// settings, history). Plain data for the browser; no keys.

const s = schema.sources;
const t = schema.targets;
const r = schema.runs;

const DAY = 86_400_000;
const SCHEDULE_TEXT: Record<string, string> = { hourly: "Hourly", every_6_hours: "Every 6 hours", daily: "Daily" };
const STATUS_TEXT: Record<Source["status"], string> = {
  connected: "connected",
  paused: "paused",
  failed: "failed",
  awaiting_approval: "awaiting approval",
};

function configOf(source: Source): SourceConfig | null {
  return sourceConfig.safeParse(source.config).data ?? null;
}

type RunPoint = { id: string; at: string; fetched: number };

// Runs that fetched this source, newest first.
function runsFor(sourceId: string, limit: number): RunPoint[] {
  const path = `$.sources."${sourceId}".fetched`;
  return db
    .select({ id: r.id, at: sql<string>`coalesce(${r.startedAt}, ${r.queuedAt})`, fetched: sql<number>`json_extract(${r.counts}, ${path})` })
    .from(r)
    .where(sql`json_extract(${r.counts}, ${path}) is not null`)
    .orderBy(desc(r.queuedAt))
    .limit(limit)
    .all();
}

// Targets this source found in the last week, and how many of them are kept.
function weekFunnel(sourceId: string, now: number): SourceDetail["week"] {
  const since = new Date(now - 7 * DAY).toISOString();
  const fetched = runsFor(sourceId, 200)
    .filter((x) => x.at >= since)
    .reduce((sum, x) => sum + (x.fetched ?? 0), 0);
  const d = schema.decisions;
  const kept = sql<number>`sum(case when (
    select ${d.decision} from ${d} where ${d.targetId} = ${t.id} and ${d.undoneAt} is null order by ${d.decidedAt} desc limit 1
  ) = 'kept' then 1 else 0 end)`;
  const row = db
    .select({ targets: sql<number>`count(*)`, kept })
    .from(t)
    .where(and(eq(t.firstSourceId, sourceId), gte(t.firstSeenAt, since)))
    .get();
  return { fetched, targets: row?.targets ?? 0, kept: row?.kept ?? 0 };
}

function keyText(source: Source): string {
  const connector = getConnector(source.connector);
  if (!connector.needsKey) return "No key needed";
  const c = schema.credentials;
  const key = source.credentialId
    ? db.select({ last4: c.last4 }).from(c).where(eq(c.id, source.credentialId)).get()
    : db.select({ last4: c.last4 }).from(c).where(and(eq(c.workspaceId, source.workspaceId), eq(c.service, connector.credentialService ?? ""))).get();
  return key ? `•••• ${key.last4}` : "No key yet";
}

function failedLine(source: Source): string {
  const at = source.lastRunAt ? ` at ${formatTime(source.lastRunAt)}` : "";
  const next = source.nextRunAt ? ` Next try ${formatWhen(source.nextRunAt)}.` : "";
  const reason = (source.lastError ?? "It didn’t answer").replace(/\.?$/, ".");
  return `Failed${at}. ${reason}${next}`;
}

export function sourceRows(workspaceId: string, now = Date.now()): SourceRow[] {
  const rows = db.select().from(s).where(and(eq(s.workspaceId, workspaceId), eq(s.isDemo, 0))).orderBy(asc(s.createdAt)).all();
  return rows.map((source) => {
    const connector = getConnector(source.connector);
    const config = configOf(source);
    const scope = connector.scopeSchema.safeParse(config?.scope);
    const last = runsFor(source.id, 1)[0];
    const week = weekFunnel(source.id, now);
    const capReached = source.status === "paused" && Boolean(source.lastError?.startsWith("Paused:"));
    return {
      id: source.id,
      name: source.name,
      connector: source.connector,
      line: scope.success ? `${connector.label}: ${connector.scopeLine(scope.data)}` : connector.label,
      status: source.status,
      keyText: keyText(source),
      sub: source.lastRunAt ? `Last run ${formatShort(source.lastRunAt)}${last ? `, ${last.fetched} fetched` : ""}` : source.status === "awaiting_approval" ? "Saved, not run" : "Not run yet",
      result: source.lastRunAt ? `${week.fetched} fetched, ${week.targets} became targets, ${week.kept} kept this week` : null,
      error: source.status === "failed" ? failedLine(source) : capReached ? source.lastError : null,
      capReached,
    };
  });
}

function wizardConfig(config: SourceConfig): WizardConfig {
  return {
    scope: (config.scope ?? {}) as Record<string, unknown>,
    mapping: (config.mapping as WizardConfig["mapping"]) ?? null,
    schedule: config.schedule,
    max_items: config.max_items,
    spend_cap_gbp: config.spend_cap_gbp,
    weight: config.weight,
    describe_text: config.describe_text,
  };
}

export function editStart(source: Source): WizardStart | null {
  const config = configOf(source);
  if (!config) return null;
  return { mode: "edit", sourceId: source.id, connector: source.connector, name: source.name, config: wizardConfig(config), status: source.status };
}

const runLabelFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long" });
const historyDayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function sourceDetails(workspaceId: string, now = Date.now()): SourceDetail[] {
  const rows = db.select().from(s).where(and(eq(s.workspaceId, workspaceId), eq(s.isDemo, 0))).orderBy(asc(s.createdAt)).all();
  return rows.flatMap((source) => {
    const connector = getConnector(source.connector);
    const config = configOf(source);
    const start = editStart(source);
    if (!config || !start) return [];
    const scope = connector.scopeSchema.safeParse(config.scope);
    const runs = runsFor(source.id, 14).reverse();
    const months = [...new Set(runs.map((x) => monthFmt.format(new Date(x.at))))];
    const versions = db
      .select()
      .from(schema.sourceVersions)
      .where(eq(schema.sourceVersions.sourceId, source.id))
      .orderBy(asc(schema.sourceVersions.version))
      .all();
    const history = versions
      .map((v, i) => ({
        version: v.version,
        when: `${historyDayFmt.format(new Date(v.savedAt))}, ${formatTime(v.savedAt)}`,
        change: describeChange(i === 0 ? null : (versions[i - 1].config as SourceConfig), v.config as SourceConfig, connector.scopeFields),
        current: v.version === source.version,
      }))
      .reverse();
    const cap = config.spend_cap_gbp == null ? "No spend cap" : `£${config.spend_cap_gbp} a month cap`;
    const once = source.connector === "csv";
    return [
      {
        id: source.id,
        name: source.name,
        connector: source.connector,
        connectorLabel: connector.label,
        status: source.status,
        statusLine: `${scope.success ? connector.scopeLine(scope.data) : connector.label} (${STATUS_TEXT[source.status]})`,
        lastRun: source.lastRunAt ? formatDayTime(source.lastRunAt, new Date(now)) : "Not yet",
        nextRun:
          once && source.lastRunAt
            ? "Imported"
            : source.status === "connected" || source.status === "failed"
              ? source.nextRunAt
                ? formatDayTime(source.nextRunAt, new Date(now))
                : "Not scheduled"
              : source.status === "paused"
                ? "Paused"
                : "After approval",
        scheduleText: once ? `Once, up to ${config.max_items} rows` : `${SCHEDULE_TEXT[config.schedule]}, up to ${config.max_items} items`,
        runs: runs.map((x) => ({ label: runLabelFmt.format(new Date(x.at)), fetched: x.fetched ?? 0, when: formatDayTime(x.at, new Date(now)) })),
        runsNote: runs.length
          ? `Run date, ${months.join(" to ")}. ${once ? "Imported once." : `Runs ${SCHEDULE_TEXT[config.schedule].toLowerCase()}.`}`
          : "No runs yet.",
        week: weekFunnel(source.id, now),
        settings: [
          ...(config.describe_text ? [{ label: "Looks for", value: config.describe_text }] : []),
          ...(scope.success ? connector.scopeSummary(scope.data) : []),
          { label: "Limits", value: `${cap}, signal weight ${config.weight.charAt(0).toUpperCase()}${config.weight.slice(1)}` },
        ],
        history,
        error: source.status === "failed" ? failedLine(source) : source.status === "paused" ? source.lastError : null,
        start,
      },
    ];
  });
}
