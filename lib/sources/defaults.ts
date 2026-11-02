import { and, eq } from "drizzle-orm";
import { companiesHouseConnector } from "@/lib/connectors/companies-house/connector";
import { db, schema } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";
import { nextRunAt, type SourceConfig } from "./config";

// The first time a Companies House key connects, add a source for new London
// companies so Run now has something to do before anyone opens the wizard.
// Only once: if someone removes it later, it stays removed.

export const DEFAULT_SOURCE_NAME = "New London companies";

export function ensureDefaultCompaniesHouseSource(workspaceId: string): void {
  if (getSetting(workspaceId, "default_source_created")) return;
  const s = schema.sources;
  const c = schema.credentials;

  db.transaction((tx) => {
    const existing = tx
      .select({ id: s.id })
      .from(s)
      .where(and(eq(s.workspaceId, workspaceId), eq(s.connector, "companies_house"), eq(s.isDemo, 0)))
      .get();
    if (!existing) {
      const credential = tx
        .select({ id: c.id })
        .from(c)
        .where(and(eq(c.workspaceId, workspaceId), eq(c.service, "companies_house")))
        .get();
      const config: SourceConfig = {
        scope: companiesHouseConnector.defaultScope(),
        // Daily while the prototype is being built; Run now covers the rest.
        schedule: "daily",
        max_items: 200,
        // A safety net while the prototype runs unattended: the source pauses
        // once its reviews cost this much in a month.
        spend_cap_gbp: 10,
        weight: "normal",
        describe_text: null,
      };
      const source = tx
        .insert(s)
        .values({
          workspaceId,
          connector: "companies_house",
          name: DEFAULT_SOURCE_NAME,
          status: "connected",
          config,
          credentialId: credential?.id,
          nextRunAt: nextRunAt("daily").toISOString(),
        })
        .returning({ id: s.id })
        .get();
      tx.insert(schema.sourceVersions).values({ sourceId: source.id, version: 1, config }).run();
    }
  });
  setSetting(workspaceId, "default_source_created", true);
}
