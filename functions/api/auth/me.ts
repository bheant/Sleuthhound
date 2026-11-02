import type { Env } from "../../../server/env";
import { json } from "../../../server/http";
import { clearEnded } from "../../../server/rate-limit";
import { clearCookie, readSession } from "../../../server/session";
import { publicUser } from "../../../server/users";

// Who is signed in, and their password-wrapped data key so the browser can
// unlock with the password alone after a reload. Nobody is a normal answer,
// not an error.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await clearEnded(env.DB);
  const session = await readSession(request, env.DB);
  if (!session) return json({ ok: true, user: null }, 200, request.headers.has("Cookie") ? { "Set-Cookie": clearCookie() } : {});
  return json({ ok: true, user: publicUser(session.user), wrapped: { byPassword: session.user.wrapped_by_password } });
};
