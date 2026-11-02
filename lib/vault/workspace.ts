import { cleanBusinessName } from "@/lib/business/name";
import { db, schema } from "@/lib/db";
import { ensureDefaultSettings } from "@/lib/settings";
import { getVaultState } from "./session";

// A vault holds one workspace. Everything that used to come from the signed-in
// user's workspace comes from here.

export function readWorkspaceId(): string | null {
  return db.select({ id: schema.workspaces.id }).from(schema.workspaces).limit(1).get()?.id ?? null;
}

/** Creates the workspace and its default settings in a new database. The
 *  business name starts as the company given at sign-up; Settings changes it. */
export function initWorkspace(businessName: string | null = null): string {
  const name = cleanBusinessName(businessName) ?? "";
  const { id } = db.insert(schema.workspaces).values({ name }).returning({ id: schema.workspaces.id }).get();
  ensureDefaultSettings(id);
  return id;
}

/** The open workspace. Throws while the vault is locked. */
export function requireWorkspace(): string {
  const { workspaceId } = getVaultState();
  if (!workspaceId) throw new Error("The vault is locked.");
  return workspaceId;
}

/** True in the demo, where nothing may reach the network. */
export function isDemo(): boolean {
  return getVaultState().status === "demo";
}
