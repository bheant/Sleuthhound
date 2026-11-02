import type { UniverseSegment } from "@/lib/clients/types";

// The client universe radar, clustered: one box per client type around the
// ideal client, sized by the square root of its client count. Only the
// selected type's leads are placed, inside its sector: distance from the
// centre is (100 − score) scaled so 60 sits on the outer ring, and leads are
// spread evenly across the sector in a fixed order. Coordinates are in a
// 1344 × 600 space the component scales.

export const UW = 1344;
export const UH = 600;
export const UCX = 672;
export const UCY = 300;
/** Score 60 sits on this ring; 90 at a quarter of it. */
export const RING = 220;
/** The dashed edge of the radar: anything scoring lower stops here. */
export const EDGE = 268;
const BOX_RING = EDGE + 34;
const MIN_BOX = 28;
const BOX_GROWTH = 22;
const MARGIN = 56;
const MAX_LABELLED = 6;

export type UniverseBox = {
  name: string;
  x: number;
  y: number;
  size: number;
  clients: number;
  leads: number;
  today: number;
  selected: boolean;
  /** Its label sits above the box on the top half, below on the bottom. */
  labelAbove: boolean;
};

export type UniverseDot = { id: string; name: string; score: number; x: number; y: number; today: boolean; labelled: boolean };

export type UniverseLayout = { boxes: UniverseBox[]; dots: UniverseDot[] };

const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Distance from the centre for a score: 100 at the centre, 60 on the outer ring. */
export function radiusFor(score: number): number {
  return Math.min(EDGE, (Math.max(0, 100 - score) / 40) * RING);
}

/** The middle of each type's sector, starting top left as in the design. */
export function sectorMids(n: number): number[] {
  return Array.from({ length: n }, (_, i) => -135 + (i * 360) / n);
}

// A stable order that doesn't follow the score, so the leads don't spiral.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** B2B SaaS if there is such a type, else the one with most clients. */
export function defaultSegment(segments: UniverseSegment[]): string | null {
  return segments.find((s) => /saas/i.test(s.name))?.name ?? segments[0]?.name ?? null;
}

export function layoutUniverse(segments: UniverseSegment[], selected: string | null): UniverseLayout {
  const mids = sectorMids(segments.length);
  const most = Math.max(1, ...segments.map((s) => s.clients.length));
  const half = Math.min(38, 180 / Math.max(1, segments.length) - 7);
  const boxes: UniverseBox[] = [];
  const dots: UniverseDot[] = [];

  segments.forEach((seg, i) => {
    const mid = mids[i];
    const size = Math.round(MIN_BOX + BOX_GROWTH * Math.sqrt(seg.clients.length / most));
    const x = clamp(UCX + BOX_RING * Math.cos(rad(mid)), MARGIN, UW - MARGIN);
    const y = clamp(UCY + BOX_RING * Math.sin(rad(mid)), MARGIN, UH - MARGIN);
    const isSel = seg.name === selected;
    boxes.push({
      name: seg.name,
      x,
      y,
      size,
      clients: seg.clients.length,
      leads: seg.leads.length,
      today: seg.leads.filter((l) => l.today).length,
      selected: isSel,
      labelAbove: y < UCY,
    });
    if (!isSel) return;
    const scored = seg.leads.filter((l): l is typeof l & { score: number } => l.score !== null).sort((a, b) => hash(a.id) - hash(b.id));
    const todayCount = scored.filter((l) => l.today).length;
    scored.forEach((lead, j) => {
      const angle = mid - half + ((j + 0.5) / scored.length) * half * 2;
      const r = radiusFor(lead.score);
      dots.push({
        id: lead.id,
        name: lead.name,
        score: lead.score,
        x: UCX + r * Math.cos(rad(angle)),
        y: UCY + r * Math.sin(rad(angle)),
        today: lead.today,
        labelled: lead.today && todayCount <= MAX_LABELLED,
      });
    });
  });
  // Today's leads draw on top of the earlier ones.
  dots.sort((a, b) => Number(a.today) - Number(b.today));
  return { boxes, dots };
}
