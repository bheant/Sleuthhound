import { z } from "zod";
import { newAuthHash, sha256Hex } from "../../../server/crypto";
import type { Env } from "../../../server/env";
import { clientCountry, clientIp, fail, fromThisSite, json, readBody, tooMany } from "../../../server/http";
import { hitAll, LIMITS } from "../../../server/rate-limit";
import { endAllSessions, startSession } from "../../../server/session";
import { authKeySchema, publicUser, recordLogin, wrappedSchema, type UserRow } from "../../../server/users";

// A reset link from an admin. GET tells the page whose account it is, with
// the recovery-wrapped data key; POST sets the new password's auth key and
// data-key wrapping. A new recovery wrapping means the user started fresh
// without their recovery code.

const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const GONE = "This reset link has expired or been used. Ask your admin for a new one.";

async function userFor(db: D1Database, raw: string | null): Promise<UserRow | null> {
  if (!raw || !token.safeParse(raw).success) return null;
  return db
    .prepare("SELECT * FROM users WHERE reset_token_hash = ?1 AND reset_expires_at > ?2 AND disabled = 0")
    .bind(await sha256Hex(raw), new Date().toISOString())
    .first<UserRow>();
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const wait = await hitAll(env.DB, [[LIMITS.resetIp, clientIp(request)]]);
  if (wait) return tooMany(wait);
  const user = await userFor(env.DB, new URL(request.url).searchParams.get("token"));
  if (!user) return fail(GONE, 404);
  return json({ ok: true, email: user.email, name: user.name, wrapped: { byRecovery: user.wrapped_by_recovery } });
};

const input = z.object({
  token,
  authKey: authKeySchema,
  wrapped: z.object({ byPassword: wrappedSchema, byRecovery: wrappedSchema.optional() }),
});

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!fromThisSite(request)) return fail("Use the reset page on Sleuthhound.", 403);
  const wait = await hitAll(env.DB, [[LIMITS.resetIp, clientIp(request)]]);
  if (wait) return tooMany(wait);
  const body = await readBody(request, input);
  if (!body) return fail("That didn’t work. Open the reset link again.", 400);
  const user = await userFor(env.DB, body.token);
  if (!user) return fail(GONE, 404);

  const { salt, hash } = await newAuthHash(body.authKey);
  const byRecovery = body.wrapped.byRecovery ?? user.wrapped_by_recovery;
  await env.DB.prepare(
    `UPDATE users SET auth_salt = ?2, auth_hash = ?3, wrapped_by_password = ?4, wrapped_by_recovery = ?5,
       reset_token_hash = NULL, reset_expires_at = NULL WHERE id = ?1`,
  )
    .bind(user.id, salt, hash, body.wrapped.byPassword, byRecovery)
    .run();
  await endAllSessions(env.DB, user.id);
  await recordLogin(env.DB, user.id, clientCountry(request));
  const setCookie = await startSession(env.DB, user.id);
  return json({ ok: true, user: publicUser(user), wrapped: { byPassword: body.wrapped.byPassword } }, 200, { "Set-Cookie": setCookie });
};
