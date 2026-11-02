import { describe, expect, it } from "vitest";
import { linkSegments, summaryParagraphs } from "./summary-text";

describe("linkSegments", () => {
  it("links each named company once", () => {
    const out = linkSegments("The strongest is Northwind Labs, scored 92. Northwind Labs is new.", [
      { id: "a", name: "Northwind Labs" },
    ]);
    expect(out).toEqual(["The strongest is ", { id: "a", text: "Northwind Labs" }, ", scored 92. Northwind Labs is new."]);
  });

  it("finds a name written without Ltd", () => {
    const out = linkSegments("Pawano is overdue.", [{ id: "p", name: "Pawano Ltd" }]);
    expect(out).toEqual([{ id: "p", text: "Pawano" }, " is overdue."]);
  });

  it("matches whole words only, ignoring case", () => {
    expect(linkSegments("Orbitals and ORBITAL PRINT", [{ id: "o", name: "Orbital Print" }])).toEqual([
      "Orbitals and ",
      { id: "o", text: "ORBITAL PRINT" },
    ]);
  });

  it("prefers the longer of two overlapping names", () => {
    const out = linkSegments("Lumen Data Labs scored 80.", [
      { id: "short", name: "Lumen Data" },
      { id: "long", name: "Lumen Data Labs" },
    ]);
    expect(out).toEqual([{ id: "long", text: "Lumen Data Labs" }, " scored 80."]);
  });

  it("escapes names with symbols", () => {
    const out = linkSegments("One looks like Ember & Oak (Greenwich).", [{ id: "e", name: "Ember & Oak" }]);
    expect(out[1]).toEqual({ id: "e", text: "Ember & Oak" });
  });
});

describe("summaryParagraphs", () => {
  it("splits on blank lines and links a company in the first paragraph that names it", () => {
    const out = summaryParagraphs("Found Cobalt Freight.\n\nCobalt Freight shares a director.", [{ id: "c", name: "Cobalt Freight" }]);
    expect(out).toEqual([["Found ", { id: "c", text: "Cobalt Freight" }, "."], ["Cobalt Freight shares a director."]]);
  });
});
