import { z } from "zod";
import type { Connector, MappingRow, ScopeFieldSpec } from "../types";
import { fetchHackerNews } from "./fetch";
import { ageText, bodyOf, isComment, itemUrl, mentions, titleOf } from "./text";
import type { HnHit } from "./types";

// Hacker News: stories and comments that mention the keywords. Each becomes a
// conversation target with a community_post signal, its author and an
// authored link. Mostly US, so expect a handful of UK posts a day.

const LOOK_BACKS = ["24h", "7d", "30d"] as const;
const LOOK_BACK_LABELS: Record<(typeof LOOK_BACKS)[number], string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days" };

const words = z.array(z.string().trim().min(1).max(80)).max(20);

export const hackerNewsScope = z.object({
  keywords: words.min(1, "Add at least one keyword."),
  exclude: words,
  includeComments: z.boolean(),
  lookBack: z.enum(LOOK_BACKS),
  minPoints: z.number().int().min(0).max(10_000),
});
export type HackerNewsScope = z.infer<typeof hackerNewsScope>;

const scopeFields: ScopeFieldSpec[] = [
  { key: "keywords", label: "Keywords and phrases", input: "chips", placeholder: "Add a keyword" },
  { key: "exclude", label: "Words to exclude", input: "chips", placeholder: "Add a word" },
  { key: "minPoints", label: "Minimum points", input: "number", help: "Stories only; comments have no points.", row: "limits" },
  {
    key: "lookBack",
    label: "Look back",
    input: "segmented",
    options: LOOK_BACKS.map((value) => ({ value, label: LOOK_BACK_LABELS[value] })),
    row: "limits",
  },
  { key: "includeComments", label: "Include comments", input: "toggle", help: "Also read replies, not just stories" },
];

const fixedMapping: MappingRow[] = [
  { from: "Story title, or a comment’s first line", to: "Target name (a conversation)", group: "Target" },
  { from: "Item link", to: "Link", group: "Target" },
  { from: "Posted", to: "Date", group: "Signal" },
  { from: "Post text", to: "Description", group: "Signal" },
  { from: "Author", to: "Person name", group: "Person" },
];

function filterHit(hit: HnHit, scope: HackerNewsScope): { keep: boolean; reason?: string } {
  const text = `${hit.story_title ?? ""}\n${bodyOf(hit)}`;
  const own = bodyOf(hit);
  const excluded = scope.exclude.find((w) => mentions(text, w));
  if (excluded) return { keep: false, reason: `Mentions “${excluded}”` };
  if (!isComment(hit) && (hit.points ?? 0) < scope.minPoints) return { keep: false, reason: `Below ${scope.minPoints} points` };
  if (!scope.keywords.some((k) => mentions(own, k))) return { keep: false, reason: "Doesn’t mention a keyword" };
  return { keep: true };
}

export const hackerNewsConnector: Connector<HackerNewsScope, HnHit> = {
  key: "hacker_news",
  label: "Hacker News",
  group: "Communities",
  description: "Ask HN, Show HN and Who is hiring threads",
  costNote: "Free",
  needsKey: false,
  availability: "available",
  scopeSchema: hackerNewsScope,
  scopeFields,
  describable: true,
  defaultScope: () => ({
    keywords: ["accountant", "bookkeeping", "UK limited company"],
    exclude: ["IRS", "CPA"],
    includeComments: true,
    lookBack: "7d",
    minPoints: 0,
  }),
  scopeLine: (scope) => scope.keywords.join(", "),
  scopeSummary: (scope) => [
    { label: "Keywords", value: scope.keywords.join(", ") },
    { label: "Excludes", value: scope.exclude.join(", ") || "Nothing" },
    { label: "Reads", value: scope.includeComments ? "Stories and comments" : "Stories only" },
    { label: "Look back", value: LOOK_BACK_LABELS[scope.lookBack] },
    ...(scope.minPoints ? [{ label: "Minimum points", value: String(scope.minPoints) }] : []),
  ],
  mappingMode: "fixed",
  fixedMapping,
  fetch: (ctx) => fetchHackerNews(ctx),
  externalId: (raw) => raw.objectID,
  filter: filterHit,
  previewMeta: (raw, now) =>
    [
      "Hacker News",
      ageText(raw.created_at, now),
      isComment(raw) ? (raw.story_title ? `comment on “${raw.story_title}”` : "comment") : `${raw.points ?? 0} points`,
    ].join(", "),
  normalise: (raw) => {
    const url = itemUrl(raw);
    const text = bodyOf(raw);
    const title = titleOf(raw);
    return {
      targets: [
        {
          ref: "post",
          kind: "conversation",
          name: title,
          url,
          status: "open",
          profile: {
            text,
            where: "Hacker News",
            author: raw.author,
            posted_at: raw.created_at,
            points: raw.points ?? null,
            thread: isComment(raw) ? (raw.story_title ?? null) : null,
          },
        },
      ],
      signals: [{ targetRef: "post", type: "community_post", title, body: text, url, occurredAt: raw.created_at }],
      people: raw.author ? [{ ref: "author", name: raw.author, externalId: `hn:${raw.author}`, attributes: { site: "Hacker News" } }] : [],
      places: [],
      links: raw.author ? [{ fromRef: "author", toRef: "post", kind: "authored" }] : [],
    };
  },
};
