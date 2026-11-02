import { knownFormationAgent } from "@/lib/ontology/formation-agents";
import type { SignalDraft } from "@/lib/connectors/types";
import { companyPageUrl } from "./normalise";
import type { FilingHistoryItem } from "./types";

// Turns a company's filing history into signals: funding, activity and signs
// it has stopped. The core only sees the signals; filing types stay here.
//
// Checked on 20 October 2026 against real responses for 160 of our companies
// and against filing_history_descriptions.yml in Companies House's
// api-enumerations repository:
// - SH01 "capital-allotment-shares" carries description_values.date and
//   .capital, the statement of capital after the allotment (total nominal
//   capital, not the number of shares allotted).
// - New articles arrive as MA "memorandum-articles", or as RESOLUTIONS whose
//   resolutions[] include "resolution-adopt-articles" (RES01).
// - Share class changes: SH02 sub-division, SH08 class renamed, SH10 rights
//   varied, or a RESOLUTIONS entry in the "capital" category.
// - PSC02 carries psc_name. Notified at incorporation, it's a parent company,
//   not an investor, so it gets its own type and no funding weight.
// - GAZ1 (compulsory) and GAZ1(A) (voluntary) are first notices of strike-off;
//   a later DISS40 "gazette-filings-brought-up-to-date" means it was stopped.
//   DS01 is an application to strike off; a later DS02 withdraws it.
// - AA "accounts-with-accounts-type-dormant" carries made_up_date.

const DAY = 86_400_000;
/** Filings this soon after incorporation are the company being set up, not news. */
const SET_UP_DAYS = 14;
/** Allotments this soon after incorporation are the founders taking their shares, not a raise. */
export const FOUNDER_DAYS = 60;
const FUNDING_WINDOW_DAYS = 90;

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const day = (iso: string) => dayFmt.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)).replace("Sept", "Sep");
const month = (iso: string) => monthFmt.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)).replace("Sept", "Sep");
const daysBetween = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY;

/** The filing's own page on Companies House: its document. */
export function filingUrl(companyNumber: string, transactionId: string): string {
  return `${companyPageUrl(companyNumber)}/filing-history/${encodeURIComponent(transactionId)}/document?format=pdf&download=0`;
}

const POSTCODE = /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*(?:England|Wales|Scotland|United Kingdom|UK)?\s*$/i;
const postcodeOf = (address: string | undefined) => address?.match(POSTCODE)?.[1]?.toUpperCase().replace(/\s+/g, " ") ?? null;

/** "£200", or "USD 1,000" for other currencies. */
function capitalText(capital: NonNullable<FilingHistoryItem["description_values"]>["capital"]): string | null {
  const parts = (capital ?? [])
    .filter((c) => c.figure)
    .map((c) => {
      const n = Number(c.figure!.replace(/,/g, ""));
      const figure = Number.isFinite(n) ? n.toLocaleString("en-GB", { maximumFractionDigits: 4 }) : c.figure!;
      return c.currency === "GBP" || !c.currency ? `£${figure}` : `${c.currency} ${figure}`;
    });
  return parts.length ? parts.join(" and ") : null;
}

const when = (f: FilingHistoryItem) => f.action_date ?? f.description_values?.date ?? f.date ?? "";
const adoptsArticles = (f: FilingHistoryItem) =>
  f.type === "MA" || (f.resolutions ?? []).some((r) => r.description === "resolution-adopt-articles" || r.type === "RES01");
const changesShares = (f: FilingHistoryItem) =>
  ["SH02", "SH08", "SH10"].includes(f.type ?? "") || (f.type === "RESOLUTIONS" && (f.resolutions ?? []).some((r) => r.category === "capital"));

const RESTRUCTURE_TITLES: Record<string, string> = {
  SH02: "Shares subdivided",
  SH08: "Share classes renamed",
  SH10: "Share rights varied",
  RESOLUTIONS: "Share rights changed by resolution",
};

type Draft = SignalDraft & { externalId: string };

// A RESOLUTIONS filing can both adopt articles and change shares, so its two
// signals take a suffix to keep their IDs apart.
function draft(companyNumber: string, f: FilingHistoryItem, rest: Omit<Draft, "targetRef" | "externalId" | "url">, suffix = ""): Draft {
  return { targetRef: "company", externalId: `ch:filing:${f.transaction_id}${suffix}`, url: filingUrl(companyNumber, f.transaction_id), ...rest };
}

/** True when a later filing of one of these types follows the given date. */
const undoneLater = (items: FilingHistoryItem[], after: string, types: string[]) =>
  items.some((x) => types.includes(x.type ?? "") && (x.date ?? "") > after);

// The signals one filing gives: usually one, two for a RESOLUTIONS filing that
// adopts articles and changes shares, none for most filings.
function signalsOfFiling(f: FilingHistoryItem, items: FilingHistoryItem[], companyNumber: string, incorporatedOn: string | null): Draft[] {
  const at = when(f);
  if (!at) return [];
  const setUp = incorporatedOn !== null && daysBetween(at, incorporatedOn) <= SET_UP_DAYS;
  if (f.type === "RESOLUTIONS") {
    if (setUp) return [];
    const out: Draft[] = [];
    if (adoptsArticles(f)) out.push(draft(companyNumber, f, { type: "new_articles", title: `New articles adopted on ${day(at)}`, occurredAt: at, weight: "normal" }, ":articles"));
    if (changesShares(f)) out.push(draft(companyNumber, f, { type: "share_restructure", title: `${RESTRUCTURE_TITLES.RESOLUTIONS} on ${day(at)}`, occurredAt: at, weight: "normal" }, ":shares"));
    return out;
  }
  const one = filingSignal(f, items, companyNumber, incorporatedOn, at, setUp);
  return one ? [one] : [];
}

function filingSignal(
  f: FilingHistoryItem,
  items: FilingHistoryItem[],
  companyNumber: string,
  incorporatedOn: string | null,
  at: string,
  setUp: boolean,
): Draft | null {
  const v = f.description_values ?? {};

  if (f.type === "SH01") {
    const capital = capitalText(v.capital);
    // Shown in the panel, but never scored or taken as funding.
    if (incorporatedOn !== null && daysBetween(at, incorporatedOn) <= FOUNDER_DAYS) {
      return draft(companyNumber, f, {
        type: "founder_shares",
        title: `Founder shares allotted on ${day(at)}${capital ? `, capital now ${capital}` : ""}`,
        occurredAt: at,
        weight: "low",
        attributes: v.capital ? { capital: v.capital } : undefined,
      });
    }
    return draft(companyNumber, f, {
      type: "share_allotment",
      title: `Shares allotted on ${day(at)}${capital ? `, capital now ${capital}` : ""}`,
      occurredAt: at,
      weight: "high",
      attributes: v.capital ? { capital: v.capital } : undefined,
    });
  }
  if (changesShares(f) && !setUp) {
    return draft(companyNumber, f, { type: "share_restructure", title: `${RESTRUCTURE_TITLES[f.type!]} on ${day(at)}`, occurredAt: at, weight: "normal" });
  }
  if (adoptsArticles(f) && !setUp) {
    return draft(companyNumber, f, { type: "new_articles", title: `New articles adopted on ${day(at)}`, occurredAt: at, weight: "normal" });
  }
  if (f.type === "PSC02" && v.psc_name) {
    const notified = v.notification_date ?? at;
    if (incorporatedOn && daysBetween(notified, incorporatedOn) <= 30) {
      return draft(companyNumber, f, {
        type: "parent_company",
        title: `${v.psc_name} has controlled it since it was set up`,
        occurredAt: notified,
        weight: "low",
        attributes: { name: v.psc_name },
      });
    }
    return draft(companyNumber, f, {
      type: "corporate_shareholder",
      title: `${v.psc_name} became a shareholder with significant control`,
      occurredAt: notified,
      weight: "normal",
      attributes: { name: v.psc_name },
    });
  }
  if (f.type === "MR01") {
    const created = v.charge_creation_date ?? at;
    return draft(companyNumber, f, { type: "charge_registered", title: `Charge registered on ${day(created)}`, occurredAt: created, weight: "low" });
  }
  if (f.type === "AD01") {
    const from = postcodeOf(v.old_address);
    const to = postcodeOf(v.new_address);
    if (from && to && from === to) return null;
    return draft(companyNumber, f, {
      type: "office_moved",
      title: `Registered office moved on ${day(v.change_date ?? at)}`,
      occurredAt: v.change_date ?? at,
      weight: "low",
      attributes: { old_postcode: from, new_postcode: to, from_formation_agent: Boolean(knownFormationAgent(from)) },
    });
  }
  if (f.type === "AA" && f.description === "accounts-with-accounts-type-dormant") {
    const madeUp = v.made_up_date ?? at;
    return draft(companyNumber, f, { type: "dormant_accounts", title: `Dormant accounts filed for the year to ${day(madeUp)}`, occurredAt: madeUp, weight: "negative" });
  }
  if ((f.type === "GAZ1" || f.type === "GAZ1(A)") && !undoneLater(items, f.date ?? at, ["DISS40", "DISS16(SOAS)"])) {
    return draft(companyNumber, f, { type: "strike_off_notice", title: `Proposed for strike-off on ${day(f.date ?? at)}`, occurredAt: f.date ?? at, weight: "negative" });
  }
  if (f.type === "DS01" && !undoneLater(items, f.date ?? at, ["DS02"])) {
    return draft(companyNumber, f, { type: "strike_off_application", title: `Applied to be struck off on ${day(f.date ?? at)}`, occurredAt: f.date ?? at, weight: "negative" });
  }
  return null;
}

// What backs up an allotment as a funding round, and how it reads.
const SUPPORT: Record<string, string> = {
  new_articles: "new articles adopted",
  share_restructure: "share classes changed",
  corporate_shareholder: "a company became a major shareholder",
  new_director: "a new director joined",
};

type SignalLike = { type: string; occurredAt: string; title: string; url?: string | null; externalId?: string | null };

/**
 * One inferred funding round per allotment date that has an articles, share
 * class, corporate shareholder or new director signal within 90 days of it.
 * Its attributes list each signal it rests on, with links.
 */
export function fundingRounds(signals: SignalLike[]): Draft[] {
  const allotments = signals.filter((x) => x.type === "share_allotment").sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const out: Draft[] = [];
  const dates = new Set<string>();
  for (const a of allotments) {
    const date = a.occurredAt.slice(0, 10);
    if (dates.has(date)) continue;
    const support = signals.filter((x) => x.type in SUPPORT && daysBetween(x.occurredAt, a.occurredAt) <= FUNDING_WINDOW_DAYS);
    if (support.length === 0) continue;
    dates.add(date);
    const reasons = [...new Set(support.map((x) => SUPPORT[x.type]))];
    const basis = [a, ...support].map((x) => ({ title: x.title, url: x.url ?? null }));
    out.push({
      targetRef: "company",
      type: "funding_round",
      externalId: `ch:funding:${a.externalId ?? date}`,
      title: `Likely funding round, ${month(a.occurredAt)} (inferred): shares allotted, ${reasons.join(", ")}`,
      body: basis.map((b) => (b.url ? `${b.title}: ${b.url}` : b.title)).join("\n"),
      url: a.url ?? undefined,
      occurredAt: a.occurredAt,
      weight: "high",
      attributes: { inferred: true, basis },
    });
  }
  return out;
}

export type SkipReason = { reason: "not_active" | "strike_off" | "dormant"; text: string };

/** Why a company shouldn't be reviewed at all, or null. */
export function skipReason(status: string | null, signals: SignalLike[], items: FilingHistoryItem[]): SkipReason | null {
  if (status && !["active", "open"].includes(status)) return { reason: "not_active", text: `status is ${status.replace(/-/g, " ")}` };
  const notice = signals.find((x) => x.type === "strike_off_notice");
  const applied = signals.find((x) => x.type === "strike_off_application");
  const strike = notice ?? applied;
  if (strike) return { reason: "strike_off", text: strike.title.charAt(0).toLowerCase() + strike.title.slice(1) };
  const latestAccounts = items.filter((x) => x.type === "AA").sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
  if (latestAccounts?.description === "accounts-with-accounts-type-dormant") {
    const madeUp = latestAccounts.description_values?.made_up_date;
    return { reason: "dormant", text: `filed dormant accounts${madeUp ? ` for the year to ${day(madeUp)}` : ""}` };
  }
  return null;
}

/**
 * The signals in one page of filing history, plus any inferred funding rounds.
 * newDirectors: the company's new_director signals, which can back a round.
 * vehicle: a holding, property or head-office company (./vehicles.ts), whose
 * share issues are never read as funding, so it gets no allotments or rounds.
 */
export function filingSignals(
  items: FilingHistoryItem[],
  companyNumber: string,
  incorporatedOn: string | null,
  newDirectors: SignalLike[] = [],
  { vehicle = false }: { vehicle?: boolean } = {},
): Draft[] {
  const fromFilings = items
    .flatMap((f) => signalsOfFiling(f, items, companyNumber, incorporatedOn))
    .filter((x) => !(vehicle && x.type === "share_allotment"));
  return vehicle ? fromFilings : [...fromFilings, ...fundingRounds([...fromFilings, ...newDirectors])];
}
