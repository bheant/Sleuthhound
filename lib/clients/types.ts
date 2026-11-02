// What the Clients page shows, shaped from the database. Plain data only.

import type { Link } from "@/lib/targets/types";

export type ClientRow = {
  id: string;
  name: string;
  companyNumber: string | null;
  whySigned: string | null;
  /** "inferred", or where the reason came from, such as "your notes". */
  whySource: string | null;
  segment: string | null;
  signedOn: string | null;
  leads: number;
  kept: number;
  whatTheyDo: string | null;
  directors: string[];
  sources: Link[];
  analysedAt: string | null;
  /** "Claude", "ChatGPT" or "Grok". */
  analysedBy: string;
  /** "none" when Companies House had no single match for the name. */
  chMatch: string | null;
  isDemo: boolean;
};

export type IdealClient = {
  text: string;
  editedByUser: boolean;
  /** "Written by Claude from your 5 clients on 14 Oct 2026" */
  meta: string;
  suggestion: { text: string; meta: string } | null;
};

export type UniverseLead = {
  id: string;
  name: string;
  /** The current review's score; null until it's reviewed. */
  score: number | null;
  /** Found by today's lookalike search or run. */
  today: boolean;
  /** The client it resembles. */
  clientId: string;
};

/** One client type on the radar. */
export type UniverseSegment = {
  name: string;
  clients: Array<{ id: string; name: string }>;
  /** Leads in the last 8 weeks. */
  leads: UniverseLead[];
};

export type Universe = {
  /** Largest first. */
  segments: UniverseSegment[];
  totals: { clients: number; leads: number; today: number };
  /** Clients not analysed yet, so without a type. */
  unsorted: number;
};

export type ClientsPage = {
  figures: { clients: number; leads: number; kept: string; uploaded: string | null };
  ideal: IdealClient;
  clients: ClientRow[];
  universe: Universe;
};
