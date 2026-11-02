import type { Env } from "../../../server/env";
import { fail, fromThisSite, json } from "../../../server/http";
import { clearCookie, endSession } from "../../../server/session";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!fromThisSite(request)) return fail("Log out from Sleuthhound’s own page.", 403);
  await endSession(request, env.DB);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
};
