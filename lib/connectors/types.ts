import type { z } from "zod";
import type { Weight } from "@/lib/db/schema";

// The contract every source implements, built in or added later. The wizard,
// the runner and the Connections page only ever talk to this interface.

export type ConnectorGroup = "Registers" | "Communities" | "Hiring" | "News" | "Your files" | "Custom";

export type ScopeFieldSpec = {
  key: string;
  label: string;
  /** "segmented" is a row of toggles for a few choices; "file" is the CSV drop zone. */
  input: "text" | "date" | "select" | "sic" | "checkboxes" | "chips" | "toggle" | "number" | "segmented" | "file";
  help?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  /** Fields that sit side by side share a row. */
  row?: string;
};

/** One line of a source's settings, for the source detail panel. */
export type ScopeLine = { label: string; value: string };

/** One row of a fixed mapping, shown read-only behind "See how fields map". */
export type MappingRow = {
  from: string;
  to: string;
  group: "Target" | "Signal" | "Person" | "Place";
};

export type TestCtx = { apiKey: string | null };

export type FetchCtx<Scope> = {
  workspaceId: string;
  /** Null in preview, before the source is saved. */
  sourceId: string | null;
  scope: Scope;
  apiKey: string | null;
  cursor: unknown;
  /** Most items to return. Preview passes 10. */
  limit: number;
  log: (message: string, level?: "info" | "error") => void;
};

export type NormaliseCtx = {
  workspaceId: string;
  sourceId: string;
  now: string;
  /** The source's own config: CSV reads its column mapping from here. */
  mapping?: unknown;
  purpose?: string;
};

// Drafts refer to each other by `ref`, a local name that only means something
// inside one draft. lib/ontology/upsert.ts resolves refs to real IDs.

export type TargetDraft = {
  ref: string;
  kind: "company" | "conversation";
  name: string;
  companyNumber?: string;
  url?: string;
  domain?: string;
  status?: string;
  incorporatedOn?: string;
  sicCodes?: string[];
  companyType?: string;
  placeRef?: string;
  profile?: Record<string, unknown>;
  /** Let the resolver match on the normalised name alone when there's no
   *  postcode, as an uploaded list often has none. */
  matchOnName?: boolean;
};

export type SignalDraft = {
  targetRef: string;
  type: string;
  title: string;
  body?: string;
  url?: string;
  occurredAt: string;
  dueAt?: string;
  weight?: Weight;
  attributes?: Record<string, unknown>;
  /** The source's own ID for it. Set, it decides what counts as a duplicate. */
  externalId?: string;
};

export type PersonDraft = { ref: string; name: string; externalId?: string; attributes?: Record<string, unknown> };

export type PlaceDraft = { ref: string; postcode?: string; address?: string };

export type LinkDraft = {
  fromRef: string;
  toRef: string;
  kind: "directs" | "authored" | "located_at" | "resembles" | "mentions" | "possible_match";
  attributes?: Record<string, unknown>;
};

export type OntologyDraft = {
  targets: TargetDraft[];
  signals: SignalDraft[];
  people: PersonDraft[];
  places: PlaceDraft[];
  links: LinkDraft[];
};

export interface Connector<Scope = unknown, Raw = unknown> {
  key: string;
  label: string;
  group: ConnectorGroup;
  /** One line for the catalogue. */
  description: string;
  /** "Free", "Free, no key", "Needs approval". */
  costNote: string;
  /** A quiet extra line in the catalogue, such as Reddit's approval note. */
  catalogueNote?: string;
  needsKey: boolean;
  credentialService?: string;
  availability: "available" | "needs_approval" | "coming_soon";
  /** Drives the Scope form. */
  scopeSchema: z.ZodType<Scope>;
  /** Labels, input types and help text, in order. */
  scopeFields: ScopeFieldSpec[];
  defaultScope(): Scope;
  /** Whether the Describe step asks the AI to fill in Scope. */
  describable: boolean;
  /** "accountant, bookkeeping": the short line under a source's name. */
  scopeLine(scope: Scope): string;
  /** The settings summary in the source detail panel. */
  scopeSummary(scope: Scope): ScopeLine[];
  mappingMode: "fixed" | "user";
  fixedMapping?: MappingRow[];
  test?(ctx: TestCtx): Promise<{ ok: boolean; message: string }>;
  fetch(ctx: FetchCtx<Scope>): Promise<{ items: Raw[]; cursor: unknown }>;
  externalId(raw: Raw): string;
  normalise(raw: Raw, ctx: NormaliseCtx): OntologyDraft;
  filter?(raw: Raw, scope: Scope, mapping?: unknown): { keep: boolean; reason?: string };
  /** How a preview row describes the item: "Hacker News, 2 h ago, 14 points". */
  previewMeta?(raw: Raw, now: Date): string;
}

// The registry holds connectors with different Scope and Raw types side by side.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConnector = Connector<any, any>;
