import { z } from "zod";
import { externalFetch } from "@/lib/net/external";

// Apollo's people match (POST /api/v1/people/match, parameters in the query
// string, key in x-api-key). Each match that returns an email uses Apollo
// credits, so it only runs when someone presses Find email. Personal emails
// are never asked for. One click is one request, so no shared limiter: Apollo's
// own per-minute limits are far above what a person can press.

const MATCH_URL = "https://api.apollo.io/api/v1/people/match";

export class ApolloError extends Error {
  constructor(readonly status: number) {
    super(`Apollo returned ${status}`);
    this.name = "ApolloError";
  }
}

const MatchResponse = z.object({
  person: z
    .object({
      email: z.string().nullish(),
      email_status: z.string().nullish(),
    })
    .nullish(),
});

export type MatchQuery = { name: string; domain: string | null; organisation: string };

/** "Mary Anne Hood" → first "Mary", last "Hood". */
export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.length > 1 ? parts[parts.length - 1] : "" };
}

export function matchParams({ name, domain, organisation }: MatchQuery): URLSearchParams {
  const { first, last } = splitName(name);
  const params = new URLSearchParams({ name, first_name: first, last_name: last, reveal_personal_emails: "false" });
  // A domain matches far better than a name; the name is the fallback.
  if (domain) params.set("domain", domain.replace(/^www\./, ""));
  else params.set("organization_name", organisation);
  return params;
}

// Apollo stands in "email_not_unlocked@domain.com" for an email the plan
// can't reveal, and marks addresses it couldn't find as unavailable.
export function workEmailOf(body: unknown): string | null {
  const parsed = MatchResponse.safeParse(body);
  const email = parsed.success ? parsed.data.person?.email?.trim() : null;
  if (!email || !z.email().safeParse(email).success) return null;
  if (/^email_not_unlocked@/i.test(email)) return null;
  if (parsed.data?.person?.email_status === "unavailable") return null;
  return email.toLowerCase();
}

export async function matchWorkEmail(apiKey: string, query: MatchQuery): Promise<string | null> {
  const res = await externalFetch(`${MATCH_URL}?${matchParams(query)}`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json", "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new ApolloError(res.status);
  return workEmailOf(await res.json());
}
