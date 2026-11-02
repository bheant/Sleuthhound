import { companiesHouseConnector } from "./companies-house/connector";
import { csvConnector } from "./csv/connector";
import { hackerNewsConnector } from "./hacker-news/connector";
import { redditConnector } from "./reddit/connector";
import type { AnyConnector, ConnectorGroup } from "./types";

// Every connector, by key, in catalogue order.
const CONNECTORS: AnyConnector[] = [companiesHouseConnector, redditConnector, hackerNewsConnector, csvConnector];

export const registry: ReadonlyMap<string, AnyConnector> = new Map(CONNECTORS.map((c) => [c.key, c]));

export function getConnector(key: string): AnyConnector {
  const connector = registry.get(key);
  if (!connector) throw new Error(`No connector is registered for "${key}".`);
  return connector;
}

export function listConnectors(): AnyConnector[] {
  return [...registry.values()];
}

/** Catalogue entries with no connector yet. They show, but can't be picked. */
export const COMING_SOON: Array<{ key: string; label: string; group: ConnectorGroup; description: string; costNote: string }> = [
  { key: "fca", label: "FCA register", group: "Registers", description: "Firms and people authorised by the Financial Conduct Authority", costNote: "Free, API key" },
  { key: "contracts_finder", label: "Contracts Finder", group: "Registers", description: "UK public sector tenders and contract awards", costNote: "Free" },
  { key: "gazette", label: "The Gazette", group: "Registers", description: "Insolvency, strike-off and other company notices", costNote: "Free" },
  { key: "job_boards", label: "Job boards", group: "Hiring", description: "Open roles from Greenhouse, Lever, Ashby and Workable", costNote: "Free" },
  { key: "rss", label: "RSS feed", group: "News", description: "Any news site or blog that publishes a feed", costNote: "Free" },
  { key: "rest", label: "REST API", group: "Custom", description: "Any JSON API you have access to", costNote: "Your key, your costs" },
  { key: "crawl", label: "URL list to crawl", group: "Custom", description: "Pages Sleuthhound reads on every run", costNote: "Free" },
];
