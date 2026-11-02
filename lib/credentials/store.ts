import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CredentialStatus } from "@/lib/db/schema";
import type { KeyService, KeyTestResult } from "./services";

// Stored API keys. They sit in the vault's database, which is encrypted at
// rest with the vault key. Only readKey returns a key, for the call to its own
// provider; pages get CredentialView, which never carries it.

export type CredentialView = {
  service: string;
  status: CredentialStatus;
  last4: string;
  message: string | null;
  lastTestedAt: string | null;
  lastUsedAt: string | null;
};

const t = schema.credentials;
const match = (workspaceId: string, service: string) => and(eq(t.workspaceId, workspaceId), eq(t.service, service));

export function credentialViews(workspaceId: string): CredentialView[] {
  return db
    .select({
      service: t.service,
      status: t.status,
      last4: t.last4,
      message: t.message,
      lastTestedAt: t.lastTestedAt,
      lastUsedAt: t.lastUsedAt,
    })
    .from(t)
    .where(eq(t.workspaceId, workspaceId))
    .all();
}

export function lastFour(key: string): string {
  return key.trim().slice(-4);
}

// Stores a key in the testing state, replacing any earlier key.
export function storeKey(workspaceId: string, service: KeyService, apiKey: string) {
  const values = { secret: apiKey, last4: lastFour(apiKey), status: "testing" as const, message: null, lastUsedAt: null };
  db.insert(t)
    .values({ workspaceId, service, ...values })
    .onConflictDoUpdate({ target: [t.workspaceId, t.service], set: values })
    .run();
}

export function readKey(workspaceId: string, service: KeyService): string | null {
  return db.select({ secret: t.secret }).from(t).where(match(workspaceId, service)).get()?.secret ?? null;
}

export function setKeyStatus(workspaceId: string, service: KeyService, status: CredentialStatus) {
  db.update(t).set({ status }).where(match(workspaceId, service)).run();
}

export function recordKeyTest(workspaceId: string, service: KeyService, result: KeyTestResult) {
  db.update(t)
    .set({
      status: result.ok ? "connected" : "rejected",
      message: result.message,
      lastTestedAt: new Date().toISOString(),
    })
    .where(match(workspaceId, service))
    .run();
}

export function deleteKey(workspaceId: string, service: KeyService) {
  db.delete(t).where(match(workspaceId, service)).run();
}

export function markKeyUsed(workspaceId: string, service: KeyService) {
  db.update(t).set({ lastUsedAt: new Date().toISOString() }).where(match(workspaceId, service)).run();
}
