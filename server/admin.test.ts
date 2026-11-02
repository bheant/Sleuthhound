import { beforeEach, describe, expect, it } from "vitest";
import { onRequestGet as listUsers } from "../functions/api/admin/users";
import { onRequestPost as actOn } from "../functions/api/admin/users/[id]";
import { onRequestPost as login } from "../functions/api/auth/login";
import { onRequestGet as me } from "../functions/api/auth/me";
import { onRequestGet as resetInfo } from "../functions/api/auth/reset";
import { onRequestPost as signup } from "../functions/api/auth/signup";
import { toBase64 } from "./crypto";
import type { Env } from "./env";
import { createInvite } from "./invites";
import { fakeD1 } from "./testing/fake-d1";

// /api/admin: admins only, enforced on the server.

let env: Env;
let ip = 100;

beforeEach(async () => {
  env = { DB: await fakeD1() };
});

const authKey = () => toBase64(crypto.getRandomValues(new Uint8Array(32)));
const wrapped = () => `v1.${toBase64(crypto.getRandomValues(new Uint8Array(12)))}.${toBase64(crypto.getRandomValues(new Uint8Array(48)))}`;

function req(path: string, { body, cookie }: { body?: unknown; cookie?: string } = {}) {
  ip++;
  const headers: Record<string, string> = { "CF-Connecting-IP": `10.1.0.${ip}`, "Sec-Fetch-Site": "same-origin", Origin: "https://sleuthhound.net" };
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://sleuthhound.net${path}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const call = async (fn: (ctx: never) => Response | Promise<Response>, request: Request, params: Record<string, string> = {}) => {
  const res = await fn({ request, env, params } as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, cookie: res.headers.get("Set-Cookie")?.split(";")[0] ?? "" };
};

async function account(email: string, admin = false) {
  const key = authKey();
  const { token: invite } = await createInvite(env.DB, null, null);
  const res = await call(signup, req("/api/auth/signup", { body: { name: email.split("@")[0], email, company: "Co", authKey: key, wrapped: { byPassword: wrapped(), byRecovery: wrapped() }, invite } }));
  if (admin) await env.DB.prepare("UPDATE users SET role = 'admin' WHERE email = ?1").bind(email).run();
  return { id: (res.body.user as { id: string }).id, key, cookie: res.cookie };
}

describe("admin", () => {
  it("lists users with login counts and country for admins only", async () => {
    const admin = await account("admin@example.com", true);
    const user = await account("user@example.com");
    expect((await call(listUsers, req("/api/admin/users", { cookie: user.cookie }))).status).toBe(403);
    expect((await call(listUsers, req("/api/admin/users"))).status).toBe(401);

    await env.DB.prepare("UPDATE logins SET country = 'GB' WHERE user_id = ?1").bind(user.id).run();
    const res = await call(listUsers, req("/api/admin/users", { cookie: admin.cookie }));
    const users = res.body.users as Array<Record<string, unknown>>;
    expect(users).toHaveLength(2);
    expect(users.find((u) => u.email === "user@example.com")).toMatchObject({ loginCount: 1, country: "GB", disabled: false, role: "user" });
    expect(JSON.stringify(users)).not.toMatch(/auth_hash|wrapped|salt/);
  });

  it("disables and enables an account, logging it out", async () => {
    const admin = await account("admin@example.com", true);
    const user = await account("user@example.com");
    expect((await call(actOn, req(`/api/admin/users/${user.id}`, { cookie: user.cookie, body: { action: "disable" } }), { id: admin.id })).status).toBe(403);

    expect((await call(actOn, req(`/api/admin/users/${user.id}`, { cookie: admin.cookie, body: { action: "disable" } }), { id: user.id })).status).toBe(200);
    expect((await call(me, req("/api/auth/me", { cookie: user.cookie }))).body.user).toBeNull();
    expect((await call(login, req("/api/auth/login", { body: { email: "user@example.com", authKey: user.key } }))).status).toBe(403);

    await call(actOn, req(`/api/admin/users/${user.id}`, { cookie: admin.cookie, body: { action: "enable" } }), { id: user.id });
    expect((await call(login, req("/api/auth/login", { body: { email: "user@example.com", authKey: user.key } }))).status).toBe(200);
  });

  it("makes a one-time reset link that stops the old password", async () => {
    const admin = await account("admin@example.com", true);
    const user = await account("user@example.com");
    const res = await call(actOn, req(`/api/admin/users/${user.id}`, { cookie: admin.cookie, body: { action: "reset" } }), { id: user.id });
    const link = String(res.body.link);
    expect(link).toMatch(/^https:\/\/sleuthhound\.net\/\?reset=[A-Za-z0-9_-]{43}$/);
    expect((await call(login, req("/api/auth/login", { body: { email: "user@example.com", authKey: user.key } }))).status).toBe(401);
    const token = new URL(link).searchParams.get("reset")!;
    expect((await call(resetInfo, req(`/api/auth/reset?token=${token}`))).body).toMatchObject({ email: "user@example.com" });
  });

  it("won't act on the admin's own account", async () => {
    const admin = await account("admin@example.com", true);
    const res = await call(actOn, req(`/api/admin/users/${admin.id}`, { cookie: admin.cookie, body: { action: "disable" } }), { id: admin.id });
    expect(res.status).toBe(400);
  });
});
