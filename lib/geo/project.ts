// Projection for the London map plate.
//
// An equirectangular projection of the box lon -0.51 to 0.33, lat 51.28 to
// 51.70, with x scaled by cos(51.5°) so a degree of longitude is as wide as it
// is on the ground. The plate is a wide band (240px tall), so, like the design,
// the projected box is stretched to fill it: x and y scales differ, and the
// scale bar measures across, not up.

export const BOX = { west: -0.51, east: 0.33, south: 51.28, north: 51.7 } as const;

const COS_LAT = Math.cos((51.5 * Math.PI) / 180);
const KM_PER_DEG_LAT = 111.32;

/** The box's natural size in kilometres. */
export const BOX_KM = {
  width: (BOX.east - BOX.west) * COS_LAT * KM_PER_DEG_LAT,
  height: (BOX.north - BOX.south) * KM_PER_DEG_LAT,
};

export type Point = { x: number; y: number };

export function inBox(lng: number, lat: number): boolean {
  return lng >= BOX.west && lng <= BOX.east && lat >= BOX.south && lat <= BOX.north;
}

/** Plate pixels for a longitude and latitude, on a plate w by h. */
export function project(lng: number, lat: number, w: number, h: number): Point {
  const x = ((lng - BOX.west) * COS_LAT) / ((BOX.east - BOX.west) * COS_LAT);
  const y = (BOX.north - lat) / (BOX.north - BOX.south);
  return { x: x * w, y: y * h };
}

/** A scale bar between 30 and 90px wide on a plate w pixels across. */
export function scaleBar(w: number): { km: number; px: number } {
  const pxPerKm = w / BOX_KM.width;
  const km = [1, 2, 5, 10].find((k) => k * pxPerKm >= 30) ?? 10;
  return { km, px: Math.round(km * pxPerKm) };
}

// The Thames through central London, west to east (the spec's points).
export const THAMES: Array<[number, number]> = [
  [-0.31, 51.46],
  [-0.22, 51.47],
  [-0.16, 51.48],
  [-0.12, 51.5],
  [-0.1, 51.51],
  [-0.07, 51.505],
  [-0.03, 51.507],
  [-0.01, 51.49],
  [0.0, 51.485],
  [0.01, 51.5],
  [0.04, 51.505],
  [0.07, 51.495],
  [0.12, 51.51],
  [0.17, 51.51],
];

/** A smooth SVG path through points (Catmull-Rom as cubic Béziers). */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

export function thamesPath(w: number, h: number): string {
  return smoothPath(THAMES.map(([lng, lat]) => project(lng, lat, w, h)));
}

/** "51.5664° N 0.0737° W" */
export function formatCoords(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(4)}° ${lng < 0 ? "W" : "E"}`;
}
