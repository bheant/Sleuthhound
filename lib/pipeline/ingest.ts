import { eq } from "drizzle-orm";
import { getConnector } from "@/lib/connectors/registry";
import { markKeyUsed, readKey } from "@/lib/credentials/store";
import { keyServiceSchema, type KeyService } from "@/lib/credentials/services";
import { db, schema } from "@/lib/db";
import type { Source } from "@/lib/db/schema";
import { upsertDraft } from "@/lib/ontology/upsert";
import { sourceConfig } from "@/lib/sources/config";
import type { RunContext } from "./context";
import { isAuthError, KeyRejectedError } from "./errors";

// One source's fetch: raw items are stored as they came, then each is
// normalised and upserted on its own, so one bad item never stops the rest.

export type IngestResult = {
  fetched: number;
  newTargetIds: string[];
  /** Every target the items landed on, new or existing. */
  targetIds: string[];
  failedItems: number;
};

export function sourceKey(source: Source): { service: KeyService; apiKey: string } | null {
  const connector = getConnector(source.connector);
  const service = keyServiceSchema.safeParse(connector.credentialService);
  if (!service.success) return null;
  const apiKey = readKey(source.workspaceId, service.data);
  return apiKey ? { service: service.data, apiKey } : null;
}

export async function ingestSource(run: RunContext, source: Source): Promise<IngestResult> {
  const connector = getConnector(source.connector);
  const config = sourceConfig.parse(source.config);
  const scope = connector.scopeSchema.parse(config.scope);
  const key = sourceKey(source);
  if (connector.needsKey && !key) throw new Error(`${connector.label} has no key. Add one on Connections.`);

  let fetched;
  try {
    fetched = await connector.fetch({
      workspaceId: run.workspaceId,
      sourceId: source.id,
      scope,
      apiKey: key?.apiKey ?? null,
      cursor: source.cursor,
      limit: config.max_items,
      log: (message, level) => run.log(connector.label, message, level),
    });
  } catch (error) {
    if (key && isAuthError(error)) throw new KeyRejectedError(key.service);
    throw error;
  }
  if (key) markKeyUsed(run.workspaceId, key.service);

  const now = new Date().toISOString();
  const purpose = (scope as { purpose?: string }).purpose;
  const newTargetIds: string[] = [];
  const targetIds: string[] = [];
  let failedItems = 0;
  for (const raw of fetched.items) {
    try {
      if (connector.filter && !connector.filter(raw, scope, config.mapping).keep) continue;
      const externalId = connector.externalId(raw);
      db.insert(schema.rawItems)
        .values({ workspaceId: run.workspaceId, sourceId: source.id, externalId, payload: raw })
        .onConflictDoUpdate({
          target: [schema.rawItems.sourceId, schema.rawItems.externalId],
          set: { payload: raw, fetchedAt: now },
        })
        .run();
      const draft = connector.normalise(raw, {
        workspaceId: run.workspaceId,
        sourceId: source.id,
        now,
        mapping: config.mapping,
        purpose,
      });
      // The source's signal weight applies unless the connector set its own.
      for (const signal of draft.signals) signal.weight ??= config.weight;
      const result = upsertDraft({ workspaceId: run.workspaceId, sourceId: source.id }, draft);
      for (const t of result.targets) {
        targetIds.push(t.id);
        if (t.isNew) newTargetIds.push(t.id);
      }
    } catch {
      failedItems++;
    }
  }

  db.update(schema.sources)
    .set({ cursor: fetched.cursor, status: "connected", lastError: null })
    .where(eq(schema.sources.id, source.id))
    .run();
  return { fetched: fetched.items.length, newTargetIds, targetIds, failedItems };
}
