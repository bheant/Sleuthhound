import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { generateText, LanguageModel, ToolSet } from "ai";
import { readKey } from "@/lib/credentials/store";
import { getSetting, type Settings } from "@/lib/settings";
import { externalFetch } from "@/lib/net/external";

// The one place that turns settings and stored keys into a model. The default
// AI does every call; model names come from the ai_models setting.

export type Purpose = "review" | "writing";
type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;
export type AiProvider = Settings["default_ai"];

export const AI_PROVIDERS = ["anthropic", "openai", "xai"] as const satisfies readonly AiProvider[];

export const PROVIDER_LABELS: Record<AiProvider, { name: string; vendor: string }> = {
  anthropic: { name: "Claude", vendor: "Anthropic" },
  openai: { name: "ChatGPT", vendor: "OpenAI" },
  xai: { name: "Grok", vendor: "xAI" },
};

export type ResolvedModel = {
  model: LanguageModel;
  provider: AiProvider;
  modelId: string;
  /** "Claude", "ChatGPT" or "Grok", for the run log. */
  name: string;
  /** "Anthropic", "OpenAI" or "xAI", for errors: "OpenAI returned an error (500)". */
  vendor: string;
  /** Provider-side tools to pass to generateText, such as web search. */
  tools: ToolSet;
  /** Options for the research call that caps how many searches it makes. */
  searchOptions: ProviderOptions;
  /** The search tool and its options with another cap, such as one search for a trading check. Empty when web search is off. */
  searchWith: (maxUses: number) => { tools: ToolSet; providerOptions: ProviderOptions };
};

/** The web search tool's name in every provider's ToolSet. */
export const WEB_SEARCH_TOOL = "web_search";

// OpenAI's default model is its Responses API; xAI's web search needs the
// Responses API too, so both use it for every call.
export function languageModel(provider: AiProvider, apiKey: string, modelId: string): LanguageModel {
  if (provider === "openai") return openai(apiKey)(modelId);
  if (provider === "xai") return xai(apiKey).responses(modelId);
  return anthropic(apiKey)(modelId);
}

// Each provider is called straight from the browser with the user's own key.
// Anthropic asks for an explicit header to allow that.
const anthropic = (apiKey: string) =>
  createAnthropic({ apiKey, fetch: externalFetch, headers: { "anthropic-dangerous-direct-browser-access": "true" } });
const openai = (apiKey: string) => createOpenAI({ apiKey, fetch: externalFetch });
const xai = (apiKey: string) => createXai({ apiKey, fetch: externalFetch });

const LONDON = { type: "approximate", country: "GB", city: "London", timezone: "Europe/London" } as const;

// Each provider's own server-side search tool, checked against the installed
// packages: @ai-sdk/anthropic 4.0.83 webSearch_20260318 (takes maxUses),
// @ai-sdk/openai 4.0.97 webSearch (no use cap; maxToolCalls in searchOptions
// caps it), @ai-sdk/xai 5.0.25 webSearch on the Responses API (maxTurns caps
// it). All three providers run the searches and bill them per call.
function searchTools(provider: AiProvider, apiKey: string, maxUses: number): ToolSet {
  if (provider === "openai") {
    return { [WEB_SEARCH_TOOL]: openai(apiKey).tools.webSearch({ searchContextSize: "low", userLocation: LONDON }) };
  }
  if (provider === "xai") return { [WEB_SEARCH_TOOL]: xai(apiKey).tools.webSearch() };
  return { [WEB_SEARCH_TOOL]: anthropic(apiKey).tools.webSearch_20260318({ maxUses, userLocation: LONDON }) };
}

function searchOptions(provider: AiProvider, maxUses: number): ProviderOptions {
  if (provider === "openai") return { openai: { maxToolCalls: maxUses, store: false } };
  if (provider === "xai") return { xai: { maxTurns: maxUses, store: false } };
  return {};
}

export function modelsFor(workspaceId: string, provider: AiProvider) {
  return getSetting(workspaceId, "ai_models")[provider];
}

export function getModel(purpose: Purpose, workspaceId: string): ResolvedModel {
  return getModelFor(getSetting(workspaceId, "default_ai"), purpose, workspaceId);
}

/** A given AI's model, default or not. Runs use getModel; this is for comparisons. */
export function getModelFor(provider: AiProvider, purpose: Purpose, workspaceId: string): ResolvedModel {
  const { name, vendor } = PROVIDER_LABELS[provider];
  const modelId = modelsFor(workspaceId, provider)[purpose];
  const apiKey = readKey(workspaceId, provider);
  if (!apiKey) throw new Error(`${name} isn’t connected. Add an ${vendor} key on Connections.`);
  const searching = getSetting(workspaceId, "web_search");
  const maxUses = getSetting(workspaceId, "max_searches_per_review");
  return {
    model: languageModel(provider, apiKey, modelId),
    provider,
    modelId,
    name,
    vendor,
    tools: searching ? searchTools(provider, apiKey, maxUses) : {},
    searchOptions: searching ? searchOptions(provider, maxUses) : {},
    searchWith: (n) => (searching ? { tools: searchTools(provider, apiKey, n), providerOptions: searchOptions(provider, n) } : { tools: {}, providerOptions: {} }),
  };
}

/** The default AI's name, for log lines written before a model is resolved. */
export function defaultAiName(workspaceId: string): string {
  return PROVIDER_LABELS[getSetting(workspaceId, "default_ai")].name;
}
