import { describe, expect, it } from "vitest";
import { hasVehicleName, isHoldingOrProperty, isVehicle } from "./vehicles";

describe("isHoldingOrProperty", () => {
  it("is true only when every code is a holding, property, head-office, residents' management or development code", () => {
    expect(isHoldingOrProperty(["64209"])).toBe(true);
    expect(isHoldingOrProperty(["64303", "68100", "68209", "68320", "70100"])).toBe(true);
    expect(isHoldingOrProperty(["98000"])).toBe(true);
    expect(isHoldingOrProperty(["41100", "68100"])).toBe(true);
    expect(isHoldingOrProperty(["64209", "62012"])).toBe(false);
    expect(isHoldingOrProperty(["41201"])).toBe(false);
    expect(isHoldingOrProperty(["64110"])).toBe(false);
    expect(isHoldingOrProperty(["70229"])).toBe(false);
    expect(isHoldingOrProperty([])).toBe(false);
  });
});

describe("hasVehicleName", () => {
  it("matches Topco, Holdco, Freehold, Holdings and HMO as whole words, in any case", () => {
    expect(hasVehicleName("Project Cyclone Topco Limited")).toBe(true);
    expect(hasVehicleName("Sapphire Amce HOLDCO Limited")).toBe(true);
    expect(hasVehicleName("53 Priory Road Freehold Limited")).toBe(true);
    expect(hasVehicleName("Lighthouse Future Holdings Ltd")).toBe(true);
    expect(hasVehicleName("Clapham HMO Ltd")).toBe(true);
    expect(hasVehicleName("East Street (Top Co) Ltd.")).toBe(false);
    expect(hasVehicleName("Freeholder Media Ltd")).toBe(false);
    expect(hasVehicleName("Holdingsworth Ltd")).toBe(false);
    expect(hasVehicleName("Shmoo Labs Ltd")).toBe(false);
  });
});

describe("isVehicle", () => {
  it("excludes by codes or by name", () => {
    expect(isVehicle({ name: "Northwind Labs Ltd", sicCodes: ["62012"] })).toBe(false);
    expect(isVehicle({ name: "Northwind Holdings Ltd", sicCodes: ["62012"] })).toBe(true);
    expect(isVehicle({ name: "Northwind Ltd", sicCodes: ["98000"] })).toBe(true);
    expect(isVehicle({ name: "Northwind Ltd", sicCodes: null })).toBe(false);
  });
});
