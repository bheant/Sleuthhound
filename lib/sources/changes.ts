import type { ScopeFieldSpec } from "@/lib/connectors/types";

// One line saying what changed between two saved versions of a source, for
// the history in the source detail panel. Pure, so it's unit tested.

type Config = {
  scope?: unknown;
  schedule?: string;
  max_items?: number;
  spend_cap_gbp?: number | null;
  weight?: string;
  mapping?: unknown;
};

const SCHEDULE: Record<string, string> = { hourly: "hourly", every_6_hours: "every 6 hours", daily: "daily" };

const quote = (s: string) => `“${s}”`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function listText(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function show(field: ScopeFieldSpec | undefined, value: unknown): string {
  if (typeof value === "boolean") return value ? "on" : "off";
  const option = field?.options?.find((o) => o.value === value);
  return option ? option.label : String(value ?? "none");
}

function scopeChanges(prev: Record<string, unknown>, next: Record<string, unknown>, fields: ScopeFieldSpec[]): string[] {
  const out: string[] = [];
  const keys = [...new Set([...Object.keys(prev), ...Object.keys(next)])];
  for (const key of keys) {
    const field = fields.find((f) => f.key === key);
    const label = lower(field?.label ?? key);
    const a = prev[key];
    const b = next[key];
    if (Array.isArray(a) || Array.isArray(b)) {
      const before = (Array.isArray(a) ? a : []).map(String);
      const after = (Array.isArray(b) ? b : []).map(String);
      const added = after.filter((x) => !before.includes(x));
      const removed = before.filter((x) => !after.includes(x));
      if (added.length) out.push(`Added ${listText(added.map(quote))} to ${label}`);
      if (removed.length) out.push(`Removed ${listText(removed.map(quote))} from ${label}`);
      continue;
    }
    if (a === b) continue;
    if (field?.input === "toggle") out.push(`Turned ${lower(field.label)} ${b ? "on" : "off"}`);
    else out.push(`${field?.label ?? key} changed from ${show(field, a)} to ${show(field, b)}`);
  }
  return out;
}

export function describeChange(prev: Config | null, next: Config, fields: ScopeFieldSpec[]): string {
  if (!prev) return "Source added";
  const out = scopeChanges(
    (prev.scope ?? {}) as Record<string, unknown>,
    (next.scope ?? {}) as Record<string, unknown>,
    fields,
  );
  if (prev.schedule !== next.schedule && next.schedule) {
    out.push(`Schedule changed from ${SCHEDULE[prev.schedule ?? ""] ?? prev.schedule} to ${SCHEDULE[next.schedule] ?? next.schedule}`);
  }
  if (prev.max_items !== next.max_items) out.push(`Maximum items changed from ${prev.max_items} to ${next.max_items}`);
  if ((prev.spend_cap_gbp ?? null) !== (next.spend_cap_gbp ?? null)) {
    out.push(next.spend_cap_gbp == null ? "Spend cap removed" : `Spend cap changed to £${next.spend_cap_gbp}`);
  }
  if (prev.weight !== next.weight) out.push(`Signal weight changed to ${next.weight}`);
  if (JSON.stringify(prev.mapping ?? null) !== JSON.stringify(next.mapping ?? null)) out.push("Field mapping changed");
  if (out.length === 0) return "Saved with no changes";
  if (out.length <= 2) return out.join("; ");
  return `${out.slice(0, 2).join("; ")}, and ${out.length - 2} more ${out.length - 2 === 1 ? "change" : "changes"}`;
}
