import type { WorkspaceItem } from "./types";

// The list filter, Filters menu and tabs of the New Companies workspace. Pure,
// so the table, map and deadlines all show exactly the same companies.

export type Tab = "new" | "kept" | "discarded" | "conversations";

export type DeadlineFilter = "any" | "overdue" | "soon";

export type Filters = {
  /** 70 or 80; null for Any. */
  minScore: number | null;
  deadline: DeadlineFilter;
  /** Only companies with a share allotment or likely funding round in the last 12 months. */
  raised: boolean;
  boroughs: string[];
};

export const DAY_MS = 86_400_000;
const SOON_MS = 92 * DAY_MS; // "Next 3 months"

export const NO_FILTERS: Filters = { minScore: null, deadline: "any", raised: false, boroughs: [] };

export function activeFilterCount(f: Filters): number {
  return (f.minScore !== null ? 1 : 0) + (f.deadline !== "any" ? 1 : 0) + (f.raised ? 1 : 0) + f.boroughs.length;
}

const YEAR_MS = 365 * DAY_MS;

/** A share allotment or likely funding round in the last 12 months. */
export function raisedMoney(item: WorkspaceItem, now = Date.now()): boolean {
  return item.raisedAt !== null && now - new Date(item.raisedAt).getTime() <= YEAR_MS;
}

/**
 * Undecided and scoring at the threshold, or with a post confirmed as theirs.
 * A company skipped since its review (now being struck off, say) drops out.
 */
export function isNew(item: WorkspaceItem, threshold: number): boolean {
  return item.decision === null && item.skipped === null && (item.score >= threshold || item.posts.length > 0);
}

export function inTab(item: WorkspaceItem, tab: Tab, threshold: number): boolean {
  if (tab === "new") return isNew(item, threshold);
  if (tab === "kept") return item.decision === "kept";
  if (tab === "discarded") return item.decision === "discarded";
  return false;
}

export function passesFilters(item: WorkspaceItem, f: Filters, now = Date.now()): boolean {
  if (f.minScore !== null && item.score < f.minScore) return false;
  if (f.boroughs.length > 0 && (!item.borough || !f.boroughs.includes(item.borough))) return false;
  if (f.deadline === "overdue" && !item.deadline?.overdue) return false;
  if (f.raised && !raisedMoney(item, now)) return false;
  if (f.deadline === "soon") {
    const d = item.deadline;
    if (!d || d.overdue) return false;
    const due = new Date(d.dueAt).getTime();
    if (due < now || due > now + SOON_MS) return false;
  }
  return true;
}

export function matchesQuery(item: WorkspaceItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.name,
    item.companyNumber,
    item.summary,
    item.whatTheyDo,
    item.whyFit,
    item.whyNow,
    item.borough,
    item.sector,
    ...item.directors.map((d) => d.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function byScore(a: WorkspaceItem, b: WorkspaceItem): number {
  return b.score - a.score || a.name.localeCompare(b.name);
}

/** The tab's companies before filters, sorted by score. */
export function tabItems(items: WorkspaceItem[], tab: Tab, threshold: number): WorkspaceItem[] {
  return items.filter((i) => inTab(i, tab, threshold)).sort(byScore);
}

/** What the table, map and deadlines show. */
export function visibleItems(
  items: WorkspaceItem[],
  tab: Tab,
  threshold: number,
  filters: Filters,
  query: string,
  now = Date.now(),
): WorkspaceItem[] {
  return tabItems(items, tab, threshold).filter((i) => passesFilters(i, filters, now) && matchesQuery(i, query));
}

/** Chip labels for the active filters, in the order of the menu. */
export function filterChips(f: Filters): Array<{ key: string; label: string }> {
  const chips: Array<{ key: string; label: string }> = [];
  if (f.minScore !== null) chips.push({ key: "score", label: `${f.minScore} and above` });
  if (f.deadline === "overdue") chips.push({ key: "deadline", label: "Overdue" });
  if (f.deadline === "soon") chips.push({ key: "deadline", label: "Due in the next 3 months" });
  if (f.raised) chips.push({ key: "raised", label: "Raised money" });
  for (const b of f.boroughs) chips.push({ key: `borough:${b}`, label: b });
  return chips;
}

export function removeChip(f: Filters, key: string): Filters {
  if (key === "score") return { ...f, minScore: null };
  if (key === "deadline") return { ...f, deadline: "any" };
  if (key === "raised") return { ...f, raised: false };
  if (key.startsWith("borough:")) {
    const b = key.slice("borough:".length);
    return { ...f, boroughs: f.boroughs.filter((x) => x !== b) };
  }
  return f;
}
