import { z } from "zod";
import { randomToken, sha256Hex } from "./crypto";

// Single-use sign-up invites, valid for 7 days, optionally for one email.

export const INVITE_DAYS = 7;
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export type InviteRow = {
  id: string;
  token_hash: string;
  email: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
};

export const INVITE_GONE = "This invite has expired or been used. Ask for a new one.";

export async function createInvite(db: D1Database, createdBy: string | null, email: string | null, now = new Date()) {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 24 * 3600_000).toISOString();
  await db
    .prepare("INSERT INTO invites (id, token_hash, email, created_by, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(crypto.randomUUID(), await sha256Hex(token), email, createdBy, now.toISOString(), expiresAt)
    .run();
  return { token, expiresAt };
}

/** The invite for a token, if it's unused and not expired. */
export async function validInvite(db: D1Database, token: string, now = new Date()): Promise<InviteRow | null> {
  if (!inviteTokenSchema.safeParse(token).success) return null;
  return db
    .prepare("SELECT * FROM invites WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2")
    .bind(await sha256Hex(token), now.toISOString())
    .first<InviteRow>();
}

/** Marks an invite used, unless someone else got there first. True when this call used it. */
export async function claimInvite(db: D1Database, id: string, now = new Date()): Promise<boolean> {
  const row = await db
    .prepare("UPDATE invites SET used_at = ?2 WHERE id = ?1 AND used_at IS NULL RETURNING id")
    .bind(id, now.toISOString())
    .first<{ id: string }>();
  return Boolean(row);
}

export function releaseInvite(db: D1Database, id: string) {
  return db.prepare("UPDATE invites SET used_at = NULL, used_by = NULL WHERE id = ?1").bind(id).run();
}

export function inviteUsedBy(db: D1Database, id: string, userId: string) {
  return db.prepare("UPDATE invites SET used_by = ?2 WHERE id = ?1").bind(id, userId).run();
}
