// Why the GTM person discarded a lead. Shared by the toast, the Discarded tab
// and the review input, so it must not import anything server-only.

export const REASONS = ["not_trading", "too_small", "has_accountant", "wrong_industry", "other"] as const;
export type Reason = (typeof REASONS)[number];

/** Button labels, in key order 1 to 5. */
export const REASON_LABELS: Record<Reason, string> = {
  not_trading: "Not trading",
  too_small: "Too small",
  has_accountant: "Already has an accountant",
  wrong_industry: "Wrong industry",
  other: "Other",
};

// How each reads in the Discarded tab's counts line: "17 not trading".
const COUNT_PHRASES: Record<Reason, string> = {
  not_trading: "not trading",
  too_small: "too small",
  has_accountant: "already with an accountant",
  wrong_industry: "wrong industry",
  other: "other",
};

export const NOTE_MAX = 200;

/** The reason the number key picks, or null. Keys 1 to 5. */
export function reasonForKey(key: string): Reason | null {
  const i = Number(key) - 1;
  return Number.isInteger(i) && i >= 0 && i < REASONS.length ? REASONS[i] : null;
}

/** "38 discarded: 17 not trading, 9 too small, 6 with no reason". Zero counts are left out. */
export function discardCountsLine(reasons: Array<Reason | null>): string {
  const total = reasons.length;
  const parts: string[] = [];
  for (const r of REASONS) {
    const n = reasons.filter((x) => x === r).length;
    if (n > 0) parts.push(`${n} ${COUNT_PHRASES[r]}`);
  }
  const none = reasons.filter((x) => x === null).length;
  if (none > 0) parts.push(`${none} with no reason`);
  return parts.length ? `${total} discarded: ${parts.join(", ")}` : `${total} discarded`;
}

/** What the review input says for a discard: the label, then any note. */
export function reasonText(reason: Reason | null, note: string | null): string {
  if (!reason) return "no reason given";
  const label = REASON_LABELS[reason].toLowerCase();
  return note?.trim() ? `${label}: ${note.trim()}` : label;
}
