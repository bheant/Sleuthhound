import { z } from "zod";
import { checkAuthKey } from "../../../server/crypto";
import type { Env } from "../../../server/env";
import { fail, json, readBody, tooMany } from "../../../server/http";
import { hitAll, LIMITS } from "../../../server/rate-limit";
import { requireSession } from "../../../server/guard";
import { clearCookie } from "../../../server/session";
import { authKeySchema } from "../../../server/users";

// Deletes the account: the user row, and with it every session and login
// record. The browser deletes its own local data.

const input = z.object({ authKey: authKeySchema });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const session = await requireSession(request, env, { change: true });
  if (session instanceof Response) return session;
  const wait = await hitAll(env.DB, [[LIMITS.accountUser, session.user.id]]);
  if (wait) return tooMany(wait);
  const body = await readBody(request, input);
  if (!body || !(await checkAuthKey(body.authKey, session.user.auth_salt, session.user.auth_hash))) {
    return fail("Your password is wrong.", 401);
  }
  await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(session.user.id).run();
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
};
