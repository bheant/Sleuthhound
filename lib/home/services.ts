import { and, asc, eq } from "drizzle-orm";
import type { DotStatus } from "@/components/ui/StatusDot";
import { credentialViews, type CredentialView } from "@/lib/credentials/store";
import { PROVIDER_LABELS, AI_PROVIDERS } from "@/lib/ai/provider";
import { failedLabel, type KeyService } from "@/lib/credentials/services";
import { db, schema } from "@/lib/db";
import type { Source } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";

// The line at the bottom of Home: every source and service with its status,
// in words beside the dot. Of the AIs, the default always shows; the others
// only once they have a key.

export type ServiceItem = { name: string; dot: DotStatus; text: string };

const SOURCE_DOT: Record<Source["status"], DotStatus> = {
  connected: "ok",
  paused: "off",
  failed: "error",
  awaiting_approval: "awaiting",
};

const SOURCE_TEXT: Record<Source["status"], string> = {
  connected: "connected",
  paused: "paused",
  failed: "failed",
  awaiting_approval: "awaiting approval",
};

function keyItem(name: string, service: KeyService, views: CredentialView[], connected: string): ServiceItem {
  const v = views.find((c) => c.service === service);
  if (!v) return { name, dot: "off", text: "not connected" };
  if (v.status === "testing") return { name, dot: "testing", text: "testing" };
  if (v.status === "rejected") return { name, dot: "error", text: failedLabel(service, v.message).toLowerCase() };
  return { name, dot: "ok", text: connected };
}

export function homeServices(workspaceId: string): ServiceItem[] {
  const views = credentialViews(workspaceId);
  const s = schema.sources;
  const sources = db
    .select({ name: s.name, connector: s.connector, status: s.status })
    .from(s)
    .where(and(eq(s.workspaceId, workspaceId), eq(s.isDemo, 0)))
    .orderBy(asc(s.createdAt))
    .all();

  // Companies House is one item for the key and its sources: a working key
  // with a failed or paused source shows the source's state.
  const ch = keyItem("Companies House", "companies_house", views, "connected");
  const chSources = sources.filter((x) => x.connector === "companies_house");
  const chProblem = chSources.find((x) => x.status === "failed") ?? chSources.find((x) => x.status === "paused");
  const companiesHouse = ch.dot === "ok" && chProblem ? { ...ch, dot: SOURCE_DOT[chProblem.status], text: SOURCE_TEXT[chProblem.status] } : ch;

  const others: ServiceItem[] = [];
  for (const x of sources) {
    if (x.connector === "companies_house" || others.some((o) => o.name === x.name)) continue;
    others.push({ name: x.name, dot: SOURCE_DOT[x.status], text: SOURCE_TEXT[x.status] });
  }

  const defaultAi = getSetting(workspaceId, "default_ai");
  const ais = AI_PROVIDERS.filter((p) => p === defaultAi || views.some((v) => v.service === p)).map((p) =>
    keyItem(PROVIDER_LABELS[p].name, p, views, p === defaultAi ? "connected, default AI" : "connected, standby"),
  );
  return [
    companiesHouse,
    ...others,
    ...ais,
    keyItem("Apollo", "apollo", views, "connected"),
    keyItem("HubSpot", "hubspot", views, "connected"),
  ];
}
