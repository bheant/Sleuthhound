import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Used until the user's clients are uploaded and analysed, which
// writes a new ideal client unless someone has edited this one.
export const STARTER_IDEAL_CLIENT =
  "UK startups under three years old, mostly B2B software, agencies and e-commerce, from pre-seed to Series A, with no in-house finance team. The best fits are recently funded, with new shares allotted, and clearly trading: a live product, shop or paying clients. A good time to reach out is after a fundraise or as the first accounts deadline nears.";

export type Settings = {
  default_ai: "anthropic" | "openai" | "xai";
  /** Model names for each AI, so none is hard-coded. Only the default's are used. */
  ai_models: Record<"anthropic" | "openai" | "xai", { review: string; writing: string }>;
  /** written_at and client_count are set when the AI writes it from the
   *  clients; edited_at when someone edits it, which also sets edited_by_user. */
  ideal_client: {
    text: string;
    edited_by_user: boolean;
    written_at?: string;
    client_count?: number;
    edited_at?: string;
    /** The AI that wrote it. Absent from texts written before phase 8, all by Claude. */
    written_by?: string;
  };
  /** An AI rewrite held back because the user has edited the text. Empty text: none. */
  ideal_client_suggestion: { text: string; client_count: number; written_at: string };
  review_cap_per_run: number;
  /** Before reviews, this many top companies with no known website get one web check for signs of trading. */
  trading_check_count: number;
  score_threshold: number;
  web_search: boolean;
  max_searches_per_review: number;
  /** Set once the default Companies House source has been added. */
  default_source_created: boolean;
  /** SIC code prefixes for the ideal client's industries, worked out by the AI
   *  from the ideal-client text it was given, so a new text recomputes them. */
  ideal_client_sic: { text: string; prefixes: string[] };
  /** Search for lookalikes of the clients in the first scheduled run of each day. */
  lookalikes_daily: boolean;
  /** When the last lookalike search ran. Empty: never. */
  lookalikes_last_at: string;
  /** Set when the user hides the first-run checklist on Home. */
  setup_checklist_dismissed: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  default_ai: "anthropic",
  ai_models: {
    anthropic: { review: "claude-haiku-5-5", writing: "claude-sonnet-5-5" },
    openai: { review: "gpt-6-luna", writing: "gpt-6.1-sol" },
    xai: { review: "grok-4.3", writing: "grok-4.7" },
  },
  ideal_client: { text: STARTER_IDEAL_CLIENT, edited_by_user: false },
  ideal_client_suggestion: { text: "", client_count: 0, written_at: "" },
  review_cap_per_run: 40,
  trading_check_count: 15,
  score_threshold: 60,
  web_search: true,
  max_searches_per_review: 2,
  default_source_created: false,
  // Settings values can't be null; an empty text never matches a real one.
  ideal_client_sic: { text: "", prefixes: [] },
  lookalikes_daily: false,
  lookalikes_last_at: "",
  setup_checklist_dismissed: false,
};

export function getSetting<K extends keyof Settings>(workspaceId: string, key: K): Settings[K] {
  const row = db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(and(eq(schema.settings.workspaceId, workspaceId), eq(schema.settings.key, key)))
    .get();
  return (row?.value as Settings[K] | undefined) ?? DEFAULT_SETTINGS[key];
}

export function setSetting<K extends keyof Settings>(workspaceId: string, key: K, value: Settings[K]) {
  db.insert(schema.settings)
    .values({ workspaceId, key, value })
    .onConflictDoUpdate({ target: [schema.settings.workspaceId, schema.settings.key], set: { value } })
    .run();
}

// Adds any missing keys with their defaults; never overwrites a stored value,
// except an empty ideal client, which gets the starter text.
export function ensureDefaultSettings(workspaceId: string) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.insert(schema.settings).values({ workspaceId, key, value }).onConflictDoNothing().run();
  }
  if (!getSetting(workspaceId, "ideal_client").text.trim()) {
    setSetting(workspaceId, "ideal_client", { text: STARTER_IDEAL_CLIENT, edited_by_user: false });
  }
}
