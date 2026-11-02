import type { Env } from "../../../server/env";
import { clientIp, fail, json, tooMany } from "../../../server/http";
import { INVITE_GONE, validInvite } from "../../../server/invites";
import { hitAll, LIMITS } from "../../../server/rate-limit";

// Before the sign-up form shows: is this invite usable, and is it for one email?
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const wait = await hitAll(env.DB, [[LIMITS.inviteIp, clientIp(request)]]);
  if (wait) return tooMany(wait);
  const invite = await validInvite(env.DB, new URL(request.url).searchParams.get("token") ?? "");
  if (!invite) return fail(INVITE_GONE, 404);
  return json({ ok: true, email: invite.email, expiresAt: invite.expires_at });
};
