// What the New Companies workspace knows about each company. Built on the
// server by lib/targets/workspace.ts and passed whole to the client, so this
// file must not import anything server-only.

import type { Reason } from "./reasons";

export type Decision = "kept" | "discarded";

export type Link = { label: string; url: string };

export type Deadline = {
  /** ISO date the filing is due. */
  dueAt: string;
  /** "First accounts due", "Confirmation statement overdue". */
  label: string;
  overdue: boolean;
};

export type WorkspaceItem = {
  id: string;
  name: string;
  companyNumber: string | null;
  score: number;
  /** One line for the table, from the review. */
  summary: string;
  whatTheyDo: string | null;
  whyFit: string | null;
  whyNow: string | null;
  sector: string | null;
  incorporatedOn: string | null;
  borough: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  /** The first line of the registered office, for a shared-address marker. */
  addressLine: string | null;
  /** "71-75 Shelton Street, WC2H 9JQ (formation agent)" */
  registeredOffice: string | null;
  industries: string[];
  accountsDue: { text: string; overdue: boolean } | null;
  confirmation: { text: string; overdue: boolean } | null;
  /** email: a work email found for them, with where and when. */
  directors: Array<{ id: string; name: string; email: { address: string; source: string; foundOn: string } | null }>;
  /** A limited company, PLC or LLP: Find email is offered only for these. */
  corporate: boolean;
  /** When it was last sent to HubSpot, or null. */
  hubspotSentAt: string | null;
  /** The user's clients this company resembles, from resembles links. */
  resembles: Array<{ id: string; name: string }>;
  /** How many companies share the registered office, this one included. */
  placeCount: number;
  tags: Array<{ text: string; overdue: boolean }>;
  /** Signals from filing history, newest first, each linking to its filing. */
  filings: Array<{
    type: string;
    title: string;
    occurredAt: string;
    url: string | null;
    /** Dormant accounts or a strike-off. */
    negative: boolean;
    /** A funding round worked out from other filings. */
    inferred: boolean;
    /** For an inferred round: the other filings it rests on. */
    basis: Array<{ title: string; url: string | null }>;
  }>;
  /** The latest share allotment or likely funding round. */
  raisedAt: string | null;
  /** Why it wasn't reviewed, e.g. "proposed for strike-off on 4 Oct 2026". */
  skipped: string | null;
  /** The web trading check, when one was done. */
  trading: { trading: "yes" | "no" | "unclear"; evidence: string; sources: Link[]; by: string; checkedAt: string } | null;
  deadline: Deadline | null;
  /** Posts confirmed as this company's, from community sources. */
  posts: Link[];
  sources: Link[];
  reviewedBy: string;
  reviewedAt: string;
  runId: string | null;
  decision: Decision | null;
  decidedAt: string | null;
  /** Why it was discarded, when the user said. */
  reason: Reason | null;
  /** With Other: the user's note. */
  reasonNote: string | null;
  isDemo: boolean;
};

export type AppsConnected = { apollo: boolean; hubspot: boolean };

/** A company one hop from a person: something else they direct. */
export type NetworkTarget = { id: string; name: string; isClient: boolean };

/** For the Connections graph: person id → every company they direct. */
export type Network = Record<string, NetworkTarget[]>;

export type RunFigures = {
  lastRunAt: string | null;
  lastRunId: string | null;
  scannedPerRun: number | null;
  matchesPerRun: number | null;
  nextRunAt: string | null;
};

/** A conversation target on the Conversations tab, with its current review. */
export type ConversationItem = {
  id: string;
  title: string;
  score: number;
  /** One line for the table. */
  summary: string;
  postedAt: string | null;
  /** "Hacker News", or "r/smallbusiness". */
  where: string;
  /** What they asked: the post's own words. */
  quote: string | null;
  /** A comment's thread title, when it's a reply. */
  thread: string | null;
  url: string | null;
  whyFit: string | null;
  suggestedReply: string | null;
  possibleCompany: {
    id: string;
    name: string;
    score: number | null;
    meta: string;
    whatTheyDo: string | null;
  } | null;
  sources: Link[];
  foundBy: string;
  foundAt: string;
  reviewedBy: string;
  reviewedAt: string;
  decision: Decision | null;
  isDemo: boolean;
};
