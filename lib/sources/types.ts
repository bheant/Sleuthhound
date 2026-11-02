// What the Add source wizard and the source panels know, shaped from the database
// and passed to the browser. Plain data only: this file must not import
// anything server-only.

import type { ConnectorGroup, MappingRow, ScopeFieldSpec } from "@/lib/connectors/types";
import type { CsvField } from "@/lib/connectors/csv/fields";
import type { SourceStatus } from "@/lib/db/schema";

export type Schedule = "hourly" | "every_6_hours" | "daily";
export type Weight = "low" | "normal" | "high";

export type ConnectorInfo = {
  key: string;
  label: string;
  group: ConnectorGroup;
  description: string;
  costNote: string;
  catalogueNote: string | null;
  needsKey: boolean;
  credentialService: string | null;
  availability: "available" | "needs_approval" | "coming_soon";
  scopeFields: ScopeFieldSpec[];
  defaultScope: Record<string, unknown>;
  mappingMode: "fixed" | "user";
  fixedMapping: MappingRow[];
  describable: boolean;
  /** A source of this kind already exists. */
  added: boolean;
  key4: string | null;
  keyStatus: "off" | "testing" | "connected" | "rejected";
};

export type WizardConfig = {
  scope: Record<string, unknown>;
  mapping: Record<string, CsvField> | null;
  schedule: Schedule;
  max_items: number;
  spend_cap_gbp: number | null;
  weight: Weight;
  describe_text: string | null;
};

export type WizardStart =
  | { mode: "new" }
  | { mode: "clients" }
  | { mode: "edit"; sourceId: string; connector: string; name: string; config: WizardConfig; status: SourceStatus };

export type CatalogueData = {
  connectors: ConnectorInfo[];
  comingSoon: Array<{ key: string; label: string; group: ConnectorGroup; description: string; costNote: string }>;
  /** The estimated cost of reviewing one item, from recent reviews or the price table. */
  perItemGbp: number;
  reviewCap: number;
};

export type DescribeResult =
  | { ok: true; scope: Record<string, unknown>; suggested: string[] }
  | { ok: false; message: string };

export type ScopeCheck = { ok: true } | { ok: false; issues: Record<string, string>; message: string };

export type PreviewRow = {
  outcome: "new" | "signal" | "filtered";
  /** "New target", "Signal on Ember & Oak Ltd", "Filtered out, Not UK". */
  label: string;
  title: string;
  meta: string;
};

export type PreviewResult =
  | { ok: true; rows: PreviewRow[]; source: string }
  | { ok: false; message: string };

export type UploadResult =
  | { ok: true; uploadId: string; fileName: string; rowCount: number; headers: string[]; samples: Array<Record<string, string>> }
  | { ok: false; message: string };

export type MappingResult =
  | { ok: true; mapping: Record<string, CsvField>; suggested: string[] }
  | { ok: false; message: string; mapping: Record<string, CsvField> };

export type DuplicateRow = { name: string; note: string };
export type DuplicateCheck = { fresh: DuplicateRow[]; match: DuplicateRow[]; problems: DuplicateRow[] };

export type ActionResult = { ok: boolean; message: string | null; sourceId?: string };

/** A source's row on Connections. */
export type SourceRow = {
  id: string;
  name: string;
  connector: string;
  /** "Hacker News: accountant, bookkeeping" */
  line: string;
  status: SourceStatus;
  keyText: string;
  /** "Last run 12:00, 38 fetched" */
  sub: string | null;
  /** "41 fetched, 6 became targets, 2 kept this week" */
  result: string | null;
  /** The failure or the spend-cap message. */
  error: string | null;
  capReached: boolean;
};

export type SourceDetail = {
  id: string;
  name: string;
  connector: string;
  connectorLabel: string;
  status: SourceStatus;
  statusLine: string;
  lastRun: string;
  nextRun: string;
  scheduleText: string;
  runs: Array<{ label: string; fetched: number; when: string }>;
  runsNote: string;
  week: { fetched: number; targets: number; kept: number };
  settings: Array<{ label: string; value: string }>;
  history: Array<{ version: number; when: string; change: string; current: boolean }>;
  error: string | null;
  start: WizardStart;
};
