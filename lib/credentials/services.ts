import { z } from "zod";

// The services a key can be stored for today, and the copy each one uses.

export const KEY_SERVICES = ["anthropic", "openai", "xai", "companies_house", "reddit", "apollo", "hubspot"] as const;
export type KeyService = (typeof KEY_SERVICES)[number];

export const keyServiceSchema = z.enum(KEY_SERVICES);

// Keys are pasted, so trim them; refuse anything that can't be a key before
// spending a request on it.
export const apiKeySchema = z
  .string()
  .trim()
  .min(8, "That's too short to be a key. Check it's copied in full.")
  .max(500, "That's too long to be a key. Check only the key is copied.")
  .regex(/^\S+$/, "Keys have no spaces. Check only the key is copied.");

export const SERVICE_VENDOR: Record<KeyService, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  xai: "xAI",
  companies_house: "Companies House",
  reddit: "Reddit",
  apollo: "Apollo",
  hubspot: "HubSpot",
};

/** Where each provider's keys are made and managed. */
export const KEY_PAGES: Record<KeyService, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  xai: "https://console.x.ai",
  companies_house: "https://developer.company-information.service.gov.uk/manage-applications",
  reddit: "https://www.reddit.com/prefs/apps",
  apollo: "https://docs.apollo.io/docs/create-api-key",
  hubspot: "https://developers.hubspot.com/docs/api/private-apps",
};

export type KeyTestResult = { ok: true; message: null } | { ok: false; rejected: boolean; message: string };

export function rejectedCopy(service: KeyService): string {
  return `Key rejected by ${SERVICE_VENDOR[service]}. Check it’s copied in full, then Test again.`;
}

export function unreachableCopy(service: KeyService): string {
  return `Couldn’t reach ${SERVICE_VENDOR[service]}. Check your connection, then Test again.`;
}

export function upstreamErrorCopy(service: KeyService, status: number): string {
  return `${SERVICE_VENDOR[service]} returned an error (${status}). Test again in a minute.`;
}

// Status text beside a failed key: "Key rejected" only when the service said
// so; network trouble and other errors read as a failed test.
export function failedLabel(service: KeyService, message: string | null): string {
  return message === rejectedCopy(service) ? "Key rejected" : "Test failed";
}
