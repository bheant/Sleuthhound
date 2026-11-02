import { aClientOf } from "@/lib/business/name";
import { shortName } from "@/lib/targets/format";
import type { Network, WorkspaceItem } from "@/lib/targets/types";

// The Connections graph, laid out without physics: the selected company in the
// centre, its people and registered office on an inner ring, then clients it
// resembles and second-hop companies on an outer ring. Positions come from
// fixed slots, so the same company always draws the same way and no two nodes
// share a slot. Coordinates are in a 1062 × 286 space the component scales.

export const GW = 1062;
export const GH = 286;
const CX = 531;
const CY = 134;
const INNER = { rx: 220, ry: 70 };
const OUTER = { rx: 420, ry: 106 };

// People and the address on the diagonals first, then straight up and down.
const INNER_SLOTS = [-150, -30, 150, 30, -90, 90];
// The outer ring skips the shallow angles near the ends, where neighbouring
// nodes would sit on each other's labels.
const OUTER_SLOTS = [0, 180, -30, -50, -70, -90, -110, -130, -150, 30, 50, 70, 90, 110, 130, 150];
const KIDS_PER_PARENT = 3;
// Siblings ask for slots this far apart, so their labels clear each other's edges.
const SPREAD = 30;

export type NodeType = "company" | "person" | "address" | "client";
export type EdgeKind = "solid" | "dashed" | "warm";

export type GraphNode = {
  key: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  center: boolean;
  /** Set for companies and clients, so they can be opened. */
  targetId: string | null;
};

export type GraphEdge = { from: string; to: string; label: string; kind: EdgeKind };

export type GraphNote = { text: string; quiet: boolean };

export type GraphLayout = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: { companies: number; people: number; addresses: number; clients: number };
  notes: GraphNote[];
};

const rad = (deg: number) => (deg * Math.PI) / 180;
const onRing = (ring: { rx: number; ry: number }, deg: number) => ({
  x: CX + ring.rx * Math.cos(rad(deg)),
  y: CY + ring.ry * Math.sin(rad(deg)),
});
const angleGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

function clip(text: string, max = 22): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** "71 Bridle Lane, N1" from the first address line and the postcode's outward code. */
export function addressLabel(item: Pick<WorkspaceItem, "addressLine" | "postcode">): string | null {
  if (!item.addressLine) return null;
  const outward = item.postcode?.split(" ")[0];
  return outward ? `${item.addressLine}, ${outward}` : item.addressLine;
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

type Kid = { key: string; type: NodeType; label: string; targetId: string; edge: string; kind: EdgeKind };

/** business: the name from Settings, for the warm-intro notes. */
export function layoutGraph(selected: WorkspaceItem, listed: WorkspaceItem[], network: Network, business: string | null = null): GraphLayout {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const freeOuter = [...OUTER_SLOTS];
  const listedIds = new Set(listed.map((i) => i.id));

  const add = (key: string, type: NodeType, label: string, pos: { x: number; y: number }, targetId: string | null) => {
    const node: GraphNode = { key, type, label: clip(label), x: pos.x, y: pos.y, center: false, targetId };
    nodes.set(key, node);
    return node;
  };
  // The free outer slot nearest the angle asked for.
  const outerSlot = (want: number): number | null => {
    if (freeOuter.length === 0) return null;
    let best = 0;
    for (let i = 1; i < freeOuter.length; i++) {
      if (angleGap(freeOuter[i], want) < angleGap(freeOuter[best], want)) best = i;
    }
    return freeOuter.splice(best, 1)[0];
  };

  const center = add(`t:${selected.id}`, "company", shortName(selected.name), { x: CX, y: CY }, selected.id);
  center.center = true;

  // Inner ring: the registered office, then directors, up to the slots.
  type Inner = { key: string; angle: number; personId?: string; name: string; isAddress: boolean };
  const inner: Inner[] = [];
  const address = addressLabel(selected);
  const people = selected.directors;
  const peopleRoom = INNER_SLOTS.length - (address ? 1 : 0);
  const shownPeople = people.slice(0, peopleRoom);
  shownPeople.forEach((p, i) => {
    const angle = INNER_SLOTS[i + (address && i >= 1 ? 1 : 0)];
    inner.push({ key: `p:${p.id}`, angle, personId: p.id, name: p.name, isAddress: false });
  });
  if (address) inner.push({ key: `a:${selected.placeId ?? selected.id}`, angle: INNER_SLOTS[shownPeople.length >= 1 ? 1 : 0], name: address, isAddress: true });

  for (const n of inner) {
    add(n.key, n.isAddress ? "address" : "person", n.name, onRing(INNER, n.angle), null);
    edges.push({ from: center.key, to: n.key, label: n.isAddress ? "Registered at" : "Director", kind: "solid" });
  }

  // Second hop: what each person also directs (clients first, then companies
  // in this list), and other listed companies at the same address.
  const notes: GraphNote[] = [];
  const sameAddress = selected.placeId ? listed.filter((o) => o.id !== selected.id && o.placeId === selected.placeId) : [];
  for (const n of inner) {
    let kids: Kid[];
    if (n.personId) {
      const others = (network[n.personId] ?? []).filter((o) => o.id !== selected.id);
      const ranked = [...others].sort((a, b) => Number(b.isClient) - Number(a.isClient) || Number(listedIds.has(b.id)) - Number(listedIds.has(a.id)));
      kids = ranked.map((o) => ({
        key: `t:${o.id}`,
        type: o.isClient ? "client" : "company",
        label: shortName(o.name),
        targetId: o.id,
        edge: o.isClient ? "Director of client" : "Also directs",
        kind: o.isClient ? "warm" : "solid",
      }));
      const clients = others.filter((o) => o.isClient).map((o) => shortName(o.name));
      const leads = others.filter((o) => !o.isClient);
      for (const client of clients) notes.push({ text: `${n.name} is also a director of ${client}, ${aClientOf(business)}. Ask them for an intro.`, quiet: false });
      if (leads.length) {
        const inList = leads.filter((o) => listedIds.has(o.id)).length;
        const named = list(leads.slice(0, 3).map((o) => shortName(o.name)));
        const more = leads.length > 3 ? ` and ${leads.length - 3} more` : "";
        const tail = inList === leads.length ? ", in this list too" : "";
        notes.push({ text: `${n.name} also directs ${named}${more}${tail}.`, quiet: false });
      }
    } else {
      kids = sameAddress.map((o) => ({ key: `t:${o.id}`, type: "company", label: shortName(o.name), targetId: o.id, edge: "Same address", kind: "dashed" }));
    }
    const shown = kids.slice(0, KIDS_PER_PARENT);
    shown.forEach((k, j) => {
      if (!nodes.has(k.key)) {
        const slot = outerSlot(n.angle + (j - (shown.length - 1) / 2) * SPREAD);
        if (slot === null) return;
        add(k.key, k.type, k.label, onRing(OUTER, slot), k.targetId);
      }
      edges.push({ from: n.key, to: k.key, label: k.edge, kind: k.kind });
    });
  }

  // Clients this company resembles hang straight off the centre, after the
  // second hop, so a client also reached through a director sits by them.
  selected.resembles.forEach((c, i) => {
    const key = `t:${c.id}`;
    if (!nodes.has(key)) {
      const slot = outerSlot(i % 2 === 0 ? 0 : 180);
      if (slot === null) return;
      add(key, "client", shortName(c.name), onRing(OUTER, slot), c.id);
    }
    edges.push({ from: center.key, to: key, label: "Resembles", kind: "solid" });
  });

  if (address && selected.placeCount > 1) {
    const others = selected.placeCount - 1;
    const inList = sameAddress.length;
    const agent = selected.registeredOffice?.endsWith("(formation agent)") ? `${address}, a formation agent’s address,` : address;
    const text =
      inList > 0
        ? `${inList} other ${inList === 1 ? "company" : "companies"} in this list ${inList === 1 ? "uses" : "use"} ${agent} as a registered office${others > inList ? `, and ${others - inList} more found earlier` : ""}.`
        : `${others} other ${others === 1 ? "company" : "companies"} found earlier ${others === 1 ? "uses" : "use"} ${agent} as a registered office.`;
    notes.push({ text, quiet: false });
  }
  if (people.length > shownPeople.length) {
    const hidden = people.length - shownPeople.length;
    notes.push({ text: `${hidden} more ${hidden === 1 ? "director isn’t" : "directors aren’t"} shown.`, quiet: true });
  }
  if (!notes.some((n) => !n.quiet)) notes.unshift({ text: "No shared directors or addresses with other companies or clients.", quiet: true });

  const all = [...nodes.values()];
  return {
    nodes: all,
    edges,
    counts: {
      companies: all.filter((n) => n.type === "company").length,
      people: all.filter((n) => n.type === "person").length,
      addresses: all.filter((n) => n.type === "address").length,
      clients: all.filter((n) => n.type === "client").length,
    },
    notes,
  };
}
