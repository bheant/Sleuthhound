// Marker and label layout for LondonMap, in plate pixels. Pure, so the label
// rule can be tested: labels never overlap a marker, the map furniture or each
// other. Labels are placed in priority order (the selected company's name, then
// relationship labels, then other names by score, then boroughs) and a label
// that can't fit is dropped. Dropped company names still show on hover.

export type Box = { x: number; y: number; w: number; h: number };

export type MapPoint = {
  id: string;
  x: number;
  y: number;
  score: number;
  /** Short name, "Northwind Labs". */
  label: string;
  placeId: string | null;
  addressLine: string | null;
};

export type Marker = {
  key: string;
  x: number;
  y: number;
  /** Half the marker's size: 5 for one company, 8 for several. */
  half: number;
  members: MapPoint[];
  label: string;
  /** Where the label sits; null only when the plate is too small for it anywhere. */
  labelBox: Box | null;
  /** False when the label was dropped: it then shows on hover only. */
  shown: boolean;
};

export type RelationLine = { toKey: string; x1: number; y1: number; x2: number; y2: number; label: string; labelBox: Box | null };

export type BoroughLabel = { name: string; box: Box };

export type LayoutInput = {
  w: number;
  h: number;
  points: MapPoint[];
  selectedId: string | null;
  /** Companies linked to the selected one, with the reason. */
  relations: Array<{ toId: string; label: string }>;
  boroughs: Array<{ name: string; x: number; y: number }>;
  /** Legend, compass and coordinates: nothing may cover them. */
  furniture: Box[];
  /** Text width in pixels at the label size. */
  measure: (text: string) => number;
};

export type Layout = {
  markers: Marker[];
  selected: Marker | null;
  lines: RelationLine[];
  boroughs: BoroughLabel[];
};

const LABEL_H = 16;
const LABEL_PAD = 8; // 4px each side
const EDGE = 4;
const MERGE_PX = 6;

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function box(x: number, y: number, w: number, h: number): Box {
  return { x, y, w, h };
}

/** Companies at the same place, or within a few pixels, share one marker. */
export function clusterPoints(points: MapPoint[]): Array<{ x: number; y: number; members: MapPoint[] }> {
  const groups: Array<{ x: number; y: number; members: MapPoint[] }> = [];
  const byPlace = new Map<string, { x: number; y: number; members: MapPoint[] }>();
  for (const p of points) {
    const existing = p.placeId ? byPlace.get(p.placeId) : undefined;
    if (existing) {
      existing.members.push(p);
      continue;
    }
    const near = groups.find((g) => Math.hypot(g.x - p.x, g.y - p.y) < MERGE_PX);
    if (near) {
      near.members.push(p);
      if (p.placeId) byPlace.set(p.placeId, near);
      continue;
    }
    const g = { x: p.x, y: p.y, members: [p] };
    groups.push(g);
    if (p.placeId) byPlace.set(p.placeId, g);
  }
  for (const g of groups) g.members.sort((a, b) => b.score - a.score);
  return groups;
}

function clusterLabel(members: MapPoint[]): string {
  if (members.length === 1) return members[0].label;
  const line = members[0].addressLine;
  if (line && members.every((m) => m.addressLine === line)) return line;
  return `${members.length} companies`;
}

export function layoutMap(input: LayoutInput): Layout {
  const { w, h, measure } = input;
  const placed: Box[] = [];
  const obstacles: Array<{ box: Box; owner: string | null }> = input.furniture.map((b) => ({ box: b, owner: null }));

  const inside = (b: Box) => b.x >= EDGE && b.y >= EDGE && b.x + b.w <= w - EDGE && b.y + b.h <= h - EDGE;
  const fits = (b: Box, owner: string | null) =>
    inside(b) &&
    obstacles.every((o) => (owner !== null && o.owner === owner) || !overlaps(b, o.box)) &&
    placed.every((p) => !overlaps(b, p));
  const place = (candidates: Box[], owner: string | null): Box | null => {
    const hit = candidates.find((c) => fits(c, owner));
    if (hit) placed.push(hit);
    return hit ?? null;
  };
  const labelWidth = (text: string) => Math.ceil(measure(text)) + LABEL_PAD;

  const markers: Marker[] = clusterPoints(input.points).map((g) => {
    const half = g.members.length > 1 ? 8 : 5;
    const key = g.members[0].id;
    obstacles.push({ box: box(g.x - half - 2, g.y - half - 2, half * 2 + 4, half * 2 + 4), owner: key });
    return { key, x: g.x, y: g.y, half, members: g.members, label: clusterLabel(g.members), labelBox: null, shown: false };
  });

  // The selected marker wears the 36px reticle, so its label clears the ring.
  const RETICLE = 18;
  let selectedKey: string | null = null;
  const candidatesFor = (m: Marker, text: string): Box[] => {
    const lw = labelWidth(text);
    const gap = m.key === selectedKey ? RETICLE + 2 : m.half + 4;
    return [
      box(m.x + gap, m.y - LABEL_H / 2, lw, LABEL_H),
      box(m.x - gap - lw, m.y - LABEL_H / 2, lw, LABEL_H),
      box(m.x - lw / 2, m.y - gap - LABEL_H, lw, LABEL_H),
      box(m.x - lw / 2, m.y + gap, lw, LABEL_H),
      box(m.x + gap, m.y - gap - LABEL_H + 4, lw, LABEL_H),
      box(m.x + gap, m.y + gap - 4, lw, LABEL_H),
      box(m.x - gap - lw, m.y - gap - LABEL_H + 4, lw, LABEL_H),
      box(m.x - gap - lw, m.y + gap - 4, lw, LABEL_H),
    ];
  };
  // Where a dropped label would show on hover: the first spot on the plate.
  const hoverSpot = (m: Marker, text: string) => {
    const c = candidatesFor(m, text);
    return c.find(inside) ?? c[0];
  };

  // 1. The selected company's name.
  const selected = input.selectedId ? (markers.find((m) => m.members.some((p) => p.id === input.selectedId)) ?? null) : null;
  if (selected) {
    selectedKey = selected.key;
    obstacles.push({ box: box(selected.x - RETICLE, selected.y - RETICLE, RETICLE * 2, RETICLE * 2), owner: selected.key });
    const member = selected.members.find((p) => p.id === input.selectedId)!;
    selected.label = member.label;
    selected.labelBox = place(candidatesFor(selected, selected.label), selected.key);
    selected.shown = selected.labelBox !== null;
    if (!selected.labelBox) selected.labelBox = hoverSpot(selected, selected.label);
  }

  // 2. Relationship labels, only for the selected company.
  const lines: RelationLine[] = [];
  if (selected) {
    for (const rel of input.relations) {
      const to = markers.find((m) => m.members.some((p) => p.id === rel.toId));
      if (!to || to === selected || lines.some((l) => l.toKey === to.key)) continue;
      const lw = labelWidth(rel.label);
      const dx = to.x - selected.x;
      const dy = to.y - selected.y;
      const candidates: Box[] = [];
      for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const cx = selected.x + dx * f;
        const cy = selected.y + dy * f;
        for (const oy of [-LABEL_H - 4, 4, -LABEL_H * 2 - 6, LABEL_H + 6]) {
          for (const ox of [-lw / 2, -lw + 12, -12]) candidates.push(box(cx + ox, cy + oy, lw, LABEL_H));
        }
      }
      lines.push({ toKey: to.key, x1: selected.x, y1: selected.y, x2: to.x, y2: to.y, label: rel.label, labelBox: place(candidates, null) });
    }
  }

  // 3. Other names: shared addresses first, then by score.
  const rest = markers
    .filter((m) => m !== selected)
    .sort((a, b) => b.members.length - a.members.length || b.members[0].score - a.members[0].score);
  for (const m of rest) {
    m.labelBox = place(candidatesFor(m, m.label), m.key);
    m.shown = m.labelBox !== null;
    if (!m.labelBox) m.labelBox = hoverSpot(m, m.label);
  }

  // 4. Borough names, lowest priority.
  const boroughs: BoroughLabel[] = [];
  for (const b of input.boroughs) {
    // Borough names are set at 12px, labels at 11px.
    const lw = Math.ceil((measure(b.name) * 12) / 11) + 2;
    const hit = place([box(b.x - lw / 2, b.y - 7, lw, 14)], null);
    if (hit) boroughs.push({ name: b.name, box: hit });
  }

  return { markers, selected, lines, boroughs };
}
