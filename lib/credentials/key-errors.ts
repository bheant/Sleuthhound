import { rejectedCopy, SERVICE_VENDOR, unreachableCopy, upstreamErrorCopy, type KeyService, type KeyTestResult } from "./services";

// What a provider's answer to a key test means, in plain English. Pure, so
// each provider's quirks are tested: OpenAI says insufficient_quota with a
// 429, xAI "doesn't have any credits" with a 403, Anthropic "credit balance"
// with a 400.

export type KeyProblem = "invalid" | "no_credit" | "rate_limited" | "blocked" | "not_found" | "unreachable" | "error";

const NO_CREDIT = /credit balance|insufficient_quota|any credits|exceeded your current quota|billing|payment required/i;
const INVALID = /invalid[ _-]?(x-)?api[ _-]?key|incorrect api key|authentication_error|invalid_api_key|unauthori[sz]ed/i;
const NOT_FOUND = /not_found_error|model_not_found|does not exist|model not found/i;

/** An HTTP status, with the body when there is one, as a problem. null: the key works. */
export function classify(status: number | undefined, body = ""): KeyProblem | null {
  if (status === undefined) return "unreachable";
  if (status >= 200 && status < 300) return null;
  if (NO_CREDIT.test(body) || status === 402) return "no_credit";
  if (status === 401 || INVALID.test(body)) return "invalid";
  if (status === 403) return "blocked";
  if (status === 429 || status === 529) return "rate_limited";
  if (status === 404 || NOT_FOUND.test(body)) return "not_found";
  return "error";
}

// Specific advice where a provider's "blocked" usually has one cause.
const BLOCKED: Partial<Record<KeyService, string>> = {
  companies_house: "Companies House refused this key from a browser. Create a JavaScript key for this site’s address in your Companies House application, then Test again.",
  apollo: "Apollo accepted the key but refused API access. API access may need a paid Apollo plan, or a master key.",
  hubspot: "HubSpot accepted the token, but it can’t read companies. Give the private app company, contact and note scopes, then Test again.",
};

/** The message beside the key. modelId names the model for AI keys. */
export function problemCopy(service: KeyService, problem: KeyProblem, status?: number, modelId?: string): string {
  const vendor = SERVICE_VENDOR[service];
  switch (problem) {
    case "invalid":
      return rejectedCopy(service);
    case "no_credit":
      return `${vendor} accepted the key, but the account has no credit or has used its quota. Add credit, then Test again.`;
    case "rate_limited":
      return `${vendor} is limiting requests right now. Wait a minute, then Test again.`;
    case "blocked":
      return BLOCKED[service] ?? `${vendor} accepted the key but refused access. Check the key’s permissions, or whether ${vendor} allows use from your country.`;
    case "not_found":
      return modelId ? `${vendor} doesn’t recognise the model ${modelId}. Check the ai_models setting, then Test again.` : upstreamErrorCopy(service, status ?? 404);
    case "unreachable":
      return unreachableCopy(service);
    default:
      return upstreamErrorCopy(service, status ?? 500);
  }
}

/** A test result from a status and body. */
export function resultFor(service: KeyService, status: number | undefined, body = "", modelId?: string): KeyTestResult {
  const problem = classify(status, body);
  if (!problem) return { ok: true, message: null };
  return { ok: false, rejected: problem === "invalid", message: problemCopy(service, problem, status, modelId) };
}
