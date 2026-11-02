"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useBusinessName } from "@/components/vault/useBusinessName";
import { clientLabel, clientsLabel } from "@/lib/business/name";
import type { Network, WorkspaceItem } from "@/lib/targets/types";
import { GH, GW, layoutGraph, type EdgeKind, type GraphNode } from "./graph-layout";

// The Connections tab: the selected company in the centre, the people and
// address around it, and the clients and other companies they lead to. A warm
// intro (a person who directs this company and a client) is the 3px indigo
// double line. Edge labels show only where they fit between the two nodes.
// The side box counts what's in view and says what's worth knowing.

type Props = {
  items: WorkspaceItem[];
  network: Network;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const CENTER_SIZE = 44;
const NODE_SIZE = 34;
const LABEL_GAP = 6;
const LABEL_H = 16;
// The rings' centre line, as a share of the plate height.
const CY_RATIO = 134 / GH;

function useSize(el: HTMLElement | null) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return size;
}

function useMeasure(el: HTMLElement | null) {
  return useMemo(() => {
    const fallback = (t: string, px: number) => t.length * px * 0.56;
    if (!el || typeof document === "undefined") return fallback;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return fallback;
    const family = getComputedStyle(el).fontFamily;
    return (t: string, px: number) => {
      ctx.font = `400 ${px}px ${family}`;
      return ctx.measureText(t).width;
    };
  }, [el]);
}

type Rect = { x: number; y: number; w: number; h: number };
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const EDGE_STROKE: Record<EdgeKind, string> = {
  solid: "var(--border-strong)",
  dashed: "var(--text-muted)",
  warm: "var(--accent-data)",
};

function NodeIcon({ type, size }: { type: GraphNode["type"]; size: number }) {
  if (type === "person") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <circle cx="9" cy="6" r="3.25" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.75 16c.6-3.2 3.1-5 6.25-5s5.65 1.8 6.25 5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  if (type === "address") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M9 16.5s5.25-4.7 5.25-8.75a5.25 5.25 0 0 0-10.5 0C3.75 11.8 9 16.5 9 16.5Z" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="9" cy="7.75" r="1.75" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  if (type === "client") {
    return (
      <svg width="18" height="18" viewBox="-300 -300 600 600" aria-hidden>
        <circle r="206" fill="none" stroke="currentColor" strokeWidth="52" />
        <path fill="currentColor" d="M-26.5 -294h53v186h-53zM-26.5 108h53v186h-53zM-294 -26.5h186v53h-186zM108 -26.5h186v53h-186z" />
      </svg>
    );
  }
  const px = size > NODE_SIZE ? 20 : 18;
  return (
    <svg width={px} height={px} viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 16V3h7v13M10 7h5v9M5.5 6h2M5.5 9h2M5.5 12h2M12.5 10h0.5M12.5 13h0.5M1.5 16h15" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

// In a screen reader label: "Lumen Data, Acme client" or "Lumen Data, your client".
const kindLabel = (type: GraphNode["type"], business: string | null) => (type === "client" ? (business ? `${business} client` : "your client") : type);

export function ConnectionsGraph({ items, network, selectedId, onSelect }: Props) {
  const [plate, setPlate] = useState<HTMLDivElement | null>(null);
  const { w, h } = useSize(plate);
  const measure = useMeasure(plate);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const listedIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const business = useBusinessName();
  const graph = useMemo(() => (selected ? layoutGraph(selected, items, network, business) : null), [selected, items, network, business]);

  const drawn = useMemo(() => {
    if (!graph || w === 0 || h === 0) return null;
    const pos = new Map(graph.nodes.map((n) => [n.key, { x: (n.x / GW) * w, y: (n.y / GH) * h, n }]));
    const sizeOf = (n: GraphNode) => (n.center ? CENTER_SIZE : NODE_SIZE);
    // What a label may not cover: every node box and the name under it.
    const blocked: Rect[] = [];
    for (const { x, y, n } of pos.values()) {
      const s = sizeOf(n);
      blocked.push({ x: x - s / 2, y: y - s / 2, w: s, h: s });
      const lw = measure(n.label, 12);
      blocked.push({ x: x - lw / 2, y: y + s / 2 + LABEL_GAP, w: lw, h: LABEL_H });
    }
    // Warm intros claim label space first.
    const order = [...graph.edges].sort((a, b) => Number(b.kind === "warm") - Number(a.kind === "warm"));
    const edges = order.map((e) => {
      const a = pos.get(e.from)!;
      const b = pos.get(e.to)!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const lw = measure(e.label, 11) + 10;
      const room = len - sizeOf(a.n) / 2 - sizeOf(b.n) / 2 - 12;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const box = { x: mid.x - lw / 2, y: mid.y - 8, w: lw, h: 16 };
      const fits = room >= lw && !blocked.some((r) => hit(r, box));
      if (fits) blocked.push(box);
      return { ...e, x1: a.x, y1: a.y, x2: b.x, y2: b.y, mid, showLabel: fits };
    });
    return { nodes: [...pos.values()], edges };
  }, [graph, w, h, measure]);

  const counts = graph?.counts ?? { companies: 0, people: 0, addresses: 0, clients: 0 };
  const countRows = [
    { label: "Companies", n: counts.companies, data: false },
    { label: "People", n: counts.people, data: false },
    { label: "Addresses", n: counts.addresses, data: false },
    { label: clientsLabel(business), n: counts.clients, data: true },
  ];
  const max = Math.max(1, ...countRows.map((r) => r.n));

  return (
    <div className="absolute inset-0 flex">
      <div ref={setPlate} className="relative min-w-0 flex-1 overflow-hidden">
        {w > 0 ? (
          <svg aria-hidden width={w} height={h} className="absolute inset-0">
            <path d={`M0 ${(CY_RATIO * h).toFixed(1)}H${w}M${w / 2} 0V${h}`} stroke="var(--plate-grid)" fill="none" />
            <ellipse cx={w / 2} cy={CY_RATIO * h} rx={(220 / GW) * w} ry={(70 / GH) * h} fill="none" stroke="var(--border-subtle)" />
            <ellipse cx={w / 2} cy={CY_RATIO * h} rx={(420 / GW) * w} ry={(106 / GH) * h} fill="none" stroke="var(--border-subtle)" strokeDasharray="3 6" />
          </svg>
        ) : null}
        {!selected ? (
          <p className="absolute inset-0 m-0 flex items-center justify-center text-[14px] text-ink-secondary">Select a company to see its connections.</p>
        ) : null}
        {drawn ? (
          <div key={selected?.id} className="sh-swap absolute inset-0">
            <svg aria-hidden width={w} height={h} className="absolute inset-0">
              {drawn.edges.map((e) =>
                e.kind === "warm" ? (
                  <g key={`${e.from}-${e.to}`}>
                    <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={EDGE_STROKE.warm} strokeWidth={3} />
                    <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="var(--bg-plate)" strokeWidth={1} />
                  </g>
                ) : (
                  <line
                    key={`${e.from}-${e.to}`}
                    x1={e.x1}
                    y1={e.y1}
                    x2={e.x2}
                    y2={e.y2}
                    stroke={EDGE_STROKE[e.kind]}
                    strokeDasharray={e.kind === "dashed" ? "4 4" : undefined}
                  />
                ),
              )}
            </svg>
            {drawn.edges
              .filter((e) => e.showLabel)
              .map((e) => (
                <span
                  key={`l-${e.from}-${e.to}`}
                  aria-hidden
                  className={`absolute -translate-x-1/2 -translate-y-1/2 bg-plate px-[5px] text-[11px] leading-[15px] whitespace-nowrap ${e.kind === "warm" ? "text-data" : "text-ink-muted"}`}
                  style={{ left: e.mid.x, top: e.mid.y }}
                >
                  {e.label}
                </span>
              ))}
            {drawn.nodes.map(({ x, y, n }) => {
              const size = n.center ? CENTER_SIZE : NODE_SIZE;
              const tone = n.center
                ? "border-select text-select"
                : n.type === "client"
                  ? "border-data text-data"
                  : "border-strong text-bright";
              const box = (
                <span className={`flex items-center justify-center border bg-field ${tone}`} style={{ width: size, height: size }}>
                  <NodeIcon type={n.type} size={size} />
                </span>
              );
              const label = (
                <span
                  className={`absolute top-full left-1/2 mt-1.5 -translate-x-1/2 text-[12px] leading-4 whitespace-nowrap ${n.center ? "text-ink" : "text-ink-secondary"}`}
                >
                  {n.label}
                </span>
              );
              const style = { left: x, top: y };
              const canSelect = !n.center && n.type === "company" && n.targetId !== null && listedIds.has(n.targetId);
              if (canSelect) {
                return (
                  <button
                    key={n.key}
                    type="button"
                    aria-label={`Select ${n.label}`}
                    onClick={() => onSelect(n.targetId!)}
                    className="group absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent p-0 font-sans [&>span:first-child]:transition-colors hover:[&>span:first-child]:border-ink"
                    style={style}
                  >
                    {box}
                    {label}
                  </button>
                );
              }
              if (n.type === "client" && n.targetId) {
                return (
                  <Link
                    key={n.key}
                    href={`/clients?c=${n.targetId}`}
                    aria-label={`${n.label}, ${kindLabel("client", business)}. Opens on Clients.`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 no-underline"
                    style={style}
                  >
                    {box}
                    {label}
                  </Link>
                );
              }
              return (
                <div key={n.key} role="img" aria-label={n.center ? `${n.label}, selected` : `${n.label}, ${kindLabel(n.type, business)}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={style}>
                  {box}
                  {label}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      <aside aria-label="In view" className="w-[280px] shrink-0 overflow-y-auto border-l border-faint bg-canvas px-5 pt-4 pb-5 max-[760px]:hidden">
        <h3 className="m-0 text-[13px] leading-[18px] font-normal text-ink-muted">In view</h3>
        <ul className="mt-2.5 mb-0 flex list-none flex-col gap-2 p-0">
          {countRows.map((r) => (
            <li key={r.label} className="grid grid-cols-[1fr_28px] items-center gap-x-3 gap-y-[3px] text-[14px] leading-5">
              <span>{r.label}</span>
              <span className="text-right text-ink-secondary tabular-nums">{r.n}</span>
              <span className="col-span-2 h-[3px] bg-faint">
                <span className={`block h-[3px] ${r.data ? "bg-data" : "bg-bright"}`} style={{ width: `${(r.n / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 mb-0 text-[13px] leading-[18px] font-normal text-ink-muted">Worth knowing</h3>
        <ul className="mt-1.5 mb-0 flex list-none flex-col gap-2.5 p-0 text-[14px] leading-5">
          {(graph?.notes ?? [{ text: "Select a company to see who and what it’s connected to.", quiet: true }]).map((note) => (
            <li key={note.text} className={note.quiet ? "text-ink-secondary" : "text-ink"}>
              {note.text}
            </li>
          ))}
        </ul>
        <h3 className="mt-6 mb-0 text-[13px] leading-[18px] font-normal text-ink-muted">Key</h3>
        <ul className="mt-2 mb-0 flex list-none flex-col gap-1.5 p-0 text-[12px] leading-4 text-ink-secondary">
          <li className="flex items-center gap-2">
            <span className="w-[18px] shrink-0 border-t border-control" />
            Director, resembles, also directs
          </li>
          <li className="flex items-center gap-2">
            <span className="w-[18px] shrink-0 border-t border-dashed border-ink-muted" />
            Same registered address
          </li>
          <li className="flex items-center gap-2">
            <span className="w-[18px] shrink-0 border-t-[3px] border-double border-data" />
            Warm intro through a client
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 border border-data" />
            {clientLabel(business)}
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 border border-select" />
            Selected company
          </li>
          <li>Inner ring: one step. Outer ring: two steps.</li>
        </ul>
      </aside>
    </div>
  );
}
