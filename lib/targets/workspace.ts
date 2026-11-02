import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { emailOf } from "@/lib/apps/people";
import { isCorporateBody } from "@/lib/connectors/companies-house/company-types";
import { companyPageUrl } from "@/lib/connectors/companies-house/normalise";
import { credentialViews } from "@/lib/credentials/store";
import { db, schema } from "@/lib/db";
import type { Json } from "@/lib/db/schema";
import { formatDate } from "@/lib/format/time";
import { knownFormationAgent } from "@/lib/ontology/formation-agents";
import { domainOf, formatPostcode } from "@/lib/ontology/names";
import type { RunCounts } from "@/lib/pipeline/context";
import { nextScheduledRun } from "@/lib/runs/status";
import { getSetting } from "@/lib/settings";
import { conversationItems, postsFor } from "./conversations";
import type { Reason } from "./reasons";
import { tradingOf } from "./trading";
import { industryLines, sectorOf, shortName } from "./format";
import type { AppsConnected, Deadline, Decision, Link, Network, RunFigures, WorkspaceItem } from "./types";

// Everything the New Companies workspace shows: every reviewed company that is
// undecided and scores at or above the threshold, plus every decided one, each
// with its current review, place, directors, deadlines and sources.

const t = schema.targets;
const r = schema.reviews;
const p = schema.places;
const s = schema.signals;
const d = schema.decisions;
const l = schema.links;

// Addresses shared by this many companies or more read as a service address.
const SHARED_ADDRESS = 3;

export const PROVIDER_NAMES: Record<string, string> = { anthropic: "Claude", openai: "ChatGPT", xai: "Grok" };

type Row = {
  id: string;
  name: string;
  companyNumber: string | null;
  url: string | null;
  incorporatedOn: string | null;
  sicCodes: string[] | null;
  profile: Json | null;
  companyType: string | null;
  attributes: Json | null;
  placeId: string | null;
  isDemo: number;
  score: number;
  summary: string;
  whatTheyDo: string | null;
  whyFit: string | null;
  whyNow: string | null;
  sources: string[];
  provider: string;
  reviewedAt: string;
  runId: string | null;
  postcode: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  borough: string | null;
};

const rowColumns = {
  id: t.id,
  name: t.name,
  companyNumber: t.companyNumber,
  url: t.url,
  incorporatedOn: t.incorporatedOn,
  sicCodes: t.sicCodes,
  profile: t.profile,
  companyType: t.companyType,
  attributes: t.attributes,
  placeId: t.placeId,
  isDemo: t.isDemo,
  postcode: p.postcode,
  address: p.address,
  lat: p.lat,
  lng: p.lng,
  borough: p.borough,
};

// Companies skipped before review (being struck off, dormant): only shown when
// opened from search, with why they weren't reviewed in place of a review.
function skippedCompanies(workspaceId: string, ids: string[]): Row[] {
  if (ids.length === 0) return [];
  return db
    .select(rowColumns)
    .from(t)
    .leftJoin(p, eq(p.id, t.placeId))
    .where(and(eq(t.workspaceId, workspaceId), inArray(t.id, ids), sql`json_extract(${t.attributes}, '$.skipped') is not null`))
    .all()
    .map((row) => ({
      ...row,
      score: 0,
      summary: "",
      whatTheyDo: null,
      whyFit: null,
      whyNow: null,
      sources: [],
      provider: "",
      reviewedAt: "",
      runId: null,
    }));
}

function reviewedCompanies(workspaceId: string): Row[] {
  return db
    .select({
      ...rowColumns,
      score: r.score,
      summary: r.summary,
      whatTheyDo: r.whatTheyDo,
      whyFit: r.whyFit,
      whyNow: r.whyNow,
      sources: r.sources,
      provider: r.provider,
      reviewedAt: r.reviewedAt,
      runId: r.runId,
    })
    .from(r)
    .innerJoin(t, eq(t.id, r.targetId))
    .leftJoin(p, eq(p.id, t.placeId))
    .where(
      and(
        eq(t.workspaceId, workspaceId),
        eq(t.kind, "company"),
        eq(t.isClient, 0),
        sql`${r.reviewedAt} = (select max(r2.reviewed_at) from ${r} r2 where r2.target_id = ${t.id})`,
      ),
    )
    .all();
}

/** The current decision per target: the latest one, unless it was undone. */
type CurrentDecision = { decision: Decision; decidedAt: string; reason: Reason | null; note: string | null };

export function currentDecisions(ids: string[]): Map<string, CurrentDecision> {
  const out = new Map<string, CurrentDecision>();
  if (ids.length === 0) return out;
  const rows = db
    .select({ targetId: d.targetId, decision: d.decision, decidedAt: d.decidedAt, undoneAt: d.undoneAt, reason: d.reason, note: d.note })
    .from(d)
    .where(inArray(d.targetId, ids))
    .orderBy(desc(d.decidedAt))
    .all();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.targetId)) continue;
    seen.add(row.targetId);
    if (!row.undoneAt) out.set(row.targetId, { decision: row.decision, decidedAt: row.decidedAt, reason: row.reason, note: row.note });
  }
  return out;
}

type SignalRow = {
  targetId: string | null;
  type: string;
  title: string;
  dueAt: string | null;
  occurredAt: string | null;
  url: string | null;
  weight: string;
  attributes: Json | null;
};

// Signals read from filing history, shown in the panel's Filings list.
const FILING_TYPES = new Set([
  "funding_round",
  "share_allotment",
  "founder_shares",
  "new_articles",
  "share_restructure",
  "corporate_shareholder",
  "parent_company",
  "charge_registered",
  "office_moved",
  "dormant_accounts",
  "strike_off_notice",
  "strike_off_application",
]);

function filingsOf(signals: SignalRow[]): WorkspaceItem["filings"] {
  return signals
    .filter((x) => FILING_TYPES.has(x.type) && x.occurredAt)
    .sort((a, b) => b.occurredAt!.localeCompare(a.occurredAt!))
    .map((x) => {
      const basis = Array.isArray(x.attributes?.basis) ? (x.attributes.basis as Array<{ title: string; url: string | null }>) : [];
      return {
        type: x.type,
        title: x.title,
        occurredAt: x.occurredAt!,
        url: x.url,
        negative: x.weight === "negative",
        inferred: x.attributes?.inferred === true,
        basis: basis.slice(1),
      };
    });
}

/** The latest share allotment or likely funding round, for the Raised money filter. */
function raisedAtOf(signals: SignalRow[]): string | null {
  return signals
    .filter((x) => (x.type === "share_allotment" || x.type === "funding_round") && x.occurredAt)
    .map((x) => x.occurredAt!)
    .sort()
    .at(-1) ?? null;
}

function signalsFor(ids: string[]): Map<string, SignalRow[]> {
  const out = new Map<string, SignalRow[]>();
  if (ids.length === 0) return out;
  const rows = db
    .select({ targetId: s.targetId, type: s.type, title: s.title, dueAt: s.dueAt, occurredAt: s.occurredAt, url: s.url, weight: s.weight, attributes: s.attributes })
    .from(s)
    .where(inArray(s.targetId, ids))
    .all();
  for (const row of rows) {
    const list = out.get(row.targetId!) ?? [];
    list.push(row);
    out.set(row.targetId!, list);
  }
  return out;
}

type Officer = { id: string; name: string; role: string; email: WorkspaceItem["directors"][number]["email"] };

function directorsFor(ids: string[]): Map<string, Officer[]> {
  const out = new Map<string, Officer[]>();
  if (ids.length === 0) return out;
  const pe = schema.people;
  const rows = db
    .select({ targetId: l.toId, id: pe.id, name: pe.name, attributes: l.attributes, person: pe.attributes })
    .from(l)
    .innerJoin(pe, eq(pe.id, l.fromId))
    .where(and(eq(l.kind, "directs"), eq(l.fromType, "person"), inArray(l.toId, ids)))
    .all();
  for (const row of rows) {
    const list = out.get(row.targetId) ?? [];
    const email = emailOf(row.person);
    list.push({
      id: row.id,
      name: row.name,
      role: String(row.attributes?.role ?? "officer"),
      email: email ? { address: email.address, source: email.source, foundOn: email.foundOn } : null,
    });
    out.set(row.targetId, list);
  }
  return out;
}

/** Clients each target resembles: "Similar to Acme Analytics". */
function resemblesFor(ids: string[]): Map<string, Array<{ id: string; name: string }>> {
  const out = new Map<string, Array<{ id: string; name: string }>>();
  if (ids.length === 0) return out;
  const rows = db
    .select({ fromId: l.fromId, id: t.id, name: t.name })
    .from(l)
    .innerJoin(t, eq(t.id, l.toId))
    .where(and(eq(l.kind, "resembles"), eq(l.fromType, "target"), inArray(l.fromId, ids), eq(t.isClient, 1)))
    .all();
  for (const row of rows) {
    const list = out.get(row.fromId) ?? [];
    if (!list.some((x) => x.id === row.id)) list.push({ id: row.id, name: row.name });
    out.set(row.fromId, list);
  }
  return out;
}

// Every company directed by someone who directs a listed company, so the
// Connections graph can show the second hop: other leads, and clients.
function networkOf(personIds: string[]): Network {
  const out: Network = {};
  const ids = [...new Set(personIds)];
  for (let i = 0; i < ids.length; i += 500) {
    const rows = db
      .select({ personId: l.fromId, id: t.id, name: t.name, isClient: t.isClient })
      .from(l)
      .innerJoin(t, eq(t.id, l.toId))
      .where(and(eq(l.kind, "directs"), eq(l.fromType, "person"), eq(l.toType, "target"), inArray(l.fromId, ids.slice(i, i + 500))))
      .all();
    for (const row of rows) {
      const list = (out[row.personId] ??= []);
      if (!list.some((x) => x.id === row.id)) list.push({ id: row.id, name: row.name, isClient: row.isClient === 1 });
    }
  }
  return out;
}

function companiesPerPlace(workspaceId: string): Map<string, number> {
  const rows = db
    .select({ placeId: t.placeId, n: sql<number>`count(*)` })
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), sql`${t.placeId} is not null`))
    .groupBy(t.placeId)
    .all();
  return new Map(rows.map((row) => [row.placeId!, row.n]));
}

const isOverdueType = (type: string) => type.endsWith("_overdue");

// One deadline per company: the earliest overdue filing, else the next one due.
function deadlineOf(signals: SignalRow[], now: number): Deadline | null {
  const dated = signals.filter((x) => x.dueAt);
  const overdue = dated
    .filter((x) => isOverdueType(x.type) || new Date(x.dueAt!).getTime() < now)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  if (overdue[0]) {
    const o = overdue[0];
    const label = isOverdueType(o.type) ? o.title : `${o.title.replace(/ due$/, "")} overdue`;
    return { dueAt: o.dueAt!, label, overdue: true };
  }
  const next = dated.sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
  return next ? { dueAt: next.dueAt!, label: next.title, overdue: false } : null;
}

const TAGS: Record<string, { text: string; overdue: boolean }> = {
  funding_round: { text: "Likely funding round", overdue: false },
  share_allotment: { text: "Shares allotted", overdue: false },
  first_accounts_due: { text: "First accounts due", overdue: false },
  accounts_overdue: { text: "Accounts overdue", overdue: true },
  confirmation_overdue: { text: "Confirmation overdue", overdue: true },
  new_director: { text: "New director", overdue: false },
};

function tagsOf(signals: SignalRow[], resembles: Array<{ name: string }>): WorkspaceItem["tags"] {
  const tags: WorkspaceItem["tags"] = [];
  for (const type of Object.keys(TAGS)) {
    if (signals.some((x) => x.type === type)) tags.push(TAGS[type]);
  }
  // First accounts that are overdue read as overdue, not as due; a funding
  // round already says shares were allotted.
  const filtered = tags.filter(
    (x) =>
      !(x.text === "First accounts due" && tags.some((y) => y.text === "Accounts overdue")) &&
      !(x.text === "Shares allotted" && tags.some((y) => y.text === "Likely funding round")),
  );
  return [...filtered, ...resembles.map(({ name }) => ({ text: `Similar to ${shortName(name)}`, overdue: false }))];
}

type Filing = { next_due?: string; overdue?: boolean };

function accountsDue(profile: Json | null): WorkspaceItem["accountsDue"] {
  const a = profile?.accounts as Filing | undefined;
  if (!a?.next_due) return null;
  return a.overdue
    ? { text: `Overdue since ${formatDate(a.next_due)}`, overdue: true }
    : { text: formatDate(a.next_due), overdue: false };
}

function confirmation(profile: Json | null): WorkspaceItem["confirmation"] {
  if (!profile?.enriched_at) return null;
  const cs = profile.confirmation_statement as Filing | undefined;
  if (!cs?.next_due) return null;
  return cs.overdue
    ? { text: `Overdue since ${formatDate(cs.next_due)}`, overdue: true }
    : { text: `Up to date, next due ${formatDate(cs.next_due)}`, overdue: false };
}

function registeredOffice(row: Row, sharedBy: number): string | null {
  if (!row.address) return null;
  const postcode = formatPostcode(row.postcode);
  const agent = knownFormationAgent(row.postcode);
  if (agent) return `${agent}${postcode ? `, ${postcode}` : ""} (formation agent)`;
  if (sharedBy >= SHARED_ADDRESS) return `${row.address}, shared by ${sharedBy} companies`;
  return row.address;
}

function sourceLabel(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    if (!path) return host;
    const full = `${host}${path}`;
    return full.length > 44 ? `${full.slice(0, 43)}…` : full;
  } catch {
    return url;
  }
}

function sourcesOf(row: Row): Link[] {
  const links: Link[] = [];
  const seen = new Set<string>();
  const add = (label: string, url: string) => {
    const key = url.replace(/\/$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ label, url });
  };
  if (row.url) add(domainOf(row.url) ?? sourceLabel(row.url), row.url);
  if (row.companyNumber) add("Companies House record", companyPageUrl(row.companyNumber));
  for (const url of row.sources ?? []) {
    // The bare register page is already listed as the Companies House record.
    if (row.companyNumber && url.replace(/\/$/, "") === companyPageUrl(row.companyNumber)) continue;
    add(sourceLabel(url), url);
  }
  return links;
}

/** includeSkipped: skipped companies to add, such as one opened from search. */
export function workspaceItems(workspaceId: string, threshold: number, now = Date.now(), includeSkipped: string[] = []): WorkspaceItem[] {
  const rows = reviewedCompanies(workspaceId);
  const decisions = currentDecisions(rows.map((row) => row.id));
  const posts = postsFor(rows.map((row) => row.id));
  const kept = [
    ...rows.filter((row) => decisions.has(row.id) || row.score >= threshold || posts.has(row.id) || includeSkipped.includes(row.id)),
    ...skippedCompanies(workspaceId, includeSkipped.filter((id) => !rows.some((r) => r.id === id))),
  ];
  const ids = kept.map((row) => row.id);
  const signals = signalsFor(ids);
  const directors = directorsFor(ids);
  const resembles = resemblesFor(ids);
  const perPlace = companiesPerPlace(workspaceId);

  return kept.map((row) => {
    const sig = signals.get(row.id) ?? [];
    const officers = directors.get(row.id) ?? [];
    const named = officers.filter((o) => o.role.includes("director"));
    const decision = decisions.get(row.id) ?? null;
    return {
      id: row.id,
      name: row.name,
      companyNumber: row.companyNumber,
      score: row.score,
      summary: row.summary,
      whatTheyDo: row.whatTheyDo,
      whyFit: row.whyFit,
      whyNow: row.whyNow,
      sector: sectorOf(row.sicCodes),
      incorporatedOn: row.incorporatedOn,
      borough: row.borough,
      postcode: formatPostcode(row.postcode),
      lat: row.lat,
      lng: row.lng,
      placeId: row.placeId,
      addressLine: row.address?.split(",")[0]?.trim() ?? null,
      registeredOffice: registeredOffice(row, row.placeId ? (perPlace.get(row.placeId) ?? 0) : 0),
      industries: industryLines(row.sicCodes),
      accountsDue: accountsDue(row.profile),
      confirmation: confirmation(row.profile),
      directors: (named.length > 0 ? named : officers).map(({ id, name, email }) => ({ id, name, email })),
      corporate: isCorporateBody(row.companyType),
      hubspotSentAt: typeof row.attributes?.hubspot_sent_at === "string" ? row.attributes.hubspot_sent_at : null,
      resembles: resembles.get(row.id) ?? [],
      placeCount: row.placeId ? (perPlace.get(row.placeId) ?? 1) : 0,
      tags: tagsOf(sig, resembles.get(row.id) ?? []),
      filings: filingsOf(sig),
      raisedAt: raisedAtOf(sig),
      skipped: skippedText(row.attributes),
      trading: tradingView(row.attributes),
      deadline: deadlineOf(sig, now),
      posts: posts.get(row.id) ?? [],
      sources: sourcesOf(row),
      reviewedBy: PROVIDER_NAMES[row.provider] ?? row.provider,
      reviewedAt: row.reviewedAt,
      runId: row.runId,
      decision: decision?.decision ?? null,
      decidedAt: decision?.decidedAt ?? null,
      reason: decision?.reason ?? null,
      reasonNote: decision?.note ?? null,
      isDemo: row.isDemo === 1,
    };
  });
}

// The run figures beside the lede: the last finished run, averages over the
// last ten, and the next scheduled run.
export function runFigures(workspaceId: string): RunFigures {
  const ru = schema.runs;
  const recent = db
    .select({ id: ru.id, startedAt: ru.startedAt, counts: ru.counts })
    .from(ru)
    .where(and(eq(ru.workspaceId, workspaceId), eq(ru.status, "done")))
    .orderBy(desc(ru.finishedAt))
    .limit(10)
    .all();
  const counts = recent.map((x) => (x.counts ?? {}) as Partial<RunCounts>);
  const avg = (key: "scanned" | "matches") =>
    counts.length ? Math.round(counts.reduce((sum, c) => sum + (c[key] ?? 0), 0) / counts.length) : null;
  return {
    lastRunAt: recent[0]?.startedAt ?? null,
    lastRunId: recent[0]?.id ?? null,
    scannedPerRun: avg("scanned"),
    matchesPerRun: avg("matches"),
    nextRunAt: nextScheduledRun(workspaceId),
  };
}

/** Which optional apps the panel offers: Find email and Send to HubSpot. */
function appsConnected(workspaceId: string): AppsConnected {
  const views = credentialViews(workspaceId);
  const on = (service: string) => views.some((v) => v.service === service && v.status === "connected");
  return { apollo: on("apollo"), hubspot: on("hubspot") };
}

/** Everything the New Companies page renders, read at one moment. */
function tradingView(attributes: Json | null): WorkspaceItem["trading"] {
  const v = tradingOf(attributes);
  if (!v) return null;
  return { trading: v.trading, evidence: v.evidence, sources: v.sources.map((url) => ({ label: sourceLabel(url), url })), by: v.by, checkedAt: v.checked_at };
}

function skippedText(attributes: Json | null): string | null {
  const skipped = attributes?.skipped as { text?: unknown } | undefined;
  return typeof skipped?.text === "string" ? skipped.text : null;
}

/** focusId: a company opened from search, shown even when it was skipped. */
export function companiesPageData(workspaceId: string, focusId: string | null = null) {
  const threshold = getSetting(workspaceId, "score_threshold");
  const nowMs = Date.now();
  const items = workspaceItems(workspaceId, threshold, nowMs, focusId ? [focusId] : []);
  return {
    items,
    network: networkOf(items.flatMap((i) => i.directors.map((d) => d.id))),
    figures: runFigures(workspaceId),
    threshold,
    conversations: conversationItems(workspaceId),
    apps: appsConnected(workspaceId),
    nowMs,
  };
}
