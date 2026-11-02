import type { Env } from "./env";
import { fail, fromThisSite } from "./http";
import { readSession, type Session } from "./session";

// For functions that need a signed-in user. Returns the session, or the
// response to send instead.
export async function requireSession(request: Request, env: Env, { change = false } = {}): Promise<Session | Response> {
  if (change && !fromThisSite(request)) return fail("Use Sleuthhound’s own page for this.", 403);
  const session = await readSession(request, env.DB);
  return session ?? fail("Log in first.", 401);
}

/** The same, for admins only. Checked on the server every time. */
export async function requireAdmin(request: Request, env: Env, opts: { change?: boolean } = {}): Promise<Session | Response> {
  const session = await requireSession(request, env, opts);
  if (session instanceof Response) return session;
  return session.user.role === "admin" ? session : fail("Only admins can do this.", 403);
}
