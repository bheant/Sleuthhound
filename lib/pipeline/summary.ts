import { getBusinessName } from "@/lib/business/store";
import { generateText, Output } from "ai";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { SUMMARY_SYSTEM, summaryPrompt, type SummaryInput } from "@/lib/ai/prompts";
import { defaultAiName, getModel } from "@/lib/ai/provider";
import { RunSummary } from "@/lib/ai/schemas";
import { db, schema } from "@/lib/db";
import { formatTime } from "@/lib/format/time";
import { getSetting } from "@/lib/settings";
import type { RunContext } from "./context";
import { isAuthError, KeyRejectedError, plainReason } from "./errors";

// The plain-English run summary on Home.
// Written by the writing model from facts gathered here; falls back to a
// sentence built from the counts when there's nothing to say or the AI fails.

const t = schema.targets;
const r = schema.reviews;
const l = schema.links;

type Reviewed = { id: string; name: string; score: number; summary: string; whyNow: string | null; placeId: string | null };

function reviewedThisRun(runId: string): Reviewed[] {
  return db
    .select({ id: t.id, name: t.name, score: r.score, summary: r.summary, whyNow: r.whyNow, placeId: t.placeId })
    .from(r)
    .innerJoin(t, eq(t.id, r.targetId))
    .where(and(eq(r.runId, runId), eq(t.kind, "company")))
    .orderBy(desc(r.score))
    .all();
}

function signalTitles(targetIds: string[]) {
  if (targetIds.length === 0) return [];
  const s = schema.signals;
  return db
    .select({ targetId: s.targetId, type: s.type, title: s.title, dueAt: s.dueAt })
    .from(s)
    .where(and(inArray(s.targetId, targetIds), ne(s.type, "incorporated")))
    .all();
}

// A director of one of this run's leads who also directs a client or another
// reviewed lead. Only people count: a corporate secretary such as a formation
// service sits on hundreds of companies and is no way in.
const PERSON_ROLE = sql`json_extract(${l.attributes}, '$.role') in ('director', 'llp-member', 'llp-designated-member')`;

function warmIntros(leads: Reviewed[], business: string | null): string[] {
  if (leads.length === 0) return [];
  const p = schema.people;
  const byId = new Map(leads.map((x) => [x.id, x]));
  const directors = db
    .select({ personId: l.fromId, targetId: l.toId, name: p.name })
    .from(l)
    .innerJoin(p, eq(p.id, l.fromId))
    .where(and(eq(l.kind, "directs"), inArray(l.toId, [...byId.keys()]), PERSON_ROLE))
    .all();
  const out: string[] = [];
  for (const d of directors) {
    const others = db
      .select({ id: t.id, name: t.name, isClient: t.isClient })
      .from(l)
      .innerJoin(t, eq(t.id, l.toId))
      .where(
        and(
          eq(l.fromId, d.personId),
          eq(l.kind, "directs"),
          ne(l.toId, d.targetId),
          or(eq(t.isClient, 1), sql`exists (select 1 from ${r} where ${r.targetId} = ${t.id})`),
        ),
      )
      .all();
    for (const o of others) {
      const lead = byId.get(d.targetId);
      out.push(`${d.name}, a director at ${lead?.name} [${d.targetId}], also runs ${o.name} [${o.id}]${o.isClient ? `, ${business ? `a client of ${business}` : "an existing client"}` : ""}`);
    }
  }
  return out.slice(0, 5);
}

// Registered offices shared by two or more of this run's leads: usually a
// formation agent or virtual office, so likely no accountant yet.
function sharedAddresses(leads: Reviewed[]): string[] {
  const groups = new Map<string, Reviewed[]>();
  for (const lead of leads) {
    if (!lead.placeId) continue;
    groups.set(lead.placeId, [...(groups.get(lead.placeId) ?? []), lead]);
  }
  const shared = [...groups.entries()].filter(([, g]) => g.length >= 2);
  if (shared.length === 0) return [];
  const places = db
    .select()
    .from(schema.places)
    .where(inArray(schema.places.id, shared.map(([id]) => id)))
    .all();
  return shared.map(([placeId, g]) => {
    const place = places.find((x) => x.id === placeId);
    const names = g.map((x) => `${x.name} [${x.id}]`).join(", ");
    return `${g.length} at ${place?.address ?? "the same address"}${place?.borough ? ` (${place.borough})` : ""}: ${names}`;
  });
}

function conversationsFound(newTargetIds: string[]): number {
  if (newTargetIds.length === 0) return 0;
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(t)
    .where(and(inArray(t.id, newTargetIds), eq(t.kind, "conversation")))
    .get();
  return row?.n ?? 0;
}

export function summaryFacts(run: RunContext, runTime: string, threshold: number): SummaryInput {
  const leads = reviewedThisRun(run.runId);
  const signals = signalTitles(leads.map((x) => x.id));
  const titlesFor = (id: string) =>
    signals.filter((s) => s.targetId === id).map((s) => `${s.title}${s.dueAt ? ` ${s.dueAt}` : ""}`);
  return {
    runTime,
    threshold,
    counts: {
      fetched: run.counts.fetched,
      newTargets: run.counts.newTargets,
      reviewed: run.counts.reviewed,
      matches: run.counts.matches,
    },
    top: leads.slice(0, 5).map((x) => ({ ...x, signals: titlesFor(x.id) })),
    warmIntros: warmIntros(leads, getBusinessName(run.workspaceId)),
    sharedAddresses: sharedAddresses(leads),
    overdue: leads.flatMap((x) => {
      const overdue = signals.filter((s) => s.targetId === x.id && s.type.endsWith("_overdue"));
      return overdue.length ? [{ id: x.id, name: x.name, what: overdue.map((s) => s.title.toLowerCase()).join(", ") }] : [];
    }),
    funding: leads.flatMap((x) => {
      const round = signals.find((s) => s.targetId === x.id && s.type === "funding_round");
      const allotted = signals.find((s) => s.targetId === x.id && s.type === "share_allotment");
      const what = round?.title ?? allotted?.title;
      return what ? [{ id: x.id, name: x.name, what }] : [];
    }),
    conversations: conversationsFound(run.counts.newTargetIds),
  };
}

// Used when nothing was reviewed or the AI couldn't write the summary.
export function plainSummary(facts: SummaryInput): { text: string; highlights: string[] } {
  const { runTime, counts, top, threshold } = facts;
  if (counts.reviewed === 0) {
    const companies = counts.newTargets - facts.conversations;
    const found = companies <= 0 ? "no new companies" : companies === 1 ? "1 new company" : `${companies} new companies`;
    const posts = facts.conversations === 1 ? " and 1 conversation" : facts.conversations > 1 ? ` and ${facts.conversations} conversations` : "";
    return { text: `The ${runTime} run found ${found}${posts}. Nothing new was reviewed.`, highlights: [] };
  }
  const best = top[0];
  const worth = counts.matches === 1 ? "1 company" : `${counts.matches} companies`;
  const lead =
    counts.matches > 0
      ? `The ${runTime} run found ${worth} worth a look.`
      : `The ${runTime} run reviewed ${counts.reviewed}, and none scored ${threshold} or more.`;
  return {
    text: best ? `${lead} The strongest is ${best.name}, scored ${best.score}: ${best.summary}.` : lead,
    highlights: best ? [best.id] : [],
  };
}

export async function writeSummary(run: RunContext): Promise<void> {
  const threshold = getSetting(run.workspaceId, "score_threshold");
  const started = db.select({ at: schema.runs.startedAt }).from(schema.runs).where(eq(schema.runs.id, run.runId)).get();
  const facts = summaryFacts(run, formatTime(started?.at ?? new Date().toISOString()), threshold);
  let summary = plainSummary(facts);

  if (facts.counts.reviewed > 0) {
    try {
      const ai = getModel("writing", run.workspaceId);
      const result = await generateText({
        model: ai.model,
        system: SUMMARY_SYSTEM,
        prompt: summaryPrompt(facts),
        output: Output.object({ schema: RunSummary }),
        maxOutputTokens: 4000,
      });
      const known = new Set([...facts.top.map((x) => x.id), ...facts.overdue.map((x) => x.id), ...idsIn(facts)]);
      summary = {
        text: [result.output.headline, ...result.output.paragraphs].map((p) => p.trim()).filter(Boolean).join("\n\n"),
        highlights: result.output.highlight_target_ids.filter((id) => known.has(id)),
      };
    } catch (error) {
      if (isAuthError(error)) throw new KeyRejectedError(getSetting(run.workspaceId, "default_ai"));
      run.log(defaultAiName(run.workspaceId), `The run summary couldn’t be written (${plainReason(error)}), so a short one was used`, "error");
    }
  }

  db.update(schema.runs)
    .set({ summary: summary.text, summaryHighlights: summary.highlights })
    .where(eq(schema.runs.id, run.runId))
    .run();
}

// IDs mentioned in the warm-intro and shared-address lines, in [brackets].
function idsIn(facts: SummaryInput): string[] {
  return [...facts.warmIntros, ...facts.sharedAddresses].flatMap((line) => [...line.matchAll(/\[([0-9a-f-]{36})\]/g)].map((m) => m[1]));
}
