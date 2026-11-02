import { describe, expect, it } from "vitest";
import type { UniverseSegment } from "@/lib/clients/types";
import { defaultSegment, EDGE, layoutUniverse, radiusFor, RING, sectorMids, UCX, UCY } from "./universe-layout";

function segment(name: string, clients: number, leads: Array<[string, number | null, boolean]> = []): UniverseSegment {
  return {
    name,
    clients: Array.from({ length: clients }, (_, i) => ({ id: `${name}-${i}`, name: `${name} client ${i}` })),
    leads: leads.map(([id, score, today]) => ({ id, name: `Lead ${id}`, score, today, clientId: `${name}-0` })),
  };
}

describe("client universe layout", () => {
  it("puts better fits nearer the centre: 60 on the outer ring, 100 in the middle", () => {
    expect(radiusFor(100)).toBe(0);
    expect(radiusFor(60)).toBe(RING);
    expect(radiusFor(90)).toBe(RING / 4);
    expect(radiusFor(10)).toBe(EDGE);
  });

  it("starts the four types on the diagonals, top left first", () => {
    expect(sectorMids(4)).toEqual([-135, -45, 45, 135]);
  });

  it("selects B2B SaaS on load, else the largest type", () => {
    expect(defaultSegment([segment("Agency", 9), segment("B2B SaaS", 2)])).toBe("B2B SaaS");
    expect(defaultSegment([segment("Agency", 9), segment("Logistics", 2)])).toBe("Agency");
    expect(defaultSegment([])).toBeNull();
  });

  it("sizes boxes by the square root of their client count", () => {
    const { boxes } = layoutUniverse([segment("A", 64), segment("B", 16), segment("C", 1)], "A");
    const [a, b, c] = boxes.map((x) => x.size);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    // 64 clients against 16: the growth above the smallest size is twice, not four times.
    expect((a - 28) / (b - 28)).toBeCloseTo(2, 1);
  });

  it("draws only the selected type's scored leads, inside its sector", () => {
    const leads: Array<[string, number | null, boolean]> = [
      ["n", 92, true],
      ["h", 81, true],
      ["x", 70, false],
      ["u", null, false],
    ];
    const { dots, boxes } = layoutUniverse([segment("B2B SaaS", 2, leads), segment("Agency", 1, [["q", 88, true]])], "B2B SaaS");
    expect(dots.map((d) => d.id).sort()).toEqual(["h", "n", "x"]);
    expect(boxes.find((b) => b.name === "B2B SaaS")).toMatchObject({ leads: 4, today: 2, selected: true, labelAbove: true });
    for (const d of dots) {
      const angle = (Math.atan2(d.y - UCY, d.x - UCX) * 180) / Math.PI;
      expect(angle).toBeGreaterThanOrEqual(-135 - 38);
      expect(angle).toBeLessThanOrEqual(-135 + 38);
    }
    // Today's leads draw last, so they sit on top.
    expect(dots.at(-1)!.today).toBe(true);
    expect(dots.filter((d) => d.labelled).map((d) => d.id).sort()).toEqual(["h", "n"]);
  });
});
