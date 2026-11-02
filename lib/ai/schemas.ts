import { z } from "zod";
import { domainOf } from "@/lib/ontology/names";

// Every AI output is validated against one of these. The model is asked for a looser "draft" shape, because length
// limits in a JSON schema aren't reliably honoured; the draft is then clipped,
// its URLs checked against what the review actually saw, and parsed with the
// strict schema.

export const Review = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().max(140), // one line for the table
  what_they_do: z.string().max(300),
  why_fit: z.string().max(400),
  why_now: z.string().max(300).nullable(),
  website: z.string().url().nullable(),
  suggested_reply: z.string().max(600).nullable(), // conversations only
  possible_company_name: z.string().max(120).nullable(),
  sources: z.array(z.string().url()).max(6),
});
export type Review = z.infer<typeof Review>;

export const ReviewDraft = z.object({
  // Written before the score, so the score follows from the rubric's sums
  // rather than settling on a habitual number. Not stored.
  score_workings: z
    .string()
    .describe("One line, written before deciding the score: the band, then each adjustment from the rubric with its fact, then the total. For example: \"20-39: 28, +4 core industry, +6 accounts due in 9 months, -5 aged 14 months, -2 shared address = 31\"."),
  score: z.number().int().min(0).max(100).describe("Fit score, 0 to 100: the total from score_workings."),
  summary: z.string().describe("One line for the table, under 100 characters. The single most useful reason."),
  what_they_do: z.string().describe("One sentence, under 200 characters. Say plainly if it isn't known."),
  why_fit: z.string().describe("One or two sentences, under 300 characters: why they fit or don't."),
  why_now: z.string().nullable().describe("One sentence, under 200 characters, naming the timely reason. Null if there isn't one."),
  website: z.string().nullable().describe("The company's own website, only if one of the research URLs is it. Otherwise null."),
  suggested_reply: z.string().nullable().describe("Conversations only: a short, helpful reply. Null for companies."),
  possible_company_name: z.string().nullable().describe("Conversations only: the company the post names. Otherwise null."),
  sources: z.array(z.string()).describe("URLs you relied on, copied exactly from the input or research. At most 6."),
});
export type ReviewDraft = z.infer<typeof ReviewDraft>;

/** Shortens text to max characters at a word boundary. */
export function clip(text: string, max: number): string {
  const s = text.trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

const clipOrNull = (text: string | null, max: number) => (text && text.trim() ? clip(text, max) : null);

const isUrl = (s: string) => z.string().url().safeParse(s).success && /^https?:/i.test(s);

// Keeps only URLs the review was given or found, so a citation can never be
// invented. The website must be one of those URLs' sites.
export function toReview(draft: ReviewDraft, allowedUrls: ReadonlySet<string>): Review {
  const sources = [...new Set(draft.sources.map((u) => u.trim()))].filter((u) => allowedUrls.has(u) && isUrl(u)).slice(0, 6);
  const allowedDomains = new Set([...allowedUrls].map(domainOf).filter(Boolean));
  const site = draft.website?.trim() ?? null;
  const website = site && isUrl(site) && allowedDomains.has(domainOf(site)) ? site : null;
  return Review.parse({
    score: Math.round(draft.score),
    summary: clip(draft.summary, 140),
    what_they_do: clip(draft.what_they_do, 300),
    why_fit: clip(draft.why_fit, 400),
    why_now: clipOrNull(draft.why_now, 300),
    website,
    suggested_reply: clipOrNull(draft.suggested_reply, 600),
    possible_company_name: clipOrNull(draft.possible_company_name, 120),
    sources,
  });
}

export const RunSummary = z.object({
  headline: z.string().describe("One or two sentences, under 260 characters, naming the strongest company and its score."),
  paragraphs: z.array(z.string()).max(2).describe("Up to two short paragraphs, each under 300 characters."),
  highlight_target_ids: z.array(z.string()).describe("IDs of the companies named in the text, copied from the input."),
});
export type RunSummary = z.infer<typeof RunSummary>;

export const IdealIndustries = z.object({
  sic_prefixes: z.array(z.string()).describe("SIC 2007 code prefixes, 2 to 5 digits each."),
});

/** Keeps well-formed prefixes only, without duplicates, at most 40. */
export function cleanSicPrefixes(prefixes: string[]): string[] {
  return [...new Set(prefixes.map((p) => p.trim()).filter((p) => /^\d{2,5}$/.test(p)))].slice(0, 40);
}

export const ClientAnalysis = z.object({
  what_they_do: z.string().max(200),
  segment: z.string().max(40), // "B2B SaaS", "Agency", "E-commerce", "Logistics"…
  why_they_signed: z.string().max(300), // shown with "(inferred)" unless a notes column was mapped
  sources: z.array(z.string().url()).max(5),
});
export type ClientAnalysis = z.infer<typeof ClientAnalysis>;

export const ClientAnalysisDraft = z.object({
  what_they_do: z.string().describe("One sentence, under 160 characters."),
  segment: z.string().describe("A client type of one to three words, such as B2B SaaS or Agency."),
  why_they_signed: z.string().describe("One sentence, under 220 characters."),
  sources: z.array(z.string()).describe("URLs relied on, copied exactly from the research. At most 5."),
});
export type ClientAnalysisDraft = z.infer<typeof ClientAnalysisDraft>;

export function toClientAnalysis(draft: ClientAnalysisDraft, allowedUrls: ReadonlySet<string>): ClientAnalysis {
  return ClientAnalysis.parse({
    what_they_do: clip(draft.what_they_do, 200),
    segment: clip(draft.segment, 40),
    why_they_signed: clip(draft.why_they_signed, 300),
    sources: [...new Set(draft.sources.map((u) => u.trim()))].filter((u) => allowedUrls.has(u) && isUrl(u)).slice(0, 5),
  });
}

export const LookalikeDraft = z.object({
  companies: z
    .array(
      z.object({
        name: z.string().describe("The registered company name, such as Northwind Labs Ltd."),
        reason: z.string().describe("Why it resembles the client, one sentence under 120 characters."),
      }),
    )
    .describe("Up to 5 real London companies. Empty if none fit."),
});
export type LookalikeDraft = z.infer<typeof LookalikeDraft>;

export type Lookalike = { name: string; reason: string };

/** Up to 5 suggestions with a usable name, each name once. */
export function toLookalikes(draft: LookalikeDraft): Lookalike[] {
  const seen = new Set<string>();
  const out: Lookalike[] = [];
  for (const c of draft.companies) {
    const name = c.name.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (name.length < 2 || name.length > 160 || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, reason: clip(c.reason.trim(), 160) });
  }
  return out.slice(0, 5);
}

export const IdealClientDraft = z.object({
  text: z.string().describe("The ideal-client description, under 60 words."),
});

/** Keeps the ideal-client text under 60 words. */
export function clipWords(text: string, maxWords: number): string {
  const words = text.trim().replace(/\s+/g, " ").split(" ");
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ").replace(/[,;:]$/, "")}.`;
}

export const CsvMappingSuggestion = z.object({
  mappings: z.array(
    z.object({
      column: z.string(),
      field: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type CsvMappingSuggestion = z.infer<typeof CsvMappingSuggestion>;

// The trading check: one cheap web look at a
// company with no known website, before its review.
export const TradingCheck = z.object({
  website: z.string().url().nullable(),
  trading: z.enum(["yes", "no", "unclear"]),
  evidence: z.string().max(160), // one plain line, e.g. "Online shop selling desk mats, prices listed"
  sources: z.array(z.string().url()).max(3),
});
export type TradingCheck = z.infer<typeof TradingCheck>;

export const TradingCheckDraft = z.object({
  website: z.string().nullable().describe("The company's own website, only if a search result is clearly this company's. Otherwise null."),
  trading: z.enum(["yes", "no", "unclear"]).describe("yes: a live site, product, shop, listings or hiring for this exact company. no: clear signs it has stopped or never started. unclear: nothing found, or not sure it's this company."),
  evidence: z.string().describe("One plain line under 120 characters, such as \"Online shop selling desk mats, prices listed\". For unclear, say what was looked for."),
  sources: z.array(z.string()).describe("Up to 3 URLs from the search results that back this up, copied exactly."),
});
export type TradingCheckDraft = z.infer<typeof TradingCheckDraft>;

// Keeps only URLs the search actually returned, so evidence can't be invented.
// Without a source, "yes" and "no" can't stand and become "unclear".
export function toTradingCheck(draft: TradingCheckDraft, allowedUrls: ReadonlySet<string>): TradingCheck {
  const sources = [...new Set(draft.sources.map((u) => u.trim()))].filter((u) => allowedUrls.has(u) && isUrl(u)).slice(0, 3);
  const allowedDomains = new Set([...allowedUrls].map(domainOf).filter(Boolean));
  const site = draft.website?.trim() ?? null;
  const website = site && isUrl(site) && allowedDomains.has(domainOf(site)) ? site : null;
  const trading = sources.length === 0 && !website ? "unclear" : draft.trading;
  return TradingCheck.parse({ website, trading, evidence: clip(draft.evidence, 160), sources });
}
