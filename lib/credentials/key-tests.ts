import { APICallError, generateText } from "ai";
import { languageModel, type AiProvider } from "@/lib/ai/provider";
import { createCompaniesHouseClient, CompaniesHouseError } from "@/lib/connectors/companies-house/client";
import { resultFor } from "./key-errors";
import type { KeyService, KeyTestResult } from "./services";
import { externalFetch } from "@/lib/net/external";

// One cheap call per service that proves the key works. What a failure
// means is worked out in ./key-errors; error objects are never logged,
// because some carry request details.

const pass: KeyTestResult = { ok: true, message: null };

// OpenAI's Responses API refuses fewer than 16 output tokens.
const MIN_TOKENS: Record<AiProvider, number> = { anthropic: 1, openai: 16, xai: 1 };

// The smallest completion with the review model. It proves the key, the model
// name and that the account has credit.
export async function testAiKey(provider: AiProvider, apiKey: string, modelId: string): Promise<KeyTestResult> {
  try {
    await generateText({
      model: languageModel(provider, apiKey, modelId),
      prompt: "Hi",
      maxOutputTokens: MIN_TOKENS[provider],
      maxRetries: 0,
      providerOptions: provider === "anthropic" ? {} : { [provider]: { store: false } },
    });
    return pass;
  } catch (error) {
    if (!APICallError.isInstance(error)) return resultFor(provider, undefined);
    return resultFor(provider, error.statusCode, error.responseBody ?? "", modelId);
  }
}

// Any known company will do: 00000006 has been on the register since 1862.
export async function testCompaniesHouseKey(apiKey: string): Promise<KeyTestResult> {
  try {
    const profile = await createCompaniesHouseClient(apiKey).company("00000006");
    return profile ? pass : resultFor("companies_house", 404);
  } catch (error) {
    return resultFor("companies_house", error instanceof CompaniesHouseError ? error.status : undefined);
  }
}

// Reddit keys are stored as "client ID:secret". An app-only token proves
// both; it reads nothing.
export async function testRedditKey(apiKey: string): Promise<KeyTestResult> {
  const [id, secret] = apiKey.split(":");
  if (!id || !secret) return { ok: false, rejected: false, message: "Paste both the client ID and the secret." };
  try {
    const res = await externalFetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10_000),
    });
    return resultFor("reddit", res.status, res.ok ? "" : await res.text().catch(() => ""));
  } catch {
    return resultFor("reddit", undefined);
  }
}

// Apollo answers 200 with is_logged_in false for a key it doesn't know.
export async function testApolloKey(apiKey: string): Promise<KeyTestResult> {
  try {
    const res = await externalFetch("https://api.apollo.io/api/v1/auth/health", {
      headers: { "x-api-key": apiKey, "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return resultFor("apollo", res.status, await res.text().catch(() => ""));
    const body = (await res.json().catch(() => null)) as { is_logged_in?: boolean } | null;
    return body?.is_logged_in ? pass : resultFor("apollo", 401);
  } catch {
    return resultFor("apollo", undefined);
  }
}

// Reads one company property. A token without the companies scope gets 403.
export async function testHubSpotKey(apiKey: string): Promise<KeyTestResult> {
  try {
    const res = await externalFetch("https://api.hubapi.com/crm/v3/properties/companies/name", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    return resultFor("hubspot", res.status, res.ok ? "" : await res.text().catch(() => ""));
  } catch {
    return resultFor("hubspot", undefined);
  }
}

/** reviewModel: the provider's review model, for AI keys. */
export function testKey(service: KeyService, apiKey: string, reviewModel: string): Promise<KeyTestResult> {
  switch (service) {
    case "anthropic":
    case "openai":
    case "xai":
      return testAiKey(service, apiKey, reviewModel);
    case "reddit":
      return testRedditKey(apiKey);
    case "apollo":
      return testApolloKey(apiKey);
    case "hubspot":
      return testHubSpotKey(apiKey);
    default:
      return testCompaniesHouseKey(apiKey);
  }
}
