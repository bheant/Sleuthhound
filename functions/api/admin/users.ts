import type { Env } from "../../../server/env";
import { requireAdmin } from "../../../server/guard";
import { json } from "../../../server/http";

// The user list for /admin: identity and sign-in history only. Admins only,
// checked here on every request.

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: "user" | "admin";
  disabled: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  loginCount: number;
  country: string | null;
  resetPending: boolean;
};

type Row = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: "user" | "admin";
  disabled: number;
  created_at: string;
  last_seen_at: string | null;
  login_count: number;
  country: string | null;
  reset_pending: number;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await requireAdmin(request, env);
  if (session instanceof Response) return session;
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.company, u.role, u.disabled, u.created_at, u.last_seen_at,
       (SELECT count(*) FROM logins l WHERE l.user_id = u.id) AS login_count,
       (SELECT l.country FROM logins l WHERE l.user_id = u.id ORDER BY l.at DESC LIMIT 1) AS country,
       (u.reset_token_hash IS NOT NULL AND u.reset_expires_at > ?1) AS reset_pending
     FROM users u ORDER BY u.created_at DESC`,
  )
    .bind(new Date().toISOString())
    .all<Row>();
  const users: AdminUser[] = results.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    company: r.company,
    role: r.role,
    disabled: r.disabled === 1,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    loginCount: r.login_count,
    country: r.country,
    resetPending: r.reset_pending === 1,
  }));
  return json({ ok: true, users, me: session.user.id });
};
