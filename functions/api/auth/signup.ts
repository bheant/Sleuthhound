import { z } from "zod";
import { newAuthHash } from "../../../server/crypto";
import type { Env } from "../../../server/env";
import { clientCountry, clientIp, fail, fromThisSite, json, readBody, tooMany } from "../../../server/http";
import { claimInvite, INVITE_GONE, inviteTokenSchema, inviteUsedBy, releaseInvite, validInvite } from "../../../server/invites";
import { hitAll, LIMITS } from "../../../server/rate-limit";
import { startSession } from "../../../server/session";
import { authKeySchema, emailSchema, findByEmail, publicUser, recordLogin, wrappedSchema, type UserRow } from "../../../server/users";

// Sign up, with an invite: name, email, company and the auth key the browser
// derived from the password. The password itself never arrives here. The
// invite is used up only if the account is made.

const input = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  company: z.string().trim().min(1).max(160),
  authKey: authKeySchema,
  wrapped: z.object({ byPassword: wrappedSchema, byRecovery: wrappedSchema }),
  invite: inviteTokenSchema,
});

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!fromThisSite(request)) return fail("Sign up from Sleuthhound’s own page.", 403);
  const wait = await hitAll(env.DB, [[LIMITS.signupIp, clientIp(request)]]);
  if (wait) return tooMany(wait);
  const body = await readBody(request, input);
  if (!body) return fail("Check your name, email and company, then try again.", 400);
  const invite = await validInvite(env.DB, body.invite);
  if (!invite) return fail(INVITE_GONE, 403);
  if (invite.email && invite.email !== body.email) return fail(`This invite is for ${invite.email}. Sign up with that address, or ask for a new invite.`, 403);
  if (await findByEmail(env.DB, body.email)) return fail("There’s already an account with this email. Log in instead.", 409);
  if (!(await claimInvite(env.DB, invite.id))) return fail(INVITE_GONE, 403);

  const { salt, hash } = await newAuthHash(body.authKey);
  const user: UserRow = {
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
    company: body.company,
    role: "user",
    disabled: 0,
    auth_salt: salt,
    auth_hash: hash,
    wrapped_by_password: body.wrapped.byPassword,
    wrapped_by_recovery: body.wrapped.byRecovery,
    reset_token_hash: null,
    reset_expires_at: null,
    created_at: new Date().toISOString(),
    last_seen_at: null,
  };
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, name, email, company, auth_salt, auth_hash, wrapped_by_password, wrapped_by_recovery, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
      .bind(user.id, user.name, user.email, user.company, salt, hash, user.wrapped_by_password, user.wrapped_by_recovery, user.created_at)
      .run();
  } catch {
    // Two sign-ups with one email at the same moment: the unique index wins,
    // and the invite stays usable.
    await releaseInvite(env.DB, invite.id);
    return fail("There’s already an account with this email. Log in instead.", 409);
  }
  await inviteUsedBy(env.DB, invite.id, user.id);
  await recordLogin(env.DB, user.id, clientCountry(request));
  const setCookie = await startSession(env.DB, user.id);
  return json({ ok: true, user: publicUser(user), wrapped: { byPassword: user.wrapped_by_password } }, 201, { "Set-Cookie": setCookie });
};
