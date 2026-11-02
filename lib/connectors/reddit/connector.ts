import { z } from "zod";
import type { Connector, MappingRow, ScopeFieldSpec } from "../types";

// Reddit is a stub until Reddit approves commercial access. The wizard sets it
// up and saves it as awaiting approval; runs skip it, and fetch refuses.

const LOOK_BACKS = ["24h", "7d", "30d"] as const;
const LOOK_BACK_LABELS: Record<(typeof LOOK_BACKS)[number], string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days" };
const words = z.array(z.string().trim().min(1).max(80)).max(20);

export const redditScope = z.object({
  subreddits: z
    .array(z.string().trim().regex(/^(r\/)?[A-Za-z0-9_]{2,21}$/, "Subreddits look like r/smallbusiness."))
    .min(1, "Add at least one subreddit.")
    .max(20),
  keywords: words.min(1, "Add at least one keyword."),
  exclude: words,
  minUpvotes: z.number().int().min(0).max(100_000),
  lookBack: z.enum(LOOK_BACKS),
  includeComments: z.boolean(),
});
export type RedditScope = z.infer<typeof redditScope>;

const scopeFields: ScopeFieldSpec[] = [
  { key: "subreddits", label: "Subreddits", input: "chips", placeholder: "Add a subreddit" },
  { key: "keywords", label: "Keywords and phrases", input: "chips", placeholder: "Add a keyword" },
  { key: "exclude", label: "Words to exclude", input: "chips", placeholder: "Add a word" },
  { key: "minUpvotes", label: "Minimum upvotes", input: "number", row: "limits" },
  {
    key: "lookBack",
    label: "Look back",
    input: "segmented",
    options: LOOK_BACKS.map((value) => ({ value, label: LOOK_BACK_LABELS[value] })),
    row: "limits",
  },
  { key: "includeComments", label: "Include comments", input: "toggle", help: "Also read replies under matching posts" },
];

const fixedMapping: MappingRow[] = [
  { from: "Post title", to: "Target name (a conversation)", group: "Target" },
  { from: "Permalink", to: "Link", group: "Target" },
  { from: "Created", to: "Date", group: "Signal" },
  { from: "Post text", to: "Description", group: "Signal" },
  { from: "Author", to: "Person name", group: "Person" },
];

export const AWAITING_REDDIT = "Waiting for Reddit to approve commercial access.";

const sub = (s: string) => (s.startsWith("r/") ? s : `r/${s}`);

export const redditConnector: Connector<RedditScope, never> = {
  key: "reddit",
  label: "Reddit",
  group: "Communities",
  description: "Posts and comments in the subreddits you choose",
  costNote: "Free, needs approval",
  catalogueNote: "Commercial use needs Reddit’s approval. You can set it up now and it will start once approved.",
  needsKey: true,
  credentialService: "reddit",
  availability: "needs_approval",
  scopeSchema: redditScope,
  scopeFields,
  describable: true,
  defaultScope: () => ({
    subreddits: ["r/smallbusiness", "r/UKPersonalFinance"],
    keywords: ["need an accountant", "accountant recommendation", "bookkeeper"],
    exclude: ["IRS", "CPA"],
    minUpvotes: 2,
    lookBack: "7d",
    includeComments: true,
  }),
  scopeLine: (scope) => scope.subreddits.map(sub).join(", "),
  scopeSummary: (scope) => [
    { label: "Subreddits", value: scope.subreddits.map(sub).join(", ") },
    { label: "Keywords", value: scope.keywords.join(", ") },
    { label: "Excludes", value: scope.exclude.join(", ") || "Nothing" },
    { label: "Look back", value: LOOK_BACK_LABELS[scope.lookBack] },
  ],
  mappingMode: "fixed",
  fixedMapping,
  async fetch() {
    throw new Error(AWAITING_REDDIT);
  },
  externalId: () => "",
  normalise: () => ({ targets: [], signals: [], people: [], places: [], links: [] }),
};
