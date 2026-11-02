import { isDemo } from "@/lib/vault/workspace";

// Every request that leaves Sleuthhound for another service goes through
// here. Most go straight from the browser to the provider the key belongs
// to. Apollo and HubSpot don't allow browser requests (no CORS), so they go
// through /proxy/<provider>, a stateless Pages Function that forwards them
// and keeps nothing. The sample workspace never reaches the network.

/** Providers that need the proxy, by host. functions/proxy/[provider]/[[path]].ts holds the same list. */
export const PROXIED: Record<string, "apollo" | "hubspot"> = {
  "api.apollo.io": "apollo",
  "api.hubapi.com": "hubspot",
};

export const SAMPLE_OFFLINE = "The sample workspace doesn’t reach the network. Create an account and add your own key to do this.";

export class SampleWorkspaceError extends Error {
  constructor() {
    super(SAMPLE_OFFLINE);
    this.name = "SampleWorkspaceError";
  }
}

export const externalFetch: typeof fetch = (input, init) => {
  if (isDemo()) return Promise.reject(new SampleWorkspaceError());
  const url = new URL(input instanceof Request ? input.url : String(input));
  const via = PROXIED[url.host];
  if (!via) return fetch(input, init);
  const target = `/proxy/${via}${url.pathname}${url.search}`;
  return fetch(input instanceof Request ? new Request(target, input) : target, { ...init, credentials: "same-origin" });
};

/** The sample's note for an action that needs the network, or null outside the sample. */
export function sampleRefusal(): string | null {
  return isDemo() ? SAMPLE_OFFLINE : null;
}
