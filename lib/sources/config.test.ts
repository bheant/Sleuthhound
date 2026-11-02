import { describe, expect, it } from "vitest";
import { nextRunAt, sourceConfig } from "./config";

const at = (h: number, m = 0) => new Date(2026, 9, 19, h, m, 30);

describe("nextRunAt", () => {
  it("hourly lands on the next whole hour", () => {
    expect(nextRunAt("hourly", at(14, 3))).toEqual(new Date(2026, 9, 19, 15, 0, 0));
    expect(nextRunAt("hourly", at(23, 59))).toEqual(new Date(2026, 9, 20, 0, 0, 0));
  });

  it("every 6 hours lands on 00, 06, 12 or 18", () => {
    expect(nextRunAt("every_6_hours", at(14, 3))).toEqual(new Date(2026, 9, 19, 18, 0, 0));
    expect(nextRunAt("every_6_hours", at(18, 0))).toEqual(new Date(2026, 9, 20, 0, 0, 0));
  });

  it("daily lands on the next 08:00", () => {
    expect(nextRunAt("daily", at(7, 10))).toEqual(new Date(2026, 9, 19, 8, 0, 0));
    expect(nextRunAt("daily", at(14))).toEqual(new Date(2026, 9, 20, 8, 0, 0));
  });
});

describe("sourceConfig", () => {
  it("fills defaults for missing settings", () => {
    const c = sourceConfig.parse({ scope: {} });
    expect(c).toMatchObject({ schedule: "hourly", max_items: 200, spend_cap_gbp: null, weight: "normal" });
  });
});
