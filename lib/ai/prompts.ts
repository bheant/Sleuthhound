// Every prompt Sleuthhound sends. Inputs are formatted here as plain labelled
// text, so what the model sees is easy to read and to change. The business
// is the name set in Settings (null when there's none); the rubric is written
// for an accounting firm finding UK companies.
//
// Public version: the review rubric below is a short outline. The rubric used
// at sleuthhound.net is calibrated against real keep and discard decisions
// and isn't published. Everything else here, and the output schemas in
// schemas.ts, are the same as in production.

import { firmIntro, firmsPossessive } from "@/lib/business/name";

// ---------------------------------------------------------------- Review

// Industries are never named here: they come from the ideal-client text, so
// the same prompt works when it's rewritten from the user's own clients.
export const reviewSystem = (business: string | null) => `You review leads for ${firmIntro(business)}. The firm does bookkeeping, year-end accounts, corporation tax, VAT and payroll. A GTM person reads your review and decides in seconds whether to keep or discard the lead.

Judge how well the lead fits ${firmsPossessive(business)} ideal client, which you're given, and whether there's a reason to contact them now.

Rules:
- Use only the data given and the research notes. Never invent facts, people, funding, customers or numbers.
- Companies House data is authoritative for dates, status, officers and filings. Research can add context but never overrides it: if a web page disagrees, state the Companies House fact and don't call it a conflict.
- Anything you state that isn't in the Companies House data must come from a research URL; list those URLs in sources, copied exactly.
- Most new companies have no website, so don't mark a company down for that alone; but don't mark it up for what isn't known either. Say plainly what isn't known.
- If the company clearly has an in-house finance team or a CFO, is large, is a subsidiary of a bigger group, or doesn't fit, score it low.

Scoring. Use the whole range; most companies on the register are not a fit.
- 80 to 100: a strong fit with a clear reason to get in touch now.
- 60 to 79: a good fit with some evidence the company needs an accountant.
- 40 to 59: a plausible fit, but nothing is timely or the evidence is thin.
- 20 to 39: the industry fits and little else is known.
- 0 to 19: dormant, not trading, already has a finance team, or the wrong industry.
Pick the exact score the facts point to, not a round number.

The summary names the most useful reason, and why_fit for any score of 60 or more must say what the funding or trading evidence is.

Write in plain UK English, sentence case, no hype, no exclamation marks. Write dates like 14 May 2027. Be specific. The summary is a short reason, like "Like Brightside when it signed, no CFO" or "First accounts due May". what_they_do is one plain sentence. why_fit compares the lead with the ideal client and with similar clients when given. why_now names the deadline or event with its date, or is null.

For conversations (posts from forums): judge whether the poster plausibly runs a UK business that needs an accountant. Draft suggested_reply: short, genuinely helpful, answers their question first, not salesy, and ends with one line disclosing that you work at ${business ? `${business}, an accounting firm` : "an accounting firm"}. Set possible_company_name only if the post states the company's name.`;

export type ReviewSubject = {
  kind: "company" | "conversation";
  name: string;
  companyNumber: string | null;
  companyType: string | null;
  status: string | null;
  incorporatedOn: string | null;
  industries: string[];
  address: string | null;
  borough: string | null;
  sourceUrl: string | null;
  body: string | null;
  officers: Array<{ name: string; role: string; appointedOn: string | null; otherCompanies: string[] }>;
  signals: Array<{ title: string; occurredAt: string | null; dueAt: string | null }>;
  /** The web trading check, when one was done. Companies only. */
  trading: { trading: "yes" | "no" | "unclear"; evidence: string; website: string | null; sources: string[] } | null;
  /** Register facts that move a score within its band. Companies only. */
  facts: {
    formationAgent: string | null;
    /** Other companies we know of at the same registered office. */
    companiesAtAddress: number;
    directors: number;
    /** e.g. "micro-entity" or "dormant"; "none" if none filed; null if unknown. */
    lastAccountsType: string | null;
  } | null;
};

export type ReviewInput = {
  today: string;
  idealClient: string;
  subject: ReviewSubject;
  similarClients: Array<{ name: string; segment: string | null; whySigned: string | null }>;
  /** The user's reason for each recent discard, or "no reason given". */
  discarded: Array<{ name: string; reason: string }>;
  /** Recent keeps, with their review's one line. */
  kept: Array<{ name: string; summary: string | null }>;
  research: { notes: string; urls: string[] } | null;
};

const line = (label: string, value: string | null | undefined) => (value ? `${label}: ${value}` : null);
const lines = (items: Array<string | null>) => items.filter(Boolean).join("\n");

function subjectText(s: ReviewSubject): string {
  if (s.kind === "conversation") {
    return lines([`Conversation: ${s.name}`, line("URL", s.sourceUrl), s.body ? `Post:\n${s.body}` : null]);
  }
  const officers = s.officers.length
    ? s.officers
        .map((o) => {
          const others = o.otherCompanies.length ? `, also directs ${o.otherCompanies.join(", ")} (active)` : "";
          return `- ${o.name}, ${o.role}${o.appointedOn ? `, appointed ${o.appointedOn}` : ""}${others}`;
        })
        .join("\n")
    : "- None on record yet";
  const signals = s.signals.length
    ? s.signals.map((g) => `- ${g.title}${g.dueAt ? `, due ${g.dueAt}` : g.occurredAt ? `, ${g.occurredAt}` : ""}`).join("\n")
    : "- None";
  return lines([
    `Company: ${s.name}`,
    line("Companies House number", s.companyNumber),
    line("Companies House page", s.sourceUrl),
    line("Type", s.companyType),
    line("Status", s.status),
    line("Incorporated", s.incorporatedOn),
    line("Industry (SIC)", s.industries.join("; ")),
    line("Registered office", s.address),
    line("Borough", s.borough),
    `Officers:\n${officers}`,
    `Signals:\n${signals}`,
    s.facts ? `Register facts:\n${factsText(s.facts)}` : null,
    s.trading ? `Trading check (one web search):\n${tradingText(s.trading)}` : null,
  ]);
}

function tradingText(c: NonNullable<ReviewSubject["trading"]>): string {
  const label = { yes: "trading", no: "not trading", unclear: "not confirmed" }[c.trading];
  return lines([
    `- ${label.charAt(0).toUpperCase()}${label.slice(1)}: ${c.evidence}`,
    c.website ? `- Website: ${c.website}` : null,
    ...c.sources.map((u) => `- Source: ${u}`),
  ]);
}

function factsText(f: NonNullable<ReviewSubject["facts"]>): string {
  const out: string[] = [];
  if (f.formationAgent) out.push(`- Registered office is a known formation agent or virtual office address (${f.formationAgent})`);
  if (f.companiesAtAddress > 0) {
    out.push(`- Registered office shared by ${f.companiesAtAddress + 1} companies in all that we know of`);
  }
  out.push(f.directors === 1 ? "- Sole director" : `- ${f.directors} directors`);
  if (f.lastAccountsType === "none") out.push("- No accounts filed yet");
  else if (f.lastAccountsType) out.push(`- Last accounts filed: ${f.lastAccountsType}`);
  return out.join("\n");
}

export function reviewPrompt(input: ReviewInput): string {
  const clients = input.similarClients.length
    ? input.similarClients.map((c) => `- ${c.name}${c.segment ? ` (${c.segment})` : ""}${c.whySigned ? `: ${c.whySigned}` : ""}`).join("\n")
    : "- None yet";
  const discarded = input.discarded.length
    ? input.discarded.map((d) => `- ${d.name}: ${d.reason}`).join("\n")
    : "- None yet";
  const kept = input.kept.length ? input.kept.map((k) => `- ${k.name}${k.summary ? `: ${k.summary}` : ""}`).join("\n") : "- None yet";
  const research = input.research
    ? `${input.research.notes.trim() || "Nothing useful found."}\nURLs found:\n${input.research.urls.map((u) => `- ${u}`).join("\n") || "- None"}`
    : "No web research for this review.";
  return `Today is ${input.today}.

The firm's ideal client:
${input.idealClient}

Similar existing clients:
${clients}

Leads the GTM person discarded recently, with their reason:
${discarded}

Leads the GTM person kept:
${kept}

Learn from these two lists: score a lead like the discarded ones lower, for the reason given, and a lead like the kept ones higher. Never name any company from these lists in your review.

The lead:
${subjectText(input.subject)}

Web research notes:
${research}

Review this lead.`;
}

// ---------------------------------------------------------------- Research

export function researchPrompt(s: ReviewSubject, maxSearches: number): string {
  return `Research this UK company for a lead review. Use at most ${maxSearches} web searches.

${subjectText(s)}

${s.trading?.website ? `Its website, from an earlier check, is ${s.trading.website}: start there rather than searching for it again.\n\n` : ""}Find: ${s.trading?.website ? "" : "its website, "}what it does, its stage (funding, team size, hiring), and any sign it already has an accountant, a finance team or a CFO. The Companies House data above is authoritative for dates, status and officers; note only what the web adds to it.

Write brief factual notes, each followed by the URL it came from. Many new companies have no web presence; if you can't find this exact company, say so. Don't describe a different company with a similar name, and don't guess.`;
}

// ---------------------------------------------------------------- Trading check

export function tradingCheckPrompt(s: ReviewSubject): string {
  return `Check whether this UK company is trading. Use one web search at most.

${subjectText(s)}

Look for this exact company: its own website, an online shop or marketplace listing, a product, a client list, job ads or recent news. A registry or company-data site (Companies House copies, Endole, companiesdb and the like) only shows that it's registered, not that it trades: don't count it as evidence of trading, and don't give it as the website.

Answer trading "yes" only with evidence of this company doing business, "no" only with evidence that it has stopped or never started, and "unclear" otherwise. Many new companies have no web presence; unclear is the honest answer then. Don't describe a different company with a similar name.`;
}

// ---------------------------------------------------------------- Ideal-client industries

// Turns the ideal-client text into SIC code prefixes once per text, so the
// pipeline can pick which companies to review without an AI call each.
export function industriesPrompt(idealClient: string): string {
  return `Here is the description of an accounting firm's ideal client:

${idealClient}

Go through every industry or kind of business this description names or clearly implies, one by one. For each, list all the UK SIC 2007 codes a company of that kind could register under: there are usually several per industry, often in different divisions, so look beyond the most obvious one.

Give each as a code prefix of 2 to 5 digits: a 2-digit division when the whole division fits, otherwise the 4- or 5-digit classes that fit. Leave out industries the description doesn't mention. If it names none, return an empty list.`;
}

// ---------------------------------------------------------------- Run summary

export const SUMMARY_SYSTEM = `You write the run summary on Sleuthhound's Home page for the GTM person: what the latest run found, in plain UK English.

Style: specific and plain, like a sharp colleague's note. Write in the third person only: never "I" or "we". Name companies exactly as given. No hype, no exclamation marks, no bullet points, no headings. Write dates like 14 May 2027. Use only the facts given; never invent. The facts come from Companies House, which is authoritative: don't describe them as uncertain or conflicting.

Write:
- headline: one or two sentences. If one or more scored at or above the threshold, start "The HH:MM run found N companies worth a look." (N is that number), then name the strongest company, its score and why, with its deadline if it has one. If none did, start "The HH:MM run reviewed N companies and none scored [threshold] or more." and name the best one with its score and the main reason it fell short.
- paragraphs: at most two short paragraphs, each one or two sentences, about what else is worth knowing. Funding comes first when there is any, such as "Two show a likely funding round: Northwind Labs and Pine & Pixel." Then warm intros (a director who also runs a client or another lead), overdue filings and conversations found. A shared registered address is context only, such as where a company is registered: never give it as a reason a company needs an accountant. Only mention what is there: never say that there were no warm intros, no funding or no conversations. An empty list is fine.
- highlight_target_ids: the IDs of every company you named, copied from the input.`;

export type SummaryInput = {
  runTime: string;
  threshold: number;
  counts: { fetched: number; newTargets: number; reviewed: number; matches: number };
  top: Array<{ id: string; name: string; score: number; summary: string; whyNow: string | null; signals: string[] }>;
  warmIntros: string[];
  sharedAddresses: string[];
  overdue: Array<{ id: string; name: string; what: string }>;
  /** Reviewed companies with a likely funding round or a share allotment. */
  funding: Array<{ id: string; name: string; what: string }>;
  conversations: number;
};

export function summaryPrompt(input: SummaryInput): string {
  const top = input.top.length
    ? input.top
        .map(
          (t) =>
            `- [${t.id}] ${t.name}, scored ${t.score}: ${t.summary}${t.whyNow ? ` Why now: ${t.whyNow}` : ""}${t.signals.length ? ` Signals: ${t.signals.join("; ")}.` : ""}`,
        )
        .join("\n")
    : "- None reviewed";
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- None");
  return `The ${input.runTime} run.
Score threshold: ${input.threshold}.
Companies fetched: ${input.counts.fetched}. New: ${input.counts.newTargets}. Reviewed: ${input.counts.reviewed}. Scored ${input.threshold} or more: ${input.counts.matches}.

Top new companies by score:
${top}

Warm intros:
${list(input.warmIntros)}

Shared registered addresses:
${list(input.sharedAddresses)}

Funding from filings:
${list(input.funding.map((o) => `[${o.id}] ${o.name}: ${o.what}`))}

Overdue filings:
${list(input.overdue.map((o) => `[${o.id}] ${o.name}: ${o.what}`))}

Conversations found: ${input.conversations}.

Write the summary.`;
}

// ---------------------------------------------------------------- Client analysis

export type ClientInput = {
  subject: ReviewSubject;
  website: string | null;
  /** The notes column from the upload, if one was mapped. */
  notes: string | null;
  signedOn: string | null;
  research: { notes: string; urls: string[] } | null;
};

export const clientSystem = (business: string | null) => `You analyse the current clients of ${firmIntro(business)}, so Sleuthhound can find companies like them.

Rules:
- Use only the data given and the research notes. Never invent facts.
- Companies House data is authoritative for dates, status, officers and industry.
- what_they_do: one plain sentence.
- segment: a short client type of one to three words that groups similar clients, such as "B2B SaaS", "Agency", "E-commerce", "Logistics", "Food and drink", "Consultancy". Reuse the same wording for the same kind of business.
- why_they_signed: one short sentence giving the likely reason a company like this hired an accountant at the stage it signed, such as "Outgrew a spreadsheet and a part-time bookkeeper" or "First accounts were due". If notes from the firm's team are given, base it on them. Otherwise infer it from the company's age, size, industry and deadlines, and keep it modest. State the reason itself: never mention the notes, the data you were given or your reasoning; the page already marks inferred reasons.
- sources: URLs you relied on, copied exactly from the research. At most 5.

Write in plain UK English, sentence case, no hype.`;

export function clientPrompt(input: ClientInput): string {
  const research = input.research
    ? `${input.research.notes.trim() || "Nothing useful found."}\nURLs found:\n${input.research.urls.map((u) => `- ${u}`).join("\n") || "- None"}`
    : "No web research.";
  return `The client:
${subjectText(input.subject)}
${input.website ? `Website: ${input.website}\n` : ""}${input.signedOn ? `Became a client: ${input.signedOn}\n` : ""}
Notes from the firm's team:
${input.notes?.trim() || "None"}

Web research notes:
${research}

Analyse this client.`;
}

// ---------------------------------------------------------------- Lookalikes

export type LookalikeInput = {
  client: string;
  segment: string | null;
  whatTheyDo: string | null;
  whySigned: string | null;
  /** Names to leave out: the firm's clients and companies already suggested. */
  exclude: string[];
  research: { notes: string; urls: string[] } | null;
};

export const lookalikeSystem = (business: string | null) => `You find new leads for ${firmIntro(business)}, by suggesting real companies like one of its clients.

Rules:
- Suggest only companies you have good reason to believe exist, are still trading and are registered in London. Never invent a company.
- Prefer young companies (under about three years old) at the stage the client was when it signed, and in the same kind of business. Leave out large or long-established firms, the client itself and any name on the exclude list.
- name: the company's registered name as it appears at Companies House, such as "Northwind Labs Ltd". If you only know a trading name, give that.
- reason: one short sentence on why it resembles the client, under 120 characters.
- Up to 5 companies. Fewer is fine; none is fine if nothing fits.

Write in plain UK English, sentence case, no hype.`;

export function lookalikeResearchPrompt(input: LookalikeInput, maxSearches: number): string {
  return `An existing client, ${input.client}${input.segment ? ` (${input.segment})` : ""}: ${input.whatTheyDo ?? "what they do is unknown"}.
Search the web, at most ${maxSearches} ${maxSearches === 1 ? "search" : "searches"}, for up to 5 young London companies in the same kind of business at a similar stage. For each, note its registered company name if you can find it, its website and why it's similar. Leave out: ${[input.client, ...input.exclude].join(", ")}.`;
}

export function lookalikePrompt(input: LookalikeInput): string {
  const research = input.research
    ? `${input.research.notes.trim() || "Nothing useful found."}\nURLs found:\n${input.research.urls.map((u) => `- ${u}`).join("\n") || "- None"}`
    : "No web research. Use only companies you're confident exist.";
  return `The client:
Name: ${input.client}
Type: ${input.segment ?? "unknown"}
What they do: ${input.whatTheyDo ?? "unknown"}
Why they became a client: ${input.whySigned ?? "unknown"}

Exclude: ${input.exclude.length ? input.exclude.join(", ") : "none"}

Web research notes:
${research}

Suggest London companies like this client.`;
}

// ---------------------------------------------------------------- Ideal client

export function idealClientPrompt(
  business: string | null,
  clients: Array<{ name: string; segment: string | null; whatTheyDo: string | null; whySigned: string | null; age: string | null }>,
): string {
  const list = clients
    .map((c) => `- ${c.name}${c.segment ? ` (${c.segment})` : ""}${c.age ? `, ${c.age} old` : ""}: ${c.whatTheyDo ?? "unknown"}. Signed because: ${c.whySigned ?? "unknown"}`)
    .join("\n");
  return `${business ?? "The firm"} is a UK accounting firm. Here are its current clients:

${list}

Write the description of its ideal client that Sleuthhound uses to score new leads. Under 60 words, two or three plain sentences in UK English. Say what stage and age of company, which kinds of business (name the client types that recur), and the signs they need an accountant now, such as a recent funding round, no in-house finance team, or a first deadline coming up. Describe what the clients have in common; don't name them. For example: "Seed to Series A UK startups under 3 years old, mostly B2B SaaS and agencies, with no in-house finance team. Often recently funded, with new shares allotted, and coming up to their first accounts."`;
}

// ---------------------------------------------------------------- Describe to scope

export function describePrompt(business: string | null, sourceLabel: string, fields: string, sentence: string, today: string): string {
  return `Today is ${today}. Someone is setting up the ${sourceLabel} source in Sleuthhound, a lead finder for ${firmIntro(business)}. They described what it should look for:

"${sentence}"

Turn that into the source's settings. The settings are:
${fields}

Fill in only the settings the description gives you a reason to set; leave the others null. Keywords are matched as exact words or phrases, so keep each to one to three words people would actually write, such as "accountant", "bookkeeping" or "limited company", and give at most eight. Words to exclude are words that mark a post as out of scope, such as "IRS" for US tax. For dates use YYYY-MM-DD.`;
}

// ---------------------------------------------------------------- CSV mapping

export function csvMappingPrompt(headers: string[], sample: Array<Record<string, string>>, fields: readonly string[], purpose: string): string {
  const rows = sample.map((r, i) => `Row ${i + 1}: ${headers.map((h) => `${h}=${JSON.stringify(r[h] ?? "")}`).join(", ")}`).join("\n");
  return `A spreadsheet is being imported into Sleuthhound as ${purpose === "clients" ? "the firm's current clients" : "a list of companies to consider as leads"}.

Columns: ${headers.map((h) => JSON.stringify(h)).join(", ")}
${rows}

Map each column to one of these Sleuthhound fields: ${fields.join(", ")}.
- Target name is the company's name. Company number is a UK Companies House number. Website is the company's site.
- Person name and Email are a contact at the company. Postcode and Address are where the company is.
- Date is the main date on the row (when they signed, or when you met them). Description is a short label for why the row is on the list. Notes is longer free text, such as sales notes.
- Use each field at most once, except Ignore. Use Ignore for anything else.
Give a confidence from 0 to 1 for each.`;
}
