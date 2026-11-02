import { randomToken, sha256Hex } from "./crypto";
import { findById, type UserRow } from "./users";

// Sessions: a random token in an HttpOnly, Secure, SameSite=Strict cookie,
// and its SHA-256 in D1, for 30 days.

export const COOKIE = "__Host-sh";
const DAYS = 30;
const MAX_AGE = DAYS * 24 * 60 * 60;
// last_seen_at is written at most this often, to save D1 writes.
const SEEN_EVERY_MS = 60 * 60_000;

const cookie = (value: string, maxAge: number) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

export const clearCookie = () => cookie("", 0);

/** Starts a session and returns the Set-Cookie header for it. */
export async function startSession(db: D1Database, userId: string, now = new Date()): Promise<string> {
  const token = randomToken();
  const expires = new Date(now.getTime() + MAX_AGE * 1000);
  await db
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(await sha256Hex(token), userId, now.toISOString(), expires.toISOString())
    .run();
  // Now and then, clear sessions that have ended.
  if (Math.random() < 0.05) await db.prepare("DELETE FROM sessions WHERE expires_at <= ?1").bind(now.toISOString()).run();
  return cookie(token, MAX_AGE);
}

function tokenOf(request: Request): string | null {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=") || null;
  }
  return null;
}

export type Session = { id: string; user: UserRow };

/** The signed-in user, or null. A disabled user's sessions don't count. */
export async function readSession(request: Request, db: D1Database, now = new Date()): Promise<Session | null> {
  const token = tokenOf(request);
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await db
    .prepare("SELECT user_id FROM sessions WHERE id = ?1 AND expires_at > ?2")
    .bind(id, now.toISOString())
    .first<{ user_id: string }>();
  if (!row) return null;
  const user = await findById(db, row.user_id);
  if (!user || user.disabled) return null;
  if (!user.last_seen_at || now.getTime() - Date.parse(user.last_seen_at) > SEEN_EVERY_MS) {
    await db.prepare("UPDATE users SET last_seen_at = ?2 WHERE id = ?1").bind(user.id, now.toISOString()).run();
  }
  return { id, user };
}

export async function endSession(request: Request, db: D1Database): Promise<void> {
  const token = tokenOf(request);
  if (token) await db.prepare("DELETE FROM sessions WHERE id = ?1").bind(await sha256Hex(token)).run();
}

/** Ends every session a user has, such as after a reset or when disabled. */
export function endAllSessions(db: D1Database, userId: string, exceptId?: string) {
  return exceptId
    ? db.prepare("DELETE FROM sessions WHERE user_id = ?1 AND id != ?2").bind(userId, exceptId).run()
    : db.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(userId).run();
}
