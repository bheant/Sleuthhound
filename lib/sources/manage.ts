import { and, desc, eq } from "drizzle-orm";
import { defaultAiName } from "@/lib/ai/provider";
import { csvMapping, csvScope } from "@/lib/connectors/csv/connector";
import { deleteUpload, readUpload, rowHash } from "@/lib/connectors/csv/uploads";
import { getConnector } from "@/lib/connectors/registry";
import { db, schema } from "@/lib/db";
import type { SourceStatus } from "@/lib/db/schema";
import { canRunNow } from "@/lib/readiness";
import { queueRun } from "@/lib/runs/queue";
import { nextRunAt, sourceConfig, type SourceConfig } from "./config";
import type { ActionResult, WizardConfig } from "./types";

// Writes sources and their versions. Every save of the settings is a new
// version, so the history can show what changed and restore any of them.

const s = schema.sources;
const v = schema.sourceVersions;

function credentialId(workspaceId: string, service: string | undefined): string | null {
  if (!service) return null;
  const c = schema.credentials;
  return db.select({ id: c.id }).from(c).where(and(eq(c.workspaceId, workspaceId), eq(c.service, service))).get()?.id ?? null;
}

function defaultName(connectorKey: string, scope: unknown): string {
  const connector = getConnector(connectorKey);
  if (connectorKey === "csv") {
    const csv = csvScope.parse(scope);
    return csv.purpose === "clients" ? "Client list" : csv.fileName.replace(/\.[a-z]+$/i, "");
  }
  return connector.label;
}

/** Validates the wizard's config into what sources.config stores. */
export function toSourceConfig(connectorKey: string, input: WizardConfig): { ok: true; config: SourceConfig } | { ok: false; message: string } {
  const connector = getConnector(connectorKey);
  const scope = connector.scopeSchema.safeParse(input.scope);
  if (!scope.success) return { ok: false, message: scope.error.issues[0]?.message ?? "Check the settings on the Scope step." };
  let mapping: unknown = undefined;
  if (connector.mappingMode === "user") {
    const m = csvMapping.safeParse(input.mapping);
    if (!m.success || !Object.values(m.data).includes("Target name")) {
      return { ok: false, message: "Map one column to Target name on the Map step." };
    }
    mapping = m.data;
  }
  const config = sourceConfig.safeParse({ ...input, scope: scope.data, mapping });
  if (!config.success) return { ok: false, message: "Check the schedule and limits." };
  return { ok: true, config: config.data };
}

// A CSV's rows go into raw_items at save; the run imports them from there.
function storeRows(workspaceId: string, sourceId: string, uploadId: string): number {
  const upload = readUpload(uploadId);
  if (!upload) throw new Error("The uploaded file has gone. Upload it again.");
  db.transaction((tx) => {
    for (const row of upload.rows) {
      tx.insert(schema.rawItems)
        .values({ workspaceId, sourceId, externalId: rowHash(row), payload: { row, file: upload.fileName } })
        .onConflictDoNothing()
        .run();
    }
  });
  deleteUpload(uploadId);
  return upload.rows.length;
}

export function createSource(workspaceId: string, connectorKey: string, input: WizardConfig): ActionResult {
  const connector = getConnector(connectorKey);
  if (connector.availability === "coming_soon") return { ok: false, message: `${connector.label} isn’t available yet.` };
  const checked = toSourceConfig(connectorKey, input);
  if (!checked.ok) return { ok: false, message: checked.message };
  const config = checked.config;
  const awaiting = connector.availability === "needs_approval";
  const status: SourceStatus = awaiting ? "awaiting_approval" : "connected";

  const id = db.transaction((tx) => {
    const row = tx
      .insert(s)
      .values({
        workspaceId,
        connector: connectorKey,
        name: defaultName(connectorKey, config.scope),
        status,
        config,
        credentialId: credentialId(workspaceId, connector.credentialService),
        // Due straight away, so a scheduled run picks it up if one is going now.
        nextRunAt: awaiting ? null : new Date().toISOString(),
      })
      .returning({ id: s.id })
      .get();
    tx.insert(v).values({ sourceId: row.id, version: 1, config }).run();
    return row.id;
  });

  try {
    if (connectorKey === "csv") storeRows(workspaceId, id, csvScope.parse(config.scope).uploadId);
  } catch (error) {
    db.delete(s).where(eq(s.id, id)).run();
    return { ok: false, message: error instanceof Error ? error.message : "The file couldn’t be saved." };
  }

  if (awaiting) {
    return { ok: true, sourceId: id, message: `Saved. It starts once ${connector.label} approves commercial access.` };
  }
  if (!canRunNow(workspaceId)) {
    return { ok: true, sourceId: id, message: `Saved. It runs once Companies House and ${defaultAiName(workspaceId)} are connected.` };
  }
  queueRun(workspaceId, "manual", id);
  return { ok: true, sourceId: id, message: "Saved. The first run has started." };
}

function writeVersion(sourceId: string, config: SourceConfig) {
  db.transaction((tx) => {
    const current = tx.select({ version: s.version }).from(s).where(eq(s.id, sourceId)).get();
    const latest = tx.select({ version: v.version }).from(v).where(eq(v.sourceId, sourceId)).orderBy(desc(v.version)).get();
    const version = Math.max(current?.version ?? 0, latest?.version ?? 0) + 1;
    tx.update(s).set({ config, version }).where(eq(s.id, sourceId)).run();
    tx.insert(v).values({ sourceId, version, config }).run();
  });
}

export function ownedSource(workspaceId: string, sourceId: string) {
  return db.select().from(s).where(and(eq(s.id, sourceId), eq(s.workspaceId, workspaceId), eq(s.isDemo, 0))).get();
}

export function updateSource(workspaceId: string, sourceId: string, input: WizardConfig): ActionResult {
  const source = ownedSource(workspaceId, sourceId);
  if (!source) return { ok: false, message: "That source has been removed." };
  // A CSV's file can't change once imported; keep the stored one.
  const scope = source.connector === "csv" ? (source.config as { scope?: unknown }).scope : input.scope;
  const checked = toSourceConfig(source.connector, { ...input, scope: scope as Record<string, unknown> });
  if (!checked.ok) return { ok: false, message: checked.message };
  writeVersion(sourceId, checked.config);
  return { ok: true, sourceId, message: "Saved. The next run uses the new settings." };
}

export function restoreVersion(workspaceId: string, sourceId: string, version: number): ActionResult {
  const source = ownedSource(workspaceId, sourceId);
  if (!source) return { ok: false, message: "That source has been removed." };
  const old = db.select({ config: v.config }).from(v).where(and(eq(v.sourceId, sourceId), eq(v.version, version))).get();
  const parsed = sourceConfig.safeParse(old?.config);
  if (!parsed.success) return { ok: false, message: "That version can’t be restored." };
  writeVersion(sourceId, parsed.data);
  return { ok: true, message: null };
}

export function setPaused(workspaceId: string, sourceId: string, paused: boolean): ActionResult {
  const source = ownedSource(workspaceId, sourceId);
  if (!source) return { ok: false, message: "That source has been removed." };
  if (source.status === "awaiting_approval") return { ok: false, message: "It hasn’t started yet, so there’s nothing to pause." };
  const schedule = sourceConfig.safeParse(source.config).data?.schedule ?? "hourly";
  db.update(s)
    .set(
      paused
        ? { status: "paused", lastError: null }
        : { status: "connected", lastError: null, nextRunAt: nextRunAt(schedule).toISOString() },
    )
    .where(eq(s.id, sourceId))
    .run();
  return { ok: true, message: null };
}

export function retrySource(workspaceId: string, sourceId: string): ActionResult {
  const source = ownedSource(workspaceId, sourceId);
  if (!source) return { ok: false, message: "That source has been removed." };
  if (!canRunNow(workspaceId)) return { ok: false, message: `Connect Companies House and ${defaultAiName(workspaceId)} to run.` };
  db.update(s).set({ status: "connected", lastError: null }).where(eq(s.id, sourceId)).run();
  queueRun(workspaceId, "manual", sourceId);
  return { ok: true, message: null };
}

/** Stops it straight away. What it found stays; only the raw items go. */
export function removeSource(workspaceId: string, sourceId: string): ActionResult {
  const source = ownedSource(workspaceId, sourceId);
  if (!source) return { ok: true, message: null };
  db.delete(s).where(eq(s.id, sourceId)).run();
  return { ok: true, message: null };
}
