import type { Env } from "../../../server/env";
import { fail, fromThisSite } from "../../../server/http";
import { readSession } from "../../../server/session";

// Forwards a signed-in user's request to Apollo or HubSpot, which don't
// accept requests from browsers. Stateless: it stores nothing, logs nothing
// and forwards only the headers those APIs need, never the session cookie.

const TARGETS: Record<string, string> = {
  apollo: "https://api.apollo.io",
  hubspot: "https://api.hubapi.com",
};

const FORWARD = ["accept", "authorization", "cache-control", "content-type", "x-api-key"];
const METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);

export const onRequest: PagesFunction<Env, "provider" | "path"> = async ({ request, env, params }) => {
  const base = TARGETS[String(params.provider)];
  if (!base) return fail("Unknown service.", 404);
  if (!METHODS.has(request.method)) return fail("Method not allowed.", 405);
  if (!fromThisSite(request)) return fail("Use Sleuthhound’s own pages for this.", 403);
  if (!(await readSession(request, env.DB))) return fail("Log in first.", 401);

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/proxy\/[^/]+/, "") || "/";
  const headers = new Headers();
  for (const name of FORWARD) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await fetch(`${base}${path}${url.search}`, {
    method: request.method,
    headers,
    body: request.method === "GET" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });
  const out = new Headers({ "Cache-Control": "no-store" });
  const type = upstream.headers.get("content-type");
  if (type) out.set("Content-Type", type);
  return new Response(upstream.body, { status: upstream.status, headers: out });
};
