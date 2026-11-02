"use client";

import { ConnectionsGraph } from "@/components/viz/ConnectionsGraph";
import { DeadlinesTimeline } from "@/components/viz/DeadlinesTimeline";
import { usePhone } from "@/components/ui/usePhone";
import { LondonMap } from "@/components/viz/LondonMap";
import { shortName } from "@/lib/targets/format";
import type { Network, WorkspaceItem } from "@/lib/targets/types";

// Map, Connections and Deadlines over the same companies as the table,
// following the same selection. Map is 240px tall, the others 320px. On phone
// only the map shows, 200px tall, and tapping a marker opens the company.

export type View = "map" | "graph" | "deadlines";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "map", label: "Map" },
  { id: "graph", label: "Connections" },
  { id: "deadlines", label: "Deadlines" },
];

type Props = {
  view: View;
  onView: (v: View) => void;
  items: WorkspaceItem[];
  network: Network;
  selectedId: string | null;
  onSelect: (id: string) => void;
  nowMs: number;
  className?: string;
};

const tabClass = (active: boolean) =>
  `-mb-px border-0 border-b bg-transparent px-0 pt-2 pb-2.5 font-sans text-[15px] leading-[22px] transition-colors duration-150 ${
    active ? "cursor-default border-ink text-ink" : "cursor-pointer border-transparent text-ink-nav hover:text-ink"
  }`;

export function ViewsBand({ view: chosen, onView, items, network, selectedId, onSelect, nowMs, className = "" }: Props) {
  const phone = usePhone();
  const view = phone ? "map" : chosen;
  const height = phone ? 200 : view === "map" ? 240 : 320;
  const selected = items.find((i) => i.id === selectedId);
  const note =
    view === "map"
      ? "Registered offices of the companies in this list"
      : view === "graph"
        ? selected
          ? `People, addresses and clients around ${shortName(selected.name)}`
          : "People, addresses and clients around the selected company"
        : "Filing deadlines for the companies in this list";
  return (
    <section id="views" aria-label="Views" className={`sh-in sh-d3 mx-gutter mt-3 max-md:mt-4 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-subtle max-md:hidden">
        <div role="tablist" aria-label="View" className="flex gap-7">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              aria-controls="view-panel"
              onClick={() => onView(v.id)}
              className={tabClass(view === v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="m-0 pb-2.5 text-[13px] leading-[18px] text-ink-muted">
          {note}
        </p>
      </div>
      <div
        id="view-panel"
        role="tabpanel"
        aria-label={VIEWS.find((v) => v.id === view)?.label}
        className="relative mt-2 overflow-hidden border border-faint bg-plate max-md:mt-0"
        style={{ height }}
      >
        {view === "map" ? (
          <LondonMap items={items} selectedId={selectedId} onSelect={onSelect} height={height} compact={phone} />
        ) : view === "graph" ? (
          <ConnectionsGraph items={items} network={network} selectedId={selectedId} onSelect={onSelect} />
        ) : (
          <DeadlinesTimeline items={items} selectedId={selectedId} onSelect={onSelect} nowMs={nowMs} />
        )}
      </div>
    </section>
  );
}
