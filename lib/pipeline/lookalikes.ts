import { getBusinessName } from "@/lib/business/store";
import { generateText, Output } from "ai";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { estimateCostGbp } from "@/lib/ai/cost";
import { lookalikePrompt, lookalikeResearchPrompt, lookalikeSystem, type LookalikeInput } from "@/lib/ai/prompts";
import { defaultAiName, getModel, type ResolvedModel } from "@/lib/ai/provider";
import { LookalikeDraft, toLookalikes, type Lookalike } from "@/lib/ai/schemas";
import type { KeyService } from "@/lib/credentials/services";
import { createCompaniesHouseClient, type CompaniesHouseClient } from "@/lib/connectors/companies-house/client";
import { titleCaseCompanyName } from "@/lib/connectors/companies-house/names";
import { db, schema } from "@/lib/db";
import { upsertDraft } from "@/lib/ontology/upsert";
import { getSetting, setSetting } from "@/lib/settings";
import { clientListSource, singleMatch } from "./clients";
import type { RunContext } from "./context";
import { isAuthError, KeyRejectedError, plainReason } from "./errors";
import { postcodeOfSnippet } from "./matches";
import { mapLimit } from "./pool";
import { addSpend, searchCallsIn, spendOf, type Spend } from "@/lib/ai/usage";

// Find lookalikes: for each analysed client, the writing model (with web
// search when it's on) suggests up to 5 London companies like it. Each name is
// looked up at Companies House and kept only when exactly one active company
// matches. Matches become company targets with a resembles link to the client;
// enrichment and review then treat them like any other target.

const t = schema.targets;
const c = schema.clients;
const l = schema.links;
const PARALLEL = 3;
// Clients searched per run, longest since their last search first, so a long
// client list is covered over several runs without one run costing too much.
const MAX_CLIENTS = 20;

type ClientRow = { id: string; name: string; companyNumber: string | null; segment: string | null; whatTheyDo: string | null; whySigned: string | null };

function clientsToSearch(workspaceId: string): ClientRow[] {
  return db
    .select({ id: t.id, name: t.name, companyNumber: t.companyNumber, segment: c.segment, whatTheyDo: c.whatTheyDo, whySigned: c.whySigned })
    .from(t)
    .innerJoin(c, eq(c.targetId, t.id))
    .where(and(eq(t.workspaceId, workspaceId), eq(t.isDemo, 0), isNotNull(c.analysedAt)))
    .orderBy(sql`${c.lookalikesAt} is not null`, asc(c.lookalikesAt))
    .limit(MAX_CLIENTS)
    .all();
}

/** Companies already suggested for this client, so a new search finds new ones. */
function alreadyFound(clientId: string): string[] {
  return db
    .select({ name: t.name })
    .from(l)
    .innerJoin(t, eq(t.id, l.fromId))
    .where(and(eq(l.kind, "resembles"), eq(l.toId, clientId)))
    .all()
    .map((r) => r.name);
}

/** Whether lookalikes should be searched in this run. */
export function lookalikesDue(run: RunContext): boolean {
  if (run.lookalikes) return true;
  if (run.kind !== "scheduled" || !getSetting(run.workspaceId, "lookalikes_daily")) return false;
  const last = getSetting(run.workspaceId, "lookalikes_last_at");
  return !last || new Date(last).toDateString() !== new Date().toDateString();
}

async function suggest(run: RunContext, ai: ResolvedModel, input: LookalikeInput): Promise<{ found: Lookalike[]; spend: Spend }> {
  let research: LookalikeInput["research"] = null;
  let spend: Spend = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
  if (Object.keys(ai.tools).length > 0) {
    try {
      const result = await generateText({
        model: ai.model,
        tools: ai.tools,
        providerOptions: ai.searchOptions,
        prompt: lookalikeResearchPrompt(input, getSetting(run.workspaceId, "max_searches_per_review")),
        maxOutputTokens: 2000,
      });
      const urls = [...new Set(result.sources.flatMap((s) => (s.sourceType === "url" ? [s.url] : [])))];
      research = { notes: result.text, urls };
      spend = spendOf(result.totalUsage, searchCallsIn(result.steps));
    } catch (error) {
      // Suggestions from the model alone are still worth checking.
      if (isAuthError(error)) throw error;
    }
  }
  const result = await generateText({
    model: ai.model,
    system: lookalikeSystem(getBusinessName(run.workspaceId)),
    prompt: lookalikePrompt({ ...input, research }),
    output: Output.object({ schema: LookalikeDraft }),
    maxOutputTokens: 2000,
  });
  return { found: toLookalikes(result.output), spend: addSpend(spend, spendOf(result.totalUsage)) };
}

// One suggestion: the single active Companies House match becomes (or is
// found as) a company target, linked to the client.
async function matchOne(
  run: RunContext,
  ch: CompaniesHouseClient,
  sourceId: string,
  client: ClientRow,
  s: Lookalike,
): Promise<{ id: string; isNew: boolean } | null> {
  const found = await ch.searchCompanies(s.name, 20);
  const hit = singleMatch(s.name, found?.items ?? []);
  if (!hit || hit.company_number === client.companyNumber) return null;
  const existing = db
    .select({ id: t.id, isClient: t.isClient })
    .from(t)
    .where(and(eq(t.workspaceId, run.workspaceId), eq(t.isDemo, 0), eq(t.companyNumber, hit.company_number)))
    .get();
  if (existing?.isClient) return null;
  const postcode = postcodeOfSnippet(hit.address_snippet);
  const result = upsertDraft(
    { workspaceId: run.workspaceId, sourceId },
    {
      targets: [
        {
          ref: "company",
          kind: "company",
          name: titleCaseCompanyName(hit.title),
          companyNumber: hit.company_number,
          status: hit.company_status,
          placeRef: hit.address_snippet ? "office" : undefined,
        },
      ],
      places: hit.address_snippet ? [{ ref: "office", postcode, address: hit.address_snippet }] : [],
      links: [
        {
          fromRef: "company",
          toRef: "client",
          kind: "resembles",
          attributes: { found_at: new Date().toISOString(), reason: s.reason, suggested_name: s.name },
        },
        ...(hit.address_snippet ? [{ fromRef: "company", toRef: "office", kind: "located_at" as const }] : []),
      ],
      signals: [],
      people: [],
    },
    { client: { type: "target", id: client.id } },
  );
  return result.targets[0] ?? null;
}

/** Runs the lookalike search. Returns the IDs of the targets it linked, for the review to take first. */
export async function findLookalikes(run: RunContext, apiKey: string | null): Promise<string[]> {
  const clients = clientsToSearch(run.workspaceId);
  const sourceId = clientListSource(run.workspaceId);
  if (clients.length === 0) {
    run.log(defaultAiName(run.workspaceId), "No analysed clients to find lookalikes for yet");
    return [];
  }
  if (!sourceId) {
    run.log("Run", "No client list upload to record lookalikes against", "error");
    return [];
  }
  if (!apiKey) {
    run.log("Companies House", "Not connected, so lookalikes couldn’t be checked", "error");
    return [];
  }
  const ai = getModel("writing", run.workspaceId);
  const ch = createCompaniesHouseClient(apiKey);
  const allClients = db.select({ name: t.name }).from(t).where(and(eq(t.workspaceId, run.workspaceId), eq(t.isClient, 1))).all().map((r) => r.name);
  const linked = new Set<string>();
  let suggested = 0;
  let rejected: KeyService | null = null;
  run.progress(0, clients.length);
  let done = 0;

  await mapLimit(clients, PARALLEL, async (client) => {
    if (rejected) return;
    try {
      const { found, spend } = await suggest(run, ai, {
        client: client.name,
        segment: client.segment,
        whatTheyDo: client.whatTheyDo,
        whySigned: client.whySigned,
        exclude: [...allClients.filter((n) => n !== client.name), ...alreadyFound(client.id)].slice(0, 40),
        research: null,
      });
      run.counts.reviewCostGbp += estimateCostGbp({ modelId: ai.modelId, ...spend });
      suggested += found.length;
      for (const s of found) {
        try {
          const match = await matchOne(run, ch, sourceId, client, s);
          if (!match) continue;
          linked.add(match.id);
          if (match.isNew && !run.counts.newTargetIds.includes(match.id)) {
            run.counts.newTargets++;
            run.counts.newTargetIds.push(match.id);
          }
        } catch (error) {
          if (isAuthError(error)) {
            rejected = "companies_house";
            return;
          }
          run.log("Companies House", `Couldn’t look up ${s.name} (${plainReason(error)})`, "error");
        }
      }
      db.update(c).set({ lookalikesAt: new Date().toISOString() }).where(eq(c.targetId, client.id)).run();
    } catch (error) {
      if (isAuthError(error)) {
        rejected = ai.provider;
        return;
      }
      run.log(ai.name, `Couldn’t find lookalikes for ${client.name}: ${ai.vendor} ${plainReason(error)}`, "error");
    }
    run.progress(++done, clients.length);
  });
  if (rejected) throw new KeyRejectedError(rejected);

  setSetting(run.workspaceId, "lookalikes_last_at", new Date().toISOString());
  const n = linked.size;
  run.log(ai.name, `${suggested} lookalikes suggested for ${clients.length} ${clients.length === 1 ? "client" : "clients"}, ${n} matched at Companies House`);
  return [...linked];
}
