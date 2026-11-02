import { z } from "zod";
import { checkAuthKey } from "../../../server/crypto";
import type { Env } from "../../../server/env";
import { clientCountry, clientIp, fail, fromThisSite, json, readBody, tooMany } from "../../../server/http";
import { hitAll, LIMITS } from "../../../server/rate-limit";
import { startSession } from "../../../server/session";
import { authKeySchema, emailSchema, findByEmail, publicUser, recordLogin } from "../../../server/users";

// Log in with the email and the auth key derived from the password. The reply
// carries the password-wrapped data key, which only the browser can open.

const input = z.object({ email: emailSchema, authKey: authKeySchema });
const WRONG = "Email or password is wrong.";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!fromThisSite(request)) return fail("Log in from Sleuthhound’s own page.", 403);
  const body = await readBody(request, input);
  const wait = await hitAll(env.DB, [
    [LIMITS.loginIp, clientIp(request)],
    ...(body ? ([[LIMITS.loginEmail, body.email]] as const) : []),
  ]);
  if (wait) return tooMany(wait);
  if (!body) return fail(WRONG, 401);

  const user = await findByEmail(env.DB, body.email);
  // The same answer whether or not the account exists, or was reset.
  if (!user || !(await checkAuthKey(body.authKey, user.auth_salt, user.auth_hash))) return fail(WRONG, 401);
  if (user.disabled) return fail("This account is turned off. Ask your admin.", 403);

  await recordLogin(env.DB, user.id, clientCountry(request));
  const setCookie = await startSession(env.DB, user.id);
  return json({ ok: true, user: publicUser(user), wrapped: { byPassword: user.wrapped_by_password } }, 200, { "Set-Cookie": setCookie });
};
