// Turns a stored run summary into paragraphs whose company names are links.
// The summary is plain text; the run keeps the IDs of the companies it names
// (runs.summary_highlights), so each name is found in the text and linked to
// its company. Pure, so it can be tested without a database.

export type Entity = { id: string; name: string };
export type Segment = string | { id: string; text: string };

const SUFFIX = /\s+(ltd\.?|limited|llp|plc)$/i;

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The first whole-word match of the name, trying it without "Ltd" or
// "Limited" when the summary leaves that off.
function findName(text: string, name: string): { index: number; length: number } | null {
  const variants = [name.trim()];
  const short = name.trim().replace(SUFFIX, "");
  if (short !== variants[0] && short.length >= 3) variants.push(short);
  for (const v of variants) {
    const m = new RegExp(`(^|[^\\p{L}\\p{N}])(${escape(v)})(?![\\p{L}\\p{N}])`, "iu").exec(text);
    if (m) return { index: m.index + m[1].length, length: m[2].length };
  }
  return null;
}

/** Splits one paragraph into text and links, linking each entity's first mention. */
export function linkSegments(text: string, entities: Entity[]): Segment[] {
  const found: Array<{ index: number; length: number; id: string }> = [];
  // Longer names first, so "Lumen Data Labs" wins over "Lumen Data".
  for (const e of [...entities].sort((a, b) => b.name.length - a.name.length)) {
    const hit = findName(text, e.name);
    if (!hit) continue;
    const overlaps = found.some((f) => hit.index < f.index + f.length && f.index < hit.index + hit.length);
    if (!overlaps) found.push({ ...hit, id: e.id });
  }
  found.sort((a, b) => a.index - b.index);

  const out: Segment[] = [];
  let at = 0;
  for (const f of found) {
    if (f.index > at) out.push(text.slice(at, f.index));
    out.push({ id: f.id, text: text.slice(f.index, f.index + f.length) });
    at = f.index + f.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** Paragraphs of the summary, each split into text and links. Each entity is linked once. */
export function summaryParagraphs(summary: string, entities: Entity[]): Segment[][] {
  const linked = new Set<string>();
  return summary
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((p) => {
      const segments = linkSegments(
        p,
        entities.filter((e) => !linked.has(e.id)),
      );
      for (const s of segments) if (typeof s !== "string") linked.add(s.id);
      return segments;
    });
}
