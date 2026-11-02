import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { companiesHouseConnector, type CompaniesHouseScope } from "@/lib/connectors/companies-house/connector";
import { csvScope } from "@/lib/connectors/csv/connector";
import { getConnector } from "@/lib/connectors/registry";
import { defaultAiName, PROVIDER_LABELS, type AiProvider } from "@/lib/ai/provider";
import { SERVICE_VENDOR } from "@/lib/credentials/services";
import { readKey } from "@/lib/credentials/store";
import { db, schema } from "@/lib/db";
import type { Source } from "@/lib/db/schema";
import { ensureDefaultSettings } from "@/lib/settings";
import { nextRunAt, sourceConfig } from "@/lib/sources/config";
import { analyseClients, clientListSource, markClients, matchClients, refreshIdealClient } from "./clients";
import { RunContext } from "./context";
import { enrichCompanies, geocodePlaces } from "./enrich";
import { KeyRejectedError, plainReason, rejectKey, StopRunError } from "./errors";
import { ingestSource, sourceKey, type IngestResult } from "./ingest";
import { findLookalikes, lookalikesDue } from "./lookalikes";
import { resolvePossibleCompanies } from "./matches";
import { reviewTargets } from "./review";
import { enforceSpendCaps } from "./spend";
import { writeSummary } from "./summary";

// One run, four steps, as on Home: Companies House, other sources (labelled
// "Public registers" once one is connected), AI review, saving. A failing
// source is marked failed and the run carries on; a rejected key stops it.

const s = schema.sources;

// Manual runs fetch every runnable source; scheduled runs only the due ones;
// a run for one source, only that one. Failed sources are retried on their
// schedule; paused and awaiting-approval sources never run.
function sourcesFor(run: RunContext): Source[] {
  if (run.lookalikes) return [];
  const runnable = and(eq(s.workspaceId, run.workspaceId), eq(s.isDemo, 0), inArray(s.status, ["connected", "failed"]));
  if (run.sourceId) return db.select().from(s).where(and(runnable, eq(s.id, run.sourceId))).all();
  const due = or(isNull(s.nextRunAt), lte(s.nextRunAt, new Date().toISOString()));
  return db
    .select()
    .from(s)
    .where(run.kind === "manual" ? runnable : and(runnable, due))
    .all();
}

function failSource(run: RunContext, source: Source, error: unknown) {
  const label = getConnector(source.connector).label;
  const reason = `${label} ${plainReason(error)}`;
  db.update(s).set({ status: "failed", lastError: reason }).where(eq(s.id, source.id)).run();
  run.counts.sources[source.id] = { fetched: 0, newTargets: 0, error: reason };
  run.log(label, `${reason}. Skipped this run; it’ll be tried again at the next scheduled run.`, "error");
}

async function fetchSource(run: RunContext, source: Source, noun: string): Promise<IngestResult | null> {
  const label = getConnector(source.connector).label;
  try {
    const result = await ingestSource(run, source);
    run.counts.fetched += result.fetched;
    run.counts.newTargets += result.newTargetIds.length;
    run.counts.newTargetIds.push(...result.newTargetIds);
    run.counts.sources[source.id] = { fetched: result.fetched, newTargets: result.newTargetIds.length };
    run.log(label, `${result.fetched} ${noun} fetched, ${result.newTargetIds.length} new`);
    if (result.failedItems) run.log(label, `${result.failedItems} couldn’t be read and were skipped`, "error");
    return result;
  } catch (error) {
    if (error instanceof KeyRejectedError) throw error;
    failSource(run, source, error);
    return null;
  }
}

async function companiesHouseStep(run: RunContext, sources: Source[]) {
  run.step(1);
  const register = sources.filter((x) => x.connector === "companies_house");
  if (register.length === 0) {
    run.note(1, "no source");
    return;
  }
  for (const source of register) {
    if (!(await fetchSource(run, source, "companies"))) continue;
    run.counts.scanned += run.counts.sources[source.id]?.fetched ?? 0;
    const key = sourceKey(source);
    const scope = getConnector(source.connector).scopeSchema.parse(sourceConfig.parse(source.config).scope);
    try {
      if (key) await enrichCompanies(run, { id: source.id, scope: scope as CompaniesHouseScope, apiKey: key.apiKey });
    } catch (error) {
      if (error instanceof KeyRejectedError) throw error;
      failSource(run, source, error);
    }
  }
  await geocodePlaces(run);
  const n = run.counts.newTargets;
  run.note(1, `${n} new ${n === 1 ? "company" : "companies"}`);
}

const NOUNS: Record<string, string> = { hacker_news: "posts", reddit: "posts", csv: "rows" };

async function otherSourcesStep(run: RunContext, sources: Source[]) {
  run.step(2);
  const others = sources.filter((x) => x.connector !== "companies_house");
  if (others.length === 0) {
    run.note(2, "none connected");
    return;
  }
  const before = run.counts.newTargets;
  let companiesAdded = false;
  for (const source of others) {
    const result = await fetchSource(run, source, NOUNS[source.connector] ?? "items");
    if (!result || source.connector !== "csv") continue;
    companiesAdded ||= result.targetIds.length > 0;
    const scope = csvScope.safeParse(sourceConfig.parse(source.config).scope);
    if (scope.data?.purpose === "clients") {
      const n = markClients(source.id, result.targetIds);
      run.log(source.name, `${n} ${n === 1 ? "client" : "clients"} added`);
    }
  }
  if (companiesAdded) await checkListedCompanies(run, others.find((x) => x.connector === "csv")!.id);
  run.note(2, `${run.counts.newTargets - before} new`);
}

// Companies from an uploaded list: clients without a number are looked up by
// name, then any with a number are enriched like Companies House finds.
async function checkListedCompanies(run: RunContext, sourceId: string) {
  const apiKey = readKey(run.workspaceId, "companies_house");
  if (!apiKey) {
    run.log("Companies House", "Not connected, so the uploaded companies weren’t checked", "error");
    return;
  }
  await matchClients(run, apiKey);
  await enrichCompanies(run, { id: sourceId, scope: companiesHouseConnector.defaultScope(), apiKey });
  await geocodePlaces(run);
}

// Clients are analysed before leads are reviewed, so the reviews use the
// ideal client they rewrite. Clients not yet matched at Companies House are
// tried again first.
async function clientsStep(run: RunContext) {
  const apiKey = readKey(run.workspaceId, "companies_house");
  const listId = clientListSource(run.workspaceId);
  if (apiKey && listId && (await matchClients(run, apiKey)) > 0) {
    await enrichCompanies(run, { id: listId, scope: companiesHouseConnector.defaultScope(), apiKey });
  }
  try {
    if ((await analyseClients(run)) > 0) await refreshIdealClient(run);
  } catch (error) {
    if (error instanceof KeyRejectedError) throw error;
    run.log(defaultAiName(run.workspaceId), `Client analysis stopped: ${error instanceof Error ? error.message : "something failed"}`, "error");
  }
  if (!lookalikesDue(run)) return;
  try {
    run.priorityIds = await findLookalikes(run, apiKey);
    if (apiKey && listId && run.priorityIds.length > 0) {
      await enrichCompanies(run, { id: listId, scope: companiesHouseConnector.defaultScope(), apiKey });
      await geocodePlaces(run);
    }
  } catch (error) {
    if (error instanceof KeyRejectedError) throw error;
    run.log(defaultAiName(run.workspaceId), `Lookalike search stopped: ${error instanceof Error ? error.message : "something failed"}`, "error");
  }
}

function scheduleSources(sources: Source[]) {
  const now = new Date();
  for (const source of sources) {
    const schedule = sourceConfig.safeParse(source.config).data?.schedule ?? "hourly";
    db.update(s)
      .set({ lastRunAt: now.toISOString(), nextRunAt: nextRunAt(schedule, now).toISOString() })
      .where(eq(s.id, source.id))
      .run();
  }
}

export function formatDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return min ? `${min} min ${sec} s` : `${sec} s`;
}

// The reason Home shows under "The 15:00 run stopped".
function stoppedReason(error: unknown, step: number): { actor: string; log: string; reason: string } {
  if (error instanceof KeyRejectedError) {
    const vendor = SERVICE_VENDOR[error.service];
    if (error.service === "companies_house") {
      return {
        actor: "Companies House",
        log: "Key rejected, run stopped",
        reason: `${vendor} rejected the key at ${step === 1 ? "the first step" : `step ${step}`}, so no new companies were fetched. Earlier runs aren’t affected.`,
      };
    }
    const name = PROVIDER_LABELS[error.service as AiProvider]?.name ?? vendor;
    return {
      actor: name,
      log: "Key rejected, run stopped",
      reason: `${vendor} rejected the ${name} key at step ${step}, so the new companies weren’t reviewed. They’re saved and will be reviewed once the key is replaced. Earlier runs aren’t affected.`,
    };
  }
  if (error instanceof StopRunError) {
    return { actor: error.actor, log: `${error.message} Run stopped.`, reason: `${error.message} Earlier runs aren’t affected.` };
  }
  return {
    actor: "Run",
    log: `Stopped at step ${step}: something ${plainReason(error)}`,
    reason: `The run stopped at step ${step} because something ${plainReason(error)}. Earlier runs aren’t affected.`,
  };
}

function finish(run: RunContext, status: "done" | "failed", error: string | null) {
  db.update(schema.runs)
    .set({ status, error, counts: { ...run.counts, progress: null }, finishedAt: new Date().toISOString() })
    .where(eq(schema.runs.id, run.runId))
    .run();
}

export async function executeRun(runId: string): Promise<void> {
  const row = db.select().from(schema.runs).where(eq(schema.runs.id, runId)).get();
  if (!row) return;
  const run = new RunContext(runId, row.workspaceId, row.kind, row.sourceId, row.findLookalikes === 1);
  let sources: Source[] = [];
  let step: 1 | 2 | 3 | 4 = 1;

  // Everything sits inside the try, so whatever goes wrong, the run ends as
  // failed rather than staying "running".
  try {
    // Settings added since setup, such as the starter ideal client.
    ensureDefaultSettings(row.workspaceId);
    sources = sourcesFor(run);
    await companiesHouseStep(run, sources);
    step = 2;
    await otherSourcesStep(run, sources);
    step = 3;
    run.step(3);
    await clientsStep(run);
    await reviewTargets(run);
    await resolvePossibleCompanies(run, readKey(run.workspaceId, "companies_house"));
    enforceSpendCaps(run);
    step = 4;
    run.step(4);
    await writeSummary(run);
    run.note(4, "done");
    run.log("Run", `Finished in ${formatDuration(Date.now() - run.startedAt)}`);
    finish(run, "done", null);
  } catch (error) {
    if (error instanceof KeyRejectedError) rejectKey(run.workspaceId, error.service);
    const stopped = stoppedReason(error, step);
    run.log(stopped.actor, stopped.log, "error");
    finish(run, "failed", stopped.reason);
  } finally {
    // Always move the schedule on, or a failing run would be queued again
    // every minute.
    scheduleSources(sources);
  }
}
