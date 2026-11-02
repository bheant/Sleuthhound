import { and, eq, isNotNull, sql } from "drizzle-orm";
import { createCompaniesHouseClient } from "@/lib/connectors/companies-house/client";
import { titleCaseCompanyName } from "@/lib/connectors/companies-house/names";
import { db, schema } from "@/lib/db";
import { upsertDraft } from "@/lib/ontology/upsert";
import { singleMatch } from "./clients";
import type { RunContext } from "./context";
import { isAuthError, KeyRejectedError, plainReason } from "./errors";

// A conversation whose review names a company is looked up at Companies
// House. One active match becomes a company target (if it's new) with a
// possible_match link from the conversation; Confirm or Not them on the
// Conversations tab settles it.

const t = schema.targets;
const r = schema.reviews;
const l = schema.links;

const POSTCODE = /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i;

/** "71-75 Shelton Street, London, WC2H 9JQ" → "WC2H 9JQ". */
export function postcodeOfSnippet(snippet: string | undefined): string | undefined {
  return snippet?.match(POSTCODE)?.[1]?.toUpperCase();
}

function unresolved(runId: string) {
  return db
    .select({ id: t.id, sourceId: t.firstSourceId, name: r.possibleCompanyName })
    .from(r)
    .innerJoin(t, eq(t.id, r.targetId))
    .where(
      and(
        eq(r.runId, runId),
        eq(t.kind, "conversation"),
        isNotNull(r.possibleCompanyName),
        sql`not exists (select 1 from ${l} where ${l.fromId} = ${t.id} and ${l.kind} = 'possible_match')`,
      ),
    )
    .all();
}

export async function resolvePossibleCompanies(run: RunContext, apiKey: string | null): Promise<void> {
  const rows = unresolved(run.runId);
  if (rows.length === 0) return;
  if (!apiKey) {
    run.log("Companies House", `${rows.length} conversations name a company, but Companies House isn’t connected to check them`);
    return;
  }
  const client = createCompaniesHouseClient(apiKey);
  let linked = 0;
  for (const row of rows) {
    if (!row.sourceId) continue;
    try {
      const found = await client.searchCompanies(row.name!, 20);
      const hit = singleMatch(row.name!, found?.items ?? []);
      if (!hit) continue;
      const postcode = postcodeOfSnippet(hit.address_snippet);
      upsertDraft(
        { workspaceId: run.workspaceId, sourceId: row.sourceId },
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
            { fromRef: "post", toRef: "company", kind: "possible_match", attributes: { name: row.name } },
            ...(hit.address_snippet ? [{ fromRef: "company", toRef: "office", kind: "located_at" as const }] : []),
          ],
          signals: [],
          people: [],
        },
        { post: { type: "target", id: row.id } },
      );
      linked++;
    } catch (error) {
      if (isAuthError(error)) throw new KeyRejectedError("companies_house");
      run.log("Companies House", `Couldn’t look up ${row.name} (${plainReason(error)})`, "error");
    }
  }
  if (linked) run.log("Companies House", `${linked} ${linked === 1 ? "conversation" : "conversations"} matched to a possible company`);
}
