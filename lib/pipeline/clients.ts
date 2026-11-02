import { getBusinessName } from "@/lib/business/store";
import { generateText, Output } from "ai";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { estimateCostGbp } from "@/lib/ai/cost";
import { clientPrompt, clientSystem, idealClientPrompt } from "@/lib/ai/prompts";
import { getModel, type ResolvedModel } from "@/lib/ai/provider";
import { ClientAnalysisDraft, clipWords, IdealClientDraft, toClientAnalysis } from "@/lib/ai/schemas";
import { createCompaniesHouseClient } from "@/lib/connectors/companies-house/client";
import { titleCaseCompanyName } from "@/lib/connectors/companies-house/names";
import { db, schema } from "@/lib/db";
import type { Target } from "@/lib/db/schema";
import { normaliseName } from "@/lib/ontology/names";
import { getSetting, setSetting } from "@/lib/settings";
import { formatAge } from "@/lib/targets/format";
import type { RunContext } from "./context";
import { isAuthError, KeyRejectedError, plainReason } from "./errors";
import { mapLimit } from "./pool";
import { addSpend, spendOf } from "@/lib/ai/usage";
import { research } from "./review";
import { subjectOf } from "./review-input";

// The user's own clients, uploaded as a CSV with purpose "clients": the rows
// become company targets marked is_client, names without a company number
// are looked up at Companies House, then each client is analysed and the
// ideal-client text rewritten from them, unless someone has edited it.

const t = schema.targets;
const c = schema.clients;
const PARALLEL = 3;

/** The newest clients upload, which client lookups and lookalikes are recorded against. */
export function clientListSource(workspaceId: string): string | null {
  const s = schema.sources;
  const row = db
    .select({ id: s.id })
    .from(s)
    .where(and(eq(s.workspaceId, workspaceId), eq(s.connector, "csv"), sql`json_extract(${s.config}, '$.scope.purpose') = 'clients'`))
    .orderBy(desc(s.createdAt))
    .get();
  return row?.id ?? null;
}

/** Marks the targets a clients upload landed on as clients. */
export function markClients(sourceId: string, targetIds: string[]): number {
  const ids = [...new Set(targetIds)];
  for (const id of ids) {
    // The signed date travels on the row's imported signal.
    const signal = db
      .select({ occurredAt: schema.signals.occurredAt, attributes: schema.signals.attributes })
      .from(schema.signals)
      .where(and(eq(schema.signals.targetId, id), eq(schema.signals.sourceId, sourceId), eq(schema.signals.type, "imported")))
      .orderBy(desc(schema.signals.occurredAt))
      .get();
    const signedOn = (signal?.attributes?.signed_on as string | null | undefined) ?? null;
    db.update(t).set({ isClient: 1 }).where(eq(t.id, id)).run();
    db.insert(c)
      .values({ targetId: id, signedOn })
      .onConflictDoUpdate({ target: c.targetId, set: signedOn ? { signedOn } : { targetId: id } })
      .run();
  }
  return ids.length;
}

type SearchItem = { company_number: string; title: string; company_status?: string; address_snippet?: string };

/** The one active company whose name matches exactly once normalised, if there is one. */
export function singleMatch(name: string, items: SearchItem[]): SearchItem | null {
  const wanted = normaliseName(name);
  const active = items.filter((i) => (i.company_status ?? "active") === "active");
  const exact = active.filter((i) => normaliseName(i.title) === wanted);
  if (exact.length === 1) return exact[0];
  return exact.length === 0 && active.length === 1 ? active[0] : null;
}

// Moves everything from one target to another, then deletes the first. Used
// when a client listed by name turns out to be a company already known.
function mergeInto(fromId: string, intoId: string) {
  db.transaction((tx) => {
    tx.update(schema.signals).set({ targetId: intoId }).where(eq(schema.signals.targetId, fromId)).run();
    tx.update(schema.links).set({ fromId: intoId }).where(and(eq(schema.links.fromType, "target"), eq(schema.links.fromId, fromId))).run();
    tx.update(schema.links).set({ toId: intoId }).where(and(eq(schema.links.toType, "target"), eq(schema.links.toId, fromId))).run();
    const client = tx.select().from(c).where(eq(c.targetId, fromId)).get();
    tx.update(t).set({ isClient: 1 }).where(eq(t.id, intoId)).run();
    if (client) {
      tx.delete(c).where(eq(c.targetId, fromId)).run();
      tx.insert(c)
        .values({ ...client, targetId: intoId, chMatch: "matched" })
        .onConflictDoUpdate({ target: c.targetId, set: { signedOn: client.signedOn, chMatch: "matched" } })
        .run();
    }
    tx.delete(t).where(eq(t.id, fromId)).run();
  });
}

/** Looks up clients that have no company number by name. Returns how many matched. */
export async function matchClients(run: RunContext, apiKey: string): Promise<number> {
  const rows = db
    .select({ id: t.id, name: t.name })
    .from(t)
    .innerJoin(c, eq(c.targetId, t.id))
    .where(and(eq(t.workspaceId, run.workspaceId), eq(t.isDemo, 0), isNull(t.companyNumber), isNull(c.chMatch)))
    .all();
  if (rows.length === 0) return 0;
  const client = createCompaniesHouseClient(apiKey);
  let matched = 0;
  let missed = 0;
  for (const row of rows) {
    try {
      const found = await client.searchCompanies(row.name, 20);
      const hit = singleMatch(row.name, found?.items ?? []);
      if (!hit) {
        db.update(c).set({ chMatch: "none" }).where(eq(c.targetId, row.id)).run();
        missed++;
        continue;
      }
      const existing = db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.workspaceId, run.workspaceId), eq(t.isDemo, 0), eq(t.companyNumber, hit.company_number)))
        .get();
      if (existing && existing.id !== row.id) mergeInto(row.id, existing.id);
      else {
        db.update(t).set({ companyNumber: hit.company_number, name: titleCaseCompanyName(hit.title) }).where(eq(t.id, row.id)).run();
        db.update(c).set({ chMatch: "matched" }).where(eq(c.targetId, row.id)).run();
      }
      matched++;
    } catch (error) {
      if (isAuthError(error)) throw new KeyRejectedError("companies_house");
      run.log("Companies House", `Couldn’t look up ${row.name} (${plainReason(error)})`, "error");
    }
  }
  run.log("Companies House", `${matched} ${matched === 1 ? "client" : "clients"} matched by name${missed ? `, ${missed} not found` : ""}`);
  return matched;
}

function notesFor(targetId: string): string | null {
  const row = db
    .select({ body: schema.signals.body })
    .from(schema.signals)
    .where(and(eq(schema.signals.targetId, targetId), eq(schema.signals.type, "imported"), sql`${schema.signals.body} is not null`))
    .orderBy(desc(schema.signals.occurredAt))
    .get();
  return row?.body ?? null;
}

async function analyseOne(run: RunContext, ai: ResolvedModel, target: Target, signedOn: string | null) {
  const subject = subjectOf(target);
  const notes = notesFor(target.id);
  const searching = Object.keys(ai.tools).length > 0;
  const found = searching ? await research(ai, subject, getSetting(run.workspaceId, "max_searches_per_review")).catch(() => null) : null;
  const result = await generateText({
    model: ai.model,
    system: clientSystem(getBusinessName(run.workspaceId)),
    prompt: clientPrompt({ subject, website: target.url, notes, signedOn, research: found ? { notes: found.notes, urls: found.urls } : null }),
    output: Output.object({ schema: ClientAnalysisDraft }),
    maxOutputTokens: 2000,
  });
  const allowed = new Set([...(found?.urls ?? []), ...(target.url ? [target.url] : [])]);
  const analysis = toClientAnalysis(result.output, allowed);
  const spend = found ? addSpend(found.spend, spendOf(result.totalUsage)) : spendOf(result.totalUsage);
  run.counts.reviewCostGbp += estimateCostGbp({ modelId: ai.modelId, ...spend });
  db.update(c)
    .set({
      whatTheyDo: analysis.what_they_do,
      segment: analysis.segment,
      whySigned: analysis.why_they_signed,
      whySource: notes ? "your notes" : "inferred",
      sources: analysis.sources,
      analysedAt: new Date().toISOString(),
      analysedBy: ai.name,
    })
    .where(eq(c.targetId, target.id))
    .run();
}

/** Analyses every client not analysed yet. Returns how many were. */
export async function analyseClients(run: RunContext): Promise<number> {
  const rows = db
    .select({ target: t, signedOn: c.signedOn, chMatch: c.chMatch })
    .from(t)
    .innerJoin(c, eq(c.targetId, t.id))
    .where(and(eq(t.workspaceId, run.workspaceId), eq(t.isDemo, 0), isNull(c.analysedAt)))
    .all()
    // A name Companies House couldn't match, with no website, gives nothing to
    // analyse; the page asks for its company number instead.
    .filter((r) => !(r.chMatch === "none" && !r.target.companyNumber && !r.target.url));
  if (rows.length === 0) return 0;
  const ai = getModel("writing", run.workspaceId);
  let done = 0;
  let rejected = false;
  run.progress(0, rows.length);
  await mapLimit(rows, PARALLEL, async ({ target, signedOn }) => {
    if (rejected) return;
    try {
      await analyseOne(run, ai, target, signedOn);
      done++;
    } catch (error) {
      if (isAuthError(error)) {
        rejected = true;
        return;
      }
      run.log(ai.name, `Couldn’t analyse ${target.name}: ${ai.vendor} ${plainReason(error)}`, "error");
    }
    run.progress(done, rows.length);
  });
  if (rejected) throw new KeyRejectedError(ai.provider);
  run.log(ai.name, `${done} ${done === 1 ? "client" : "clients"} analysed`);
  return done;
}

/** Rewrites the ideal client from every analysed client, or holds the rewrite
 *  as a suggestion when someone has edited the text. */
export async function refreshIdealClient(run: RunContext): Promise<void> {
  const rows = db
    .select({ name: t.name, incorporatedOn: t.incorporatedOn, segment: c.segment, whatTheyDo: c.whatTheyDo, whySigned: c.whySigned })
    .from(t)
    .innerJoin(c, eq(c.targetId, t.id))
    .where(and(eq(t.workspaceId, run.workspaceId), eq(t.isDemo, 0), sql`${c.analysedAt} is not null`))
    .all();
  if (rows.length === 0) return;
  const ai = getModel("writing", run.workspaceId);
  const result = await generateText({
    model: ai.model,
    prompt: idealClientPrompt(getBusinessName(run.workspaceId), rows.map((r) => ({ ...r, age: formatAge(r.incorporatedOn) }))),
    output: Output.object({ schema: IdealClientDraft }),
    maxOutputTokens: 4000,
  });
  run.counts.reviewCostGbp += estimateCostGbp({ modelId: ai.modelId, ...spendOf(result.totalUsage) });
  const text = clipWords(result.output.text, 60);
  const writtenAt = new Date().toISOString();
  const current = getSetting(run.workspaceId, "ideal_client");
  if (current.edited_by_user) {
    setSetting(run.workspaceId, "ideal_client_suggestion", { text, client_count: rows.length, written_at: writtenAt });
    run.log(ai.name, "Suggested an update to the ideal client; your edit is kept");
  } else {
    setSetting(run.workspaceId, "ideal_client", { text, edited_by_user: false, written_at: writtenAt, client_count: rows.length, written_by: ai.name });
    run.log(ai.name, `Rewrote the ideal client from ${rows.length} ${rows.length === 1 ? "client" : "clients"}`);
  }
}
