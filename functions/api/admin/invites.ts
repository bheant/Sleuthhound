import { z } from "zod";
import type { Env } from "../../../server/env";
import { requireAdmin } from "../../../server/guard";
import { fail, json, readBody } from "../../../server/http";
import { createInvite } from "../../../server/invites";
import { emailSchema } from "../../../server/users";

// Invites for /admin: GET lists them with their status, POST makes one and
// returns its link, once. Admins only, checked here on every request.

export type AdminInvite = {
  id: string;
  email: string | null;
  createdAt: string;
  expiresAt: string;
  status: "unused" | "used" | "expired";
  usedAt: string | null;
  /** The account that used it; null once that account is deleted. */
  usedBy: string | null;
};

type Row = { id: string; email: string | null; created_at: string; expires_at: string; used_at: string | null; used_email: string | null };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await requireAdmin(request, env);
  if (session instanceof Response) return session;
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.email, i.created_at, i.expires_at, i.used_at, u.email AS used_email
     FROM invites i LEFT JOIN users u ON u.id = i.used_by
     ORDER BY i.created_at DESC LIMIT 200`,
  ).all<Row>();
  const invites: AdminInvite[] = results.map((r) => ({
    id: r.id,
    email: r.email,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    status: r.used_at ? "used" : r.expires_at <= now ? "expired" : "unused",
    usedAt: r.used_at,
    usedBy: r.used_email,
  }));
  return json({ ok: true, invites });
};

const input = z.object({ email: z.union([emailSchema, z.literal("").transform(() => null), z.null()]) });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const session = await requireAdmin(request, env, { change: true });
  if (session instanceof Response) return session;
  const body = await readBody(request, input);
  if (!body) return fail("Enter a valid email address, or leave it empty.", 400);
  const { token, expiresAt } = await createInvite(env.DB, session.user.id, body.email);
  // The page's own address (already checked as this site), so the link
  // works in development too.
  const origin = request.headers.get("Origin") ?? new URL(request.url).origin;
  return json({ ok: true, link: `${origin}/signup?invite=${token}`, expiresAt, email: body.email }, 201);
};
