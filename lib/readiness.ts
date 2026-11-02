import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSetting } from "@/lib/settings";

const AI_SERVICES = { anthropic: "anthropic", openai: "openai", xai: "xai" } as const;

function isConnected(workspaceId: string, service: string): boolean {
  const row = db
    .select({ status: schema.credentials.status })
    .from(schema.credentials)
    .where(and(eq(schema.credentials.workspaceId, workspaceId), eq(schema.credentials.service, service)))
    .get();
  return row?.status === "connected";
}

// Run now is disabled until Companies House and the default AI are connected.
export function canRunNow(workspaceId: string): boolean {
  const defaultAi = AI_SERVICES[getSetting(workspaceId, "default_ai")];
  return isConnected(workspaceId, "companies_house") && isConnected(workspaceId, defaultAi);
}
