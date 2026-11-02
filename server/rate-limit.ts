import { sha256Hex } from "./crypto";

// Fixed-window counters in D1. Keys are hashed, so the table holds no IP
// addresses or emails in the clear, and rows go once their window ends.

export type Limit = { name: string; max: number; windowMs: number };

export const LIMITS = {
  loginIp: { name: "login-ip", max: 10, windowMs: 15 * 60_000 },
  loginEmail: { name: "login-email", max: 5, windowMs: 15 * 60_000 },
  signupIp: { name: "signup-ip", max: 5, windowMs: 60 * 60_000 },
  resetIp: { name: "reset-ip", max: 10, windowMs: 15 * 60_000 },
  inviteIp: { name: "invite-ip", max: 20, windowMs: 15 * 60_000 },
  accountUser: { name: "account-user", max: 5, windowMs: 15 * 60_000 },
} satisfies Record<string, Limit>;

/** Counts one attempt. Returns the seconds to wait when over the limit, or 0. */
export async function hit(db: D1Database, limit: Limit, subject: string, now = Date.now()): Promise<number> {
  const key = `${limit.name}:${(await sha256Hex(`${limit.name}:${subject}`)).slice(0, 32)}`;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN reset_at <= ?3 THEN 1 ELSE count + 1 END,
         reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END
       RETURNING count, reset_at`,
    )
    .bind(key, now + limit.windowMs, now)
    .first<{ count: number; reset_at: number }>();
  await clearEnded(db, now);
  if (!row || row.count <= limit.max) return 0;
  return Math.max(1, Math.ceil((row.reset_at - now) / 1000));
}

// Clears windows that have ended, so a hashed address isn't kept past its
// window (an hour at most), as the privacy page says. Runs on every attempt
// and every app load; a delete that matches nothing writes nothing.
export function clearEnded(db: D1Database, now = Date.now()) {
  return db.prepare("DELETE FROM rate_limits WHERE reset_at <= ?1").bind(now).run();
}

/** Checks several limits; the longest wait wins. */
export async function hitAll(db: D1Database, checks: ReadonlyArray<readonly [Limit, string]>, now = Date.now()): Promise<number> {
  let wait = 0;
  for (const [limit, subject] of checks) wait = Math.max(wait, await hit(db, limit, subject, now));
  return wait;
}
