import { describe, expect, it } from "vitest";
import type { Network, WorkspaceItem } from "@/lib/targets/types";
import { addressLabel, layoutGraph } from "./graph-layout";

function item(id: string, over: Partial<WorkspaceItem> = {}): WorkspaceItem {
  return {
    id,
    name: `Company ${id} Ltd`,
    companyNumber: null,
    score: 80,
    summary: "",
    whatTheyDo: null,
    whyFit: null,
    whyNow: null,
    sector: null,
    incorporatedOn: null,
    borough: null,
    postcode: "N1 6AA",
    lat: null,
    lng: null,
    placeId: "place-1",
    addressLine: "71 Bridle Lane",
    registeredOffice: null,
    industries: [],
    accountsDue: null,
    confirmation: null,
    directors: [],
    corporate: true,
    hubspotSentAt: null,
    resembles: [],
    placeCount: 1,
    tags: [],
    filings: [],
    raisedAt: null,
    skipped: null,
    trading: null,
    deadline: null,
    posts: [],
    sources: [],
    reviewedBy: "Claude",
    reviewedAt: "2026-10-19T14:03:00Z",
    runId: null,
    decision: null,
    decidedAt: null,
    reason: null,
    reasonNote: null,
    isDemo: false,
    ...over,
  };
}

describe("connections graph layout", () => {
  it("labels an address by its first line and outward code", () => {
    expect(addressLabel({ addressLine: "71 Bridle Lane", postcode: "N1 6AA" })).toBe("71 Bridle Lane, N1");
    expect(addressLabel({ addressLine: null, postcode: "N1 6AA" })).toBeNull();
  });

  it("marks a director of a client as a warm intro and says so", () => {
    const selected = item("a", { directors: [{ id: "p1", name: "A. Lindqvist", email: null }] });
    const network: Network = { p1: [{ id: "a", name: "Company a Ltd", isClient: false }, { id: "k", name: "Lumen Data Ltd", isClient: true }] };
    const g = layoutGraph(selected, [selected], network);
    const warm = g.edges.find((e) => e.kind === "warm");
    expect(warm).toMatchObject({ from: "p:p1", to: "t:k", label: "Director of client" });
    expect(g.counts).toEqual({ companies: 1, people: 1, addresses: 1, clients: 1 });
    expect(g.notes[0].text).toBe("A. Lindqvist is also a director of Lumen Data, one of your clients. Ask them for an intro.");
    expect(layoutGraph(selected, [selected], network, "Acme").notes[0].text).toBe("A. Lindqvist is also a director of Lumen Data, a client of Acme. Ask them for an intro.");
  });

  it("never puts two nodes in the same place, however crowded", () => {
    const directors = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `Person ${i}`, email: null }));
    const network: Network = Object.fromEntries(
      directors.map((d, i) => [d.id, Array.from({ length: 5 }, (_, j) => ({ id: `o${i}-${j}`, name: `Other ${i}-${j}`, isClient: j === 0 }))]),
    );
    const others = Array.from({ length: 6 }, (_, i) => item(`s${i}`));
    const selected = item("a", { directors, resembles: [{ id: "k1", name: "Acme Ltd" }, { id: "k2", name: "Kelp Ltd" }], placeCount: 40 });
    const g = layoutGraph(selected, [selected, ...others], network);
    const spots = g.nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`);
    expect(new Set(spots).size).toBe(spots.length);
    expect(g.nodes.filter((n) => n.type === "person")).toHaveLength(5);
    expect(g.notes.some((n) => n.text === "4 more directors aren’t shown.")).toBe(true);
    // Every edge joins two drawn nodes.
    const keys = new Set(g.nodes.map((n) => n.key));
    for (const e of g.edges) expect(keys.has(e.from) && keys.has(e.to)).toBe(true);
  });

  it("is deterministic", () => {
    const selected = item("a", { directors: [{ id: "p1", name: "J. Okafor", email: null }] });
    const network: Network = { p1: [{ id: "b", name: "Pine Ltd", isClient: false }] };
    const listed = [selected, item("b"), item("c")];
    expect(layoutGraph(selected, listed, network)).toEqual(layoutGraph(selected, listed, network));
  });

  it("says plainly when there's nothing shared", () => {
    const selected = item("a", { placeId: null, addressLine: null });
    const g = layoutGraph(selected, [selected], {});
    expect(g.notes).toEqual([{ text: "No shared directors or addresses with other companies or clients.", quiet: true }]);
  });
});
