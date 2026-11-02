// Picks which companies get an AI review when there are more candidates than
// the review cap. A cheap score from register data only: funding counts most (only in a matching industry), then industry,
// then timeliness and youth. A shell at a formation agent's address with
// overdue filings and no allotment loses points. Highest first; the newest signal breaks ties, then input order.

const DAY = 86_400_000;
const YEAR = 365 * DAY;

export type PreScoreInput = {
  sicCodes: string[];
  incorporatedOn: string | null;
  /** Earliest deadline still open. */
  nextDue: string | null;
  /** First accounts are overdue. */
  firstAccountsOverdue: boolean;
  /** Any filing is overdue: accounts or confirmation statement. */
  overdue: boolean;
  /** Latest likely funding round. */
  fundingAt: string | null;
  /** Latest share allotment. */
  allotmentAt: string | null;
  /** Latest corporate shareholder or new articles. */
  backingAt: string | null;
  /** Registered office moved away from a formation agent or shared address. */
  movedFromSharedAddress: boolean;
  /** Registered at a formation agent or an address 3 or more companies share. */
  sharedAddress: boolean;
  newestSignal: string | null;
};

export function matchesIndustry(sicCodes: string[], prefixes: string[]): boolean {
  return sicCodes.some((code) => prefixes.some((p) => code.startsWith(p)));
}

const within = (iso: string | null, ms: number, now: Date) => iso !== null && now.getTime() - new Date(iso).getTime() <= ms;

export function preScore(c: PreScoreInput, prefixes: string[], now = new Date()): number {
  let score = 0;
  const industry = matchesIndustry(c.sicCodes, prefixes);
  if (industry) score += 2;

  // Funding only counts for a company in the ideal client's industries: a
  // share issue elsewhere (a fund, a group restructure) isn't a lead's raise.
  if (industry) {
    if (within(c.fundingAt, YEAR, now)) score += 4;
    else if (within(c.allotmentAt, YEAR, now)) score += 3;
    if (within(c.backingAt, YEAR, now)) score += 1;
  }

  const dueSoon = c.nextDue !== null && new Date(c.nextDue).getTime() - now.getTime() <= 90 * DAY && new Date(c.nextDue) >= now;
  if (dueSoon || c.firstAccountsOverdue) score += 1;

  if (c.incorporatedOn) {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - 24);
    if (new Date(c.incorporatedOn) > cutoff) score += 1;
  }

  if (c.movedFromSharedAddress) score += 1;
  // Any allotment on record, however old, is a sign it's more than a shell.
  if (c.sharedAddress && c.overdue && c.allotmentAt === null && c.fundingAt === null) score -= 2;
  return score;
}

/** Highest pre-score first, then newest signal. Stable for equal items. */
export function rankByPreScore<T extends PreScoreInput>(items: T[], prefixes: string[], now = new Date()): T[] {
  return items
    .map((item, i) => ({ item, i, score: preScore(item, prefixes, now) }))
    .sort((a, b) => b.score - a.score || (b.item.newestSignal ?? "").localeCompare(a.item.newestSignal ?? "") || a.i - b.i)
    .map((x) => x.item);
}
