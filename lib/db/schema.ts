import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
// Relative, so drizzle-kit can load this file without the @ alias.
import { REASONS } from "../targets/reasons";

// IDs are text UUIDs and times are ISO strings.
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const now = () => new Date().toISOString();
const createdAt = (name: string) => text(name).notNull().$defaultFn(now);
const workspaceId = () =>
  text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });
const isDemo = () => integer("is_demo").notNull().default(0);
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export type Json = Record<string, unknown>;
/** "negative" marks a sign against a lead, such as dormant accounts or a strike-off notice. */
export type Weight = "low" | "normal" | "high" | "negative";

// The workspace. A vault holds one; the column stays on every table so the
// data model doesn't change if vaults ever hold more.

export const workspaces = sqliteTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  labels: json<{ targets: string; seeds: string }>("labels")
    .notNull()
    .$defaultFn(() => ({ targets: "New companies", seeds: "Clients" })),
});

// The ontology: targets, signals, people, places, links, sources

export const targets = sqliteTable(
  "targets",
  {
    id: id(),
    workspaceId: workspaceId(),
    kind: text("kind", { enum: ["company", "conversation"] }).notNull(),
    name: text("name").notNull(),
    companyNumber: text("company_number"),
    url: text("url"),
    domain: text("domain"),
    status: text("status"),
    incorporatedOn: text("incorporated_on"),
    sicCodes: json<string[]>("sic_codes"),
    companyType: text("company_type"),
    placeId: text("place_id").references(() => places.id, { onDelete: "set null" }),
    profile: json<Json>("profile"),
    /** App state about the target, such as hubspot_id and hubspot_sent_at. */
    attributes: json<Json>("attributes"),
    firstSeenAt: createdAt("first_seen_at"),
    firstSourceId: text("first_source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    isClient: integer("is_client").notNull().default(0),
    isDemo: isDemo(),
  },
  (t) => [
    // Demo rows are left out so a real company never collides with one.
    // The resolver must also ignore is_demo = 1 rows when matching.
    uniqueIndex("targets_company_number_uq")
      .on(t.workspaceId, t.companyNumber)
      .where(sql`company_number is not null and is_demo = 0`),
    index("targets_workspace_kind_idx").on(t.workspaceId, t.kind),
    index("targets_domain_idx").on(t.workspaceId, t.domain),
  ],
);

export const signals = sqliteTable(
  "signals",
  {
    id: id(),
    workspaceId: workspaceId(),
    targetId: text("target_id").references(() => targets.id, { onDelete: "cascade" }),
    sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    url: text("url"),
    occurredAt: text("occurred_at"),
    dueAt: text("due_at"),
    weight: text("weight", { enum: ["low", "normal", "high", "negative"] })
      .$type<Weight>()
      .notNull()
      .default("normal"),
    attributes: json<Json>("attributes"),
    /** The source's own ID for what the signal came from, such as ch:filing:{transaction_id}. Re-runs match on it. */
    externalId: text("external_id"),
    isDemo: isDemo(),
  },
  (t) => [
    index("signals_target_idx").on(t.targetId),
    index("signals_due_idx").on(t.workspaceId, t.dueAt),
    index("signals_external_idx").on(t.targetId, t.externalId),
  ],
);

export const people = sqliteTable(
  "people",
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    externalId: text("external_id"),
    attributes: json<Json>("attributes"),
    isDemo: isDemo(),
  },
  (t) => [index("people_external_idx").on(t.workspaceId, t.externalId)],
);

export const places = sqliteTable(
  "places",
  {
    id: id(),
    workspaceId: workspaceId(),
    postcode: text("postcode"),
    address: text("address"),
    lat: real("lat"),
    lng: real("lng"),
    borough: text("borough"),
    isDemo: isDemo(),
  },
  (t) => [index("places_postcode_idx").on(t.workspaceId, t.postcode)],
);

export const links = sqliteTable(
  "links",
  {
    id: id(),
    workspaceId: workspaceId(),
    fromType: text("from_type").notNull(),
    fromId: text("from_id").notNull(),
    toType: text("to_type").notNull(),
    toId: text("to_id").notNull(),
    kind: text("kind", {
      enum: ["directs", "authored", "located_at", "resembles", "mentions", "possible_match"],
    }).notNull(),
    attributes: json<Json>("attributes"),
    sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),
    isDemo: isDemo(),
  },
  (t) => [
    index("links_from_idx").on(t.fromType, t.fromId),
    index("links_to_idx").on(t.toType, t.toId),
  ],
);

export type SourceStatus = "connected" | "paused" | "failed" | "awaiting_approval";

export const sources = sqliteTable("sources", {
  id: id(),
  workspaceId: workspaceId(),
  connector: text("connector").notNull(),
  name: text("name").notNull(),
  status: text("status", {
    enum: ["connected", "paused", "failed", "awaiting_approval"],
  })
    .$type<SourceStatus>()
    .notNull()
    .default("connected"),
  // scope, mapping, schedule, max_items, spend_cap_gbp, weight, describe_text
  config: json<Json>("config").notNull().$defaultFn(() => ({})),
  version: integer("version").notNull().default(1),
  cursor: json<unknown>("cursor"),
  credentialId: text("credential_id").references(() => credentials.id, {
    onDelete: "set null",
  }),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  lastError: text("last_error"),
  createdAt: createdAt("created_at"),
  isDemo: isDemo(),
});

export const sourceVersions = sqliteTable(
  "source_versions",
  {
    id: id(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    config: json<Json>("config").notNull(),
    savedAt: createdAt("saved_at"),
  },
  (t) => [uniqueIndex("source_versions_uq").on(t.sourceId, t.version)],
);

export const rawItems = sqliteTable(
  "raw_items",
  {
    id: id(),
    workspaceId: workspaceId(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    payload: json<unknown>("payload").notNull(),
    fetchedAt: createdAt("fetched_at"),
  },
  (t) => [uniqueIndex("raw_items_source_external_uq").on(t.sourceId, t.externalId)],
);

// Everything else

export type CredentialStatus = "connected" | "rejected" | "testing";

export const credentials = sqliteTable(
  "credentials",
  {
    id: id(),
    workspaceId: workspaceId(),
    service: text("service").notNull(),
    /** The key itself. The whole database is encrypted with the vault key, so
     *  it is never readable outside an unlocked vault. Never log or render it. */
    secret: text("secret").notNull(),
    last4: text("last4").notNull(),
    status: text("status", { enum: ["connected", "rejected", "testing"] })
      .$type<CredentialStatus>()
      .notNull()
      .default("testing"),
    lastTestedAt: text("last_tested_at"),
    lastUsedAt: text("last_used_at"),
    message: text("message"),
  },
  (t) => [uniqueIndex("credentials_service_uq").on(t.workspaceId, t.service)],
);

export const settings = sqliteTable(
  "settings",
  {
    workspaceId: workspaceId(),
    key: text("key").notNull(),
    value: json<unknown>("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.key] })],
);

export const runs = sqliteTable(
  "runs",
  {
    id: id(),
    workspaceId: workspaceId(),
    kind: text("kind", { enum: ["scheduled", "manual"] }).notNull(),
    // Set when the run is for one source only, such as one just saved.
    sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),
    // 1 when the run is a lookalike search from Clients: no sources are fetched.
    findLookalikes: integer("find_lookalikes").notNull().default(0),
    status: text("status", { enum: ["queued", "running", "done", "failed"] })
      .notNull()
      .default("queued"),
    step: integer("step").notNull().default(1),
    counts: json<Json>("counts"),
    summary: text("summary"),
    summaryHighlights: json<string[]>("summary_highlights"),
    error: text("error"),
    queuedAt: createdAt("queued_at"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
  },
  (t) => [index("runs_status_idx").on(t.workspaceId, t.status)],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: id(),
    targetId: text("target_id")
      .notNull()
      .references(() => targets.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    summary: text("summary").notNull(),
    whatTheyDo: text("what_they_do"),
    whyFit: text("why_fit"),
    whyNow: text("why_now"),
    suggestedReply: text("suggested_reply"),
    possibleCompanyName: text("possible_company_name"),
    sources: json<string[]>("sources").notNull().$defaultFn(() => []),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costGbp: real("cost_gbp"),
    reviewedAt: createdAt("reviewed_at"),
    runId: text("run_id").references(() => runs.id, { onDelete: "set null" }),
  },
  (t) => [index("reviews_target_idx").on(t.targetId, t.reviewedAt)],
);

export const decisions = sqliteTable(
  "decisions",
  {
    id: id(),
    targetId: text("target_id")
      .notNull()
      .references(() => targets.id, { onDelete: "cascade" }),
    decision: text("decision", { enum: ["kept", "discarded"] }).notNull(),
    decidedAt: createdAt("decided_at"),
    undoneAt: text("undone_at"),
    /** Why a discard was made, when the user said. Keep decisions have none. */
    reason: text("reason", { enum: REASONS }),
    /** With reason "other": up to 200 characters. */
    note: text("note"),
  },
  (t) => [index("decisions_target_idx").on(t.targetId, t.decidedAt)],
);

export const clients = sqliteTable("clients", {
  targetId: text("target_id")
    .primaryKey()
    .references(() => targets.id, { onDelete: "cascade" }),
  whySigned: text("why_they_signed"),
  // "inferred", or a source label such as "sales notes"
  whySource: text("why_source"),
  segment: text("segment"),
  signedOn: text("signed_on"),
  whatTheyDo: text("what_they_do"),
  sources: json<string[]>("sources"),
  // A client listed without a company number is looked up by name:
  // "matched", or "none" when Companies House had no single match.
  chMatch: text("ch_match"),
  analysedAt: text("analysed_at"),
  /** The AI that analysed it: "Claude", "ChatGPT" or "Grok". */
  analysedBy: text("analysed_by"),
  // When lookalikes were last searched for, so each search starts with the
  // clients searched longest ago.
  lookalikesAt: text("lookalikes_at"),
});

export const runLog = sqliteTable(
  "run_log",
  {
    id: id(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    at: createdAt("at"),
    actor: text("actor").notNull(),
    message: text("message").notNull(),
    level: text("level", { enum: ["info", "error"] }).notNull().default("info"),
  },
  (t) => [index("run_log_run_idx").on(t.runId, t.at)],
);

export type Target = typeof targets.$inferSelect;
export type Signal = typeof signals.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type Credential = typeof credentials.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Client = typeof clients.$inferSelect;
