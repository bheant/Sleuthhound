import { beforeEach, describe, expect, it } from "vitest";
import { onRequestGet as listInvites, onRequestPost as makeInvite } from "../functions/api/admin/invites";
import { onRequestGet as checkInvite } from "../functions/api/auth/invite";
import { onRequestPost as signup } from "../functions/api/auth/signup";
import { toBase64 } from "./crypto";
import type { Env } from "./env";
import { createInvite } from "./invites";
import { fakeD1 } from "./testing/fake-d1";

// Sign-up is invite-only: single use, 7 days, optionally for one email.

let env: Env;
let ip = 200;

beforeEach(async () => {
  env = { DB: await fakeD1() };
});

const key = () => toBase64(crypto.getRandomValues(new Uint8Array(32)));
const wrapped = () => `v1.${toBase64(crypto.getRandomValues(new Uint8Array(12)))}.${toBase64(crypto.getRandomValues(new Uint8Array(48)))}`;

function req(path: string, { body, cookie }: { body?: unknown; cookie?: string } = {}) {
  ip++;
  const headers: Record<string, string> = { "CF-Connecting-IP": `10.2.0.${ip % 250}`, "Sec-Fetch-Site": "same-origin", Origin: "https://sleuthhound.net" };
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://sleuthhound.net${path}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const call = async (fn: (ctx: never) => Response | Promise<Response>, request: Request) => {
  const res = await fn({ request, env, params: {} } as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, cookie: res.headers.get("Set-Cookie")?.split(";")[0] ?? "" };
};

const signUp = (email: string, invite?: string) =>
  call(signup, req("/api/auth/signup", { body: { name: "Sam", email, company: "Co", authKey: key(), wrapped: { byPassword: wrapped(), byRecovery: wrapped() }, invite } }));

describe("invites", () => {
  it("refuses sign-up without a valid invite", async () => {
    expect((await signUp("sam@example.com")).status).toBe(400);
    expect((await signUp("sam@example.com", "x".repeat(43))).status).toBe(403);
  });

  it("lets one person in per invite", async () => {
    const { token } = await createInvite(env.DB, null, null);
    expect((await call(checkInvite, req(`/api/auth/invite?token=${token}`))).body).toMatchObject({ ok: true, email: null });
    expect((await signUp("sam@example.com", token)).status).toBe(201);
    expect((await signUp("ann@example.com", token)).status).toBe(403);
    expect((await call(checkInvite, req(`/api/auth/invite?token=${token}`))).status).toBe(404);
  });

  it("keeps an invite usable when sign-up fails for an existing email", async () => {
    const first = await createInvite(env.DB, null, null);
    await signUp("sam@example.com", first.token);
    const second = await createInvite(env.DB, null, null);
    expect((await signUp("sam@example.com", second.token)).status).toBe(409);
    expect((await signUp("ann@example.com", second.token)).status).toBe(201);
  });

  it("only lets the named email use a named invite", async () => {
    const { token } = await createInvite(env.DB, null, "ann@example.com");
    expect((await call(checkInvite, req(`/api/auth/invite?token=${token}`))).body).toMatchObject({ email: "ann@example.com" });
    const wrong = await signUp("sam@example.com", token);
    expect(wrong.status).toBe(403);
    expect(wrong.body.message).toMatch(/for ann@example.com/);
    expect((await signUp("Ann@Example.com", token)).status).toBe(201);
  });

  it("stops working after 7 days", async () => {
    const { token } = await createInvite(env.DB, null, null, new Date(Date.now() - 8 * 24 * 3600_000));
    expect((await signUp("sam@example.com", token)).status).toBe(403);
  });

  it("lets admins make invites and see unused, used and expired", async () => {
    const boot = await createInvite(env.DB, null, null);
    const admin = await signUp("admin@example.com", boot.token);
    await env.DB.prepare("UPDATE users SET role = 'admin'").run();

    const made = await call(makeInvite, req("/api/admin/invites", { cookie: admin.cookie, body: { email: "" } }));
    expect(made.status).toBe(201);
    const link = String(made.body.link);
    expect(link).toMatch(/^https:\/\/sleuthhound\.net\/signup\?invite=[A-Za-z0-9_-]{43}$/);
    await createInvite(env.DB, null, "old@example.com", new Date(Date.now() - 8 * 24 * 3600_000));

    const list = (await call(listInvites, req("/api/admin/invites", { cookie: admin.cookie }))).body.invites as Array<Record<string, unknown>>;
    expect(list.map((i) => i.status).sort()).toEqual(["expired", "unused", "used"]);
    expect(list.find((i) => i.status === "used")).toMatchObject({ usedBy: "admin@example.com" });
    expect(JSON.stringify(list)).not.toContain(new URL(link).searchParams.get("invite"));
  });

  it("refuses invite making to anyone but admins", async () => {
    const boot = await createInvite(env.DB, null, null);
    const user = await signUp("sam@example.com", boot.token);
    expect((await call(makeInvite, req("/api/admin/invites", { cookie: user.cookie, body: { email: null } }))).status).toBe(403);
    expect((await call(listInvites, req("/api/admin/invites"))).status).toBe(401);
  });
});
