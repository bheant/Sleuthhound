import { beforeEach, describe, expect, it } from "vitest";
import { onRequestPost as deleteAccount } from "../functions/api/account/delete";
import { onRequestPost as changePassword } from "../functions/api/account/password";
import { onRequestPost as login } from "../functions/api/auth/login";
import { onRequestPost as logout } from "../functions/api/auth/logout";
import { onRequestGet as me } from "../functions/api/auth/me";
import { onRequestGet as resetInfo, onRequestPost as reset } from "../functions/api/auth/reset";
import { onRequestPost as signup } from "../functions/api/auth/signup";
import { randomToken, sha256Hex, toBase64 } from "./crypto";
import type { Env } from "./env";
import { createInvite } from "./invites";
import { fakeD1 } from "./testing/fake-d1";

// The account functions against the real D1 schema. The browser's key
// derivation is stood in for by random 32-byte auth keys.

type Handler = (ctx: never) => Response | Promise<Response>;

let env: Env;
let ip = 0;

beforeEach(async () => {
  env = { DB: await fakeD1() };
  ip++;
});

const authKey = () => toBase64(crypto.getRandomValues(new Uint8Array(32)));
const wrapped = () => `v1.${toBase64(crypto.getRandomValues(new Uint8Array(12)))}.${toBase64(crypto.getRandomValues(new Uint8Array(48)))}`;

function req(path: string, { body, cookie, site = "same-origin", method }: { body?: unknown; cookie?: string; site?: string; method?: string } = {}) {
  const headers: Record<string, string> = { "CF-Connecting-IP": `10.0.0.${ip}`, "Sec-Fetch-Site": site };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`https://sleuthhound.net${path}`, { method: method ?? (body === undefined ? "GET" : "POST"), headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const call = async (fn: Handler, request: Request) => {
  const res = await fn({ request, env } as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, cookie: res.headers.get("Set-Cookie") };
};

const cookieOf = (setCookie: string | null) => setCookie?.split(";")[0] ?? "";

async function newAccount(email = "sam@example.com") {
  const key = authKey();
  const { token: invite } = await createInvite(env.DB, null, null);
  const res = await call(signup, req("/api/auth/signup", { body: { name: "Sam", email, company: "Northwind", authKey: key, wrapped: { byPassword: wrapped(), byRecovery: wrapped() }, invite } }));
  return { key, res, cookie: cookieOf(res.cookie) };
}

describe("accounts", () => {
  it("signs up with a secure session cookie and no password stored", async () => {
    const { key, res } = await newAccount();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Sam", email: "sam@example.com", company: "Northwind", role: "user" });
    expect(res.cookie).toMatch(/^__Host-sh=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000$/);
    const row = await env.DB.prepare("SELECT * FROM users").first<Record<string, string>>();
    expect(JSON.stringify(row)).not.toContain(key);
    const session = await env.DB.prepare("SELECT id FROM sessions").first<{ id: string }>();
    expect(res.cookie).not.toContain(session!.id);
  });

  it("refuses a second account with the same email, in any case", async () => {
    await newAccount();
    const again = await newAccount("SAM@example.com");
    expect(again.res.status).toBe(409);
  });

  it("logs in with the right auth key only, and records the login", async () => {
    const { key } = await newAccount();
    const wrong = await call(login, req("/api/auth/login", { body: { email: "sam@example.com", authKey: authKey() } }));
    expect(wrong).toMatchObject({ status: 401, body: { message: "Email or password is wrong." } });
    const nobody = await call(login, req("/api/auth/login", { body: { email: "nobody@example.com", authKey: key } }));
    expect(nobody.body.message).toBe(wrong.body.message);

    const ok = await call(login, req("/api/auth/login", { body: { email: " Sam@Example.com", authKey: key } }));
    expect(ok.status).toBe(200);
    expect(ok.body.wrapped).toHaveProperty("byPassword");
    const logins = await env.DB.prepare("SELECT count(*) AS n FROM logins").first<{ n: number }>();
    expect(logins!.n).toBe(2);
  });

  it("knows the session until logout", async () => {
    const { cookie } = await newAccount();
    expect((await call(me, req("/api/auth/me", { cookie }))).body.user).toMatchObject({ email: "sam@example.com" });
    await call(logout, req("/api/auth/logout", { cookie, body: {} }));
    expect((await call(me, req("/api/auth/me", { cookie }))).body.user).toBeNull();
    expect((await call(me, req("/api/auth/me"))).body.user).toBeNull();
  });

  it("rejects changes from another site", async () => {
    const res = await call(signup, req("/api/auth/signup", { site: "cross-site", body: {} }));
    expect(res.status).toBe(403);
  });

  it("limits login attempts per email", async () => {
    await newAccount();
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      ip++; // a new address each time, so only the email limit applies
      statuses.push((await call(login, req("/api/auth/login", { body: { email: "sam@example.com", authKey: authKey() } }))).status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it("limits sign-ups per address", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await newAccount(`p${i}@example.com`)).res.status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it("refuses a disabled account and drops its sessions' access", async () => {
    const { key, cookie } = await newAccount();
    await env.DB.prepare("UPDATE users SET disabled = 1").run();
    expect((await call(me, req("/api/auth/me", { cookie }))).body.user).toBeNull();
    const res = await call(login, req("/api/auth/login", { body: { email: "sam@example.com", authKey: key } }));
    expect(res.status).toBe(403);
  });

  it("sets a new password through a reset link, once", async () => {
    const { key } = await newAccount();
    const token = randomToken();
    const expires = new Date(Date.now() + 3600_000).toISOString();
    await env.DB.prepare("UPDATE users SET auth_hash = NULL, auth_salt = NULL, reset_token_hash = ?1, reset_expires_at = ?2")
      .bind(await sha256Hex(token), expires)
      .run();
    expect((await call(login, req("/api/auth/login", { body: { email: "sam@example.com", authKey: key } }))).status).toBe(401);

    const info = await call(resetInfo, req(`/api/auth/reset?token=${token}`));
    expect(info.body).toMatchObject({ email: "sam@example.com" });
    expect(info.body.wrapped).toHaveProperty("byRecovery");

    const next = authKey();
    const done = await call(reset, req("/api/auth/reset", { body: { token, authKey: next, wrapped: { byPassword: wrapped() } } }));
    expect(done.status).toBe(200);
    expect((await call(login, req("/api/auth/login", { body: { email: "sam@example.com", authKey: next } }))).status).toBe(200);
    expect((await call(reset, req("/api/auth/reset", { body: { token, authKey: authKey(), wrapped: { byPassword: wrapped() } } }))).status).toBe(404);
  });

  it("changes the password with the current one, and logs out other devices", async () => {
    const { key, cookie } = await newAccount();
    const other = cookieOf((await call(login, req("/api/auth/login", { body: { email: "sam@example.com", authKey: key } }))).cookie);
    const next = authKey();
    const wrong = await call(changePassword, req("/api/account/password", { cookie, body: { currentAuthKey: authKey(), newAuthKey: next, byPassword: wrapped() } }));
    expect(wrong.status).toBe(401);
    const ok = await call(changePassword, req("/api/account/password", { cookie, body: { currentAuthKey: key, newAuthKey: next, byPassword: wrapped() } }));
    expect(ok.status).toBe(200);
    expect((await call(me, req("/api/auth/me", { cookie }))).body.user).not.toBeNull();
    expect((await call(me, req("/api/auth/me", { cookie: other }))).body.user).toBeNull();
  });

  it("deletes the account, its sessions and its logins", async () => {
    const { key, cookie } = await newAccount();
    expect((await call(deleteAccount, req("/api/account/delete", { cookie, body: { authKey: authKey() } }))).status).toBe(401);
    expect((await call(deleteAccount, req("/api/account/delete", { cookie, body: { authKey: key } }))).status).toBe(200);
    for (const table of ["users", "sessions", "logins"]) {
      expect((await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())!.n).toBe(0);
    }
  });
});
