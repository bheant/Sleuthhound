import { describe, expect, it } from "vitest";
import { BOX, formatCoords, inBox, project, scaleBar, smoothPath, thamesPath } from "./project";

describe("project", () => {
  it("maps the box corners to the plate corners", () => {
    expect(project(BOX.west, BOX.north, 1344, 240)).toEqual({ x: 0, y: 0 });
    const se = project(BOX.east, BOX.south, 1344, 240);
    expect(se.x).toBeCloseTo(1344);
    expect(se.y).toBeCloseTo(240);
  });

  it("puts the City of London left of Newham and north of Croydon", () => {
    const city = project(-0.092, 51.515, 1000, 240);
    const newham = project(0.035, 51.53, 1000, 240);
    const croydon = project(-0.08, 51.37, 1000, 240);
    expect(city.x).toBeLessThan(newham.x);
    expect(city.y).toBeLessThan(croydon.y);
  });

  it("knows what is inside the box", () => {
    expect(inBox(-0.12, 51.5)).toBe(true);
    expect(inBox(-2.18, 53.0)).toBe(false);
  });

  it("picks a readable scale bar", () => {
    const bar = scaleBar(1344);
    expect(bar.px).toBeGreaterThanOrEqual(30);
    expect([1, 2, 5, 10]).toContain(bar.km);
  });

  it("draws a smooth path through every point", () => {
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }])).toMatch(/^M0 0 C.* 10 5 C.* 20 0$/);
    expect(thamesPath(1344, 240).match(/C/g)).toHaveLength(13);
  });

  it("formats coordinates", () => {
    expect(formatCoords(51.5664, -0.0737)).toBe("51.5664° N 0.0737° W");
  });
});
