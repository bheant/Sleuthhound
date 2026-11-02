import { describe, expect, it } from "vitest";
import { clusterPoints, layoutMap, overlaps, type Box, type LayoutInput, type MapPoint } from "./map-layout";

const measure = (t: string) => t.length * 6.2;

function point(id: string, x: number, y: number, score = 70, placeId: string | null = null): MapPoint {
  return { id, x, y, score, label: `Company ${id}`, placeId, addressLine: placeId ? "71-75 Shelton Street" : null };
}

// A crowded plate: a grid of companies, some sharing an address.
function crowded(): LayoutInput {
  const points: MapPoint[] = [];
  let n = 0;
  for (let gx = 0; gx < 12; gx++) {
    for (let gy = 0; gy < 5; gy++) {
      n++;
      points.push(point(`c${n}`, 60 + gx * 90 + (gy % 2) * 20, 30 + gy * 42, 60 + ((n * 7) % 40), n % 9 === 0 ? "shared" : null));
    }
  }
  return {
    w: 1200,
    h: 240,
    points,
    selectedId: "c14",
    relations: [
      { toId: "c3", label: "Shared director: Ada Shah" },
      { toId: "c40", label: "Shared director: Sam Marsh" },
    ],
    boroughs: [
      { name: "Hackney", x: 700, y: 90 },
      { name: "Islington", x: 560, y: 110 },
      { name: "Westminster", x: 400, y: 140 },
    ],
    furniture: [
      { x: 8, y: 210, w: 520, h: 22 },
      { x: 1130, y: 6, w: 60, h: 60 },
    ],
    measure,
  };
}

function shownBoxes(input: LayoutInput) {
  const layout = layoutMap(input);
  const labels: Box[] = [
    ...layout.markers.filter((m) => m.shown).map((m) => m.labelBox!),
    ...layout.lines.flatMap((l) => (l.labelBox ? [l.labelBox] : [])),
    ...layout.boroughs.map((b) => b.box),
  ];
  return { layout, labels };
}

describe("layoutMap", () => {
  it("never lets a shown label overlap another label", () => {
    const { labels } = shownBoxes(crowded());
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) expect(overlaps(labels[i], labels[j])).toBe(false);
    }
  });

  it("never lets a shown label cover a marker or the map furniture", () => {
    const input = crowded();
    const { layout, labels } = shownBoxes(input);
    const markerBoxes = layout.markers.map((m) => ({ x: m.x - m.half, y: m.y - m.half, w: m.half * 2, h: m.half * 2 }));
    for (const label of labels) {
      for (const f of input.furniture) expect(overlaps(label, f)).toBe(false);
      for (const mb of markerBoxes) expect(overlaps(label, mb)).toBe(false);
    }
  });

  it("keeps every shown label on the plate", () => {
    const input = crowded();
    for (const b of shownBoxes(input).labels) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(input.w);
      expect(b.y + b.h).toBeLessThanOrEqual(input.h);
    }
  });

  it("keeps labels off the selected company's reticle", () => {
    const { layout, labels } = shownBoxes(crowded());
    const sel = layout.selected!;
    const reticle = { x: sel.x - 18, y: sel.y - 18, w: 36, h: 36 };
    for (const label of labels) expect(overlaps(label, reticle)).toBe(false);
  });

  it("places the selected company's name first and draws its relationship lines", () => {
    const { layout } = shownBoxes(crowded());
    expect(layout.selected?.members.some((m) => m.id === "c14")).toBe(true);
    expect(layout.selected?.shown).toBe(true);
    expect(layout.selected?.label).toBe("Company c14");
    expect(layout.lines).toHaveLength(2);
  });

  it("drops the lowest-priority labels when space runs out", () => {
    const input = crowded();
    const { layout } = shownBoxes(input);
    expect(layout.markers.some((m) => !m.shown)).toBe(true);
    // A dropped name still has a hover position.
    expect(layout.markers.every((m) => m.labelBox !== null)).toBe(true);
  });
});

describe("clusterPoints", () => {
  it("puts companies at the same place on one marker, highest score first", () => {
    const groups = clusterPoints([point("a", 10, 10, 61, "p1"), point("b", 300, 100, 90, "p1"), point("c", 500, 50)]);
    expect(groups).toHaveLength(2);
    expect(groups[0].members.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("merges companies a few pixels apart", () => {
    expect(clusterPoints([point("a", 100, 100), point("b", 103, 102)])).toHaveLength(1);
    expect(clusterPoints([point("a", 100, 100), point("b", 120, 100)])).toHaveLength(2);
  });
});
