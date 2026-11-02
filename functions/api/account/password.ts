import { z } from "zod";
import { checkAuthKey, newAuthHash } from "../../../server/crypto";
import type { Env } from "../../../server/env";
import { fail, json, readBody, tooMany } from "../../../server/http";
import { hitAll, LIMITS } from "../../../server/rate-limit";
import { requireSession } from "../../../server/guard";
import { endAllSessions } from "../../../server/session";
import { authKeySchema, wrappedSchema } from "../../../server/users";

// Change password: the current auth key proves it's the user; the new auth
// key and the data key re-wrapped for the new password replace the old. Other
// devices are logged out.

const input = z.object({ currentAuthKey: authKeySchema, newAuthKey: authKeySchema, byPassword: wrappedSchema });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const session = await requireSession(request, env, { change: true });
  if (session instanceof Response) return session;
  const wait = await hitAll(env.DB, [[LIMITS.accountUser, session.user.id]]);
  if (wait) return tooMany(wait);
  const body = await readBody(request, input);
  if (!body) return fail("That didn’t work. Try again.", 400);
  if (!(await checkAuthKey(body.currentAuthKey, session.user.auth_salt, session.user.auth_hash))) {
    return fail("Your current password is wrong.", 401);
  }
  const { salt, hash } = await newAuthHash(body.newAuthKey);
  await env.DB.prepare("UPDATE users SET auth_salt = ?2, auth_hash = ?3, wrapped_by_password = ?4 WHERE id = ?1")
    .bind(session.user.id, salt, hash, body.byPassword)
    .run();
  await endAllSessions(env.DB, session.user.id, session.id);
  return json({ ok: true });
};
