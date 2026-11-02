import { z } from "zod";
import { randomToken, sha256Hex } from "../../../../server/crypto";
import type { Env } from "../../../../server/env";
import { requireAdmin } from "../../../../server/guard";
import { fail, json, readBody } from "../../../../server/http";
import { endAllSessions } from "../../../../server/session";
import { findById } from "../../../../server/users";

// Turn an account off or on, or make a one-time reset link. A reset clears
// the password's auth hash and its wrapped key, and logs the user out
// everywhere; only their recovery code can then open their data again.

const RESET_HOURS = 24;
const input = z.object({ action: z.enum(["disable", "enable", "reset"]) });

export const onRequestPost: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
  const session = await requireAdmin(request, env, { change: true });
  if (session instanceof Response) return session;
  const body = await readBody(request, input);
  if (!body) return fail("Unknown action.", 400);
  const user = await findById(env.DB, String(params.id));
  if (!user) return fail("That account no longer exists.", 404);
  if (user.id === session.user.id) return fail("You can’t do that to your own account. Change your password in Settings.", 400);

  if (body.action === "disable") {
    await env.DB.prepare("UPDATE users SET disabled = 1 WHERE id = ?1").bind(user.id).run();
    await endAllSessions(env.DB, user.id);
    return json({ ok: true });
  }
  if (body.action === "enable") {
    await env.DB.prepare("UPDATE users SET disabled = 0 WHERE id = ?1").bind(user.id).run();
    return json({ ok: true });
  }

  const token = randomToken();
  const expires = new Date(Date.now() + RESET_HOURS * 3600_000).toISOString();
  await env.DB.prepare(
    `UPDATE users SET auth_salt = NULL, auth_hash = NULL, wrapped_by_password = NULL,
       reset_token_hash = ?2, reset_expires_at = ?3 WHERE id = ?1`,
  )
    .bind(user.id, await sha256Hex(token), expires)
    .run();
  await endAllSessions(env.DB, user.id);
  // The page's own address (already checked as this site), so the link works
  // in development too, where functions sit behind the Next dev server.
  const origin = request.headers.get("Origin") ?? new URL(request.url).origin;
  return json({ ok: true, link: `${origin}/?reset=${token}`, expiresAt: expires });
};
