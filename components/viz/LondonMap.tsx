"use client";

import { useEffect, useMemo, useState } from "react";
import { BOROUGHS } from "@/lib/geo/boroughs";
import { formatCoords, inBox, project, scaleBar, thamesPath } from "@/lib/geo/project";
import { scoreStep, shortName } from "@/lib/targets/format";
import type { WorkspaceItem } from "@/lib/targets/types";
import { layoutMap, type Box, type Marker } from "./map-layout";

// The Map tab: registered offices of the companies in the list, on a plate of
// London. Markers are squares coloured by score step; the selected company gets
// the yellow reticle and yellow lines to companies that share a director.

type Props = {
  items: WorkspaceItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  height: number;
  /** Phone: no compass, scale, legend or coordinates; a tap hint instead. */
  compact?: boolean;
};

const LEGEND = ["80 and above", "70 to 79", "60 to 69", "Linked to the selected company"];

// Fill and border per score step, from the design: full accent, 45% accent,
// outline only.
const MARKER_STYLE = {
  high: "bg-data border-data",
  mid: "bg-data-mid border-data",
  low: "bg-transparent border-ink-secondary",
  under: "bg-transparent border-ink-muted",
} as const;

function useWidth(el: HTMLElement | null) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return width;
}

// Label widths from the real font, so the collision rule matches what's drawn.
function useMeasure(el: HTMLElement | null) {
  return useMemo(() => {
    const fallback = (t: string) => t.length * 6.2;
    if (!el || typeof document === "undefined") return fallback;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return fallback;
    ctx.font = `400 11px ${getComputedStyle(el).fontFamily}`;
    const cache = new Map<string, number>();
    return (t: string) => {
      let w = cache.get(t);
      if (w === undefined) {
        w = ctx.measureText(t).width;
        cache.set(t, w);
      }
      return w;
    };
  }, [el]);
}

export function LondonMap({ items, selectedId, onSelect, height: H, compact = false }: Props) {
  const [plate, setPlate] = useState<HTMLDivElement | null>(null);
  const W = useWidth(plate);
  const measure = useMeasure(plate);
  // Markers appear left to right once, on the first paint only.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setEntering(false), 1400);
    return () => clearTimeout(timer);
  }, []);

  const onMap = useMemo(() => items.filter((i) => i.lat !== null && i.lng !== null && inBox(i.lng, i.lat)), [items]);
  const offMap = items.length - onMap.length;
  const selected = items.find((i) => i.id === selectedId) ?? null;

  const layout = useMemo(() => {
    if (W === 0) return null;
    const legendW = LEGEND.reduce((sum, t) => sum + measure(t) * (12 / 11) + 34, 0) + (offMap ? 200 : 0);
    const furniture: Box[] = compact
      ? [{ x: 8, y: H - 26, w: 140, h: 22 }]
      : [
          { x: W - 70, y: 6, w: 64, h: 64 },
          { x: 8, y: H - 30, w: Math.min(legendW, W - 16), h: 24 },
          { x: W - 300, y: H - 30, w: 294, h: 24 },
        ];
    const relations: Array<{ toId: string; label: string }> = [];
    if (selected) {
      for (const other of onMap) {
        if (other.id === selected.id) continue;
        const shared = selected.directors.find((d) => other.directors.some((o) => o.id === d.id));
        if (shared) relations.push({ toId: other.id, label: `Shared director: ${shared.name}` });
      }
    }
    return layoutMap({
      w: W,
      h: H,
      points: onMap.map((i) => {
        const { x, y } = project(i.lng!, i.lat!, W, H);
        return { id: i.id, x, y, score: i.score, label: shortName(i.name), placeId: i.placeId, addressLine: i.addressLine };
      }),
      selectedId: selected?.id ?? null,
      relations,
      boroughs: BOROUGHS.map((b) => ({ name: b.name, ...project(b.lng, b.lat, W, H) })),
      furniture,
      measure,
    });
  }, [W, H, onMap, offMap, selected, measure, compact]);

  const river = W ? thamesPath(W, H) : "";
  const bar = scaleBar(W || 1344);
  const sel = layout?.selected ?? null;
  const coords =
    selected && selected.lat !== null && selected.lng !== null && sel ? `${shortName(selected.name)}, ${formatCoords(selected.lat, selected.lng)}` : "";

  const markerLabel = (m: Marker) =>
    m.members.length > 1 ? `${m.members.length} companies at ${m.members[0].addressLine ?? "this spot"}` : `${m.members[0].label}, score ${m.members[0].score}`;

  return (
    <div ref={setPlate} role="group" aria-label={`Map of ${onMap.length} ${onMap.length === 1 ? "company" : "companies"}`} className="absolute inset-0">
      {W > 0 ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="absolute inset-0">
          <path d={Array.from({ length: 13 }, (_, i) => `M${Math.round(((i + 1) * W) / 14)} 0V${H}`).join("")} stroke="var(--plate-grid)" fill="none" />
          <path d={Array.from({ length: 7 }, (_, i) => `M0 ${Math.round(((i + 1) * H) / 8)}H${W}`).join("")} stroke="var(--plate-grid)" fill="none" />
          <path d={`M${Math.round(W / 2)} 0V${H}M0 ${Math.round(H / 2)}H${W}`} stroke="var(--plate-axis)" fill="none" />
          <path
            d={`M${W * 0.06} ${H * 0.07}L${W * 0.94} ${H * 0.93}M${W * 0.06} ${H * 0.93}L${W * 0.94} ${H * 0.07}`}
            stroke="var(--plate-axis)"
            strokeDasharray="2 10"
            fill="none"
          />
          <path d={river} stroke="var(--river-band)" strokeWidth="9" strokeLinecap="round" fill="none" />
          <path d={river} stroke="var(--river-line)" fill="none" />
          {layout?.lines.map((l) => (
            <line key={l.toKey} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--select)" strokeOpacity="0.85" className="sh-vfade" />
          ))}
        </svg>
      ) : null}

      {layout?.boroughs.map((b) => (
        <span
          key={b.name}
          aria-hidden
          className="pointer-events-none absolute text-[12px] leading-[14px] whitespace-nowrap text-strong"
          style={{ left: b.box.x, top: b.box.y }}
        >
          {b.name}
        </span>
      ))}

      {layout?.lines.map((l) =>
        l.labelBox ? (
          <span
            key={l.toKey}
            aria-hidden
            className="sh-vfade pointer-events-none absolute z-[2] bg-plate px-1 text-[11px] leading-4 whitespace-nowrap text-select"
            style={{ left: l.labelBox.x, top: l.labelBox.y }}
          >
            {l.label}
          </span>
        ) : null,
      )}

      {layout?.markers.map((m) => {
        const isSel = m === sel;
        const top = m.members[0];
        const style = m.members.length > 1 ? "bg-cluster border-data" : MARKER_STYLE[scoreStep(top.score)];
        const size = m.half * 2;
        return (
          <button
            key={m.key}
            type="button"
            aria-label={markerLabel(m)}
            aria-pressed={isSel}
            onClick={() => onSelect(isSel && selectedId ? selectedId : top.id)}
            className="sh-mk absolute z-[1] flex size-[18px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center border-0 bg-transparent p-0 font-sans"
            style={{ left: m.x, top: m.y }}
          >
            <span
              className={`${entering ? "sh-blip" : ""} flex flex-none items-center justify-center border text-[10px] leading-none text-ink ${style}`}
              style={{ width: size, height: size, animationDelay: entering ? `${Math.round(260 + (m.x / W) * 700)}ms` : undefined }}
            >
              {m.members.length > 1 ? m.members.length : null}
            </span>
            {m.labelBox ? (
              <span
                className={`sh-mkl ${m.shown ? "" : "sh-mkl-hid"} pointer-events-none absolute bg-plate/85 px-1 text-[11px] leading-4 whitespace-nowrap ${
                  isSel ? "text-select" : "text-ink-secondary"
                }`}
                style={{ left: Math.round(m.labelBox.x - (m.x - 9)), top: Math.round(m.labelBox.y - (m.y - 9)) }}
              >
                {m.label}
              </span>
            ) : null}
          </button>
        );
      })}

      {sel ? (
        <div aria-hidden className="sh-reticle pointer-events-none absolute top-0 left-0 z-[3]" style={{ transform: `translate(${sel.x}px, ${sel.y}px)` }}>
          <svg key={selectedId} width="36" height="36" viewBox="-300 -300 600 600" className="sh-lock absolute top-0 left-0">
            <circle r="206" fill="none" stroke="var(--select)" strokeWidth="26" />
            <path fill="var(--select)" d="M-13 -294h26v186h-26zM-13 108h26v186h-26zM-294 -13h186v26h-186zM108 -13h186v26h-186z" />
          </svg>
        </div>
      ) : null}

      {compact ? (
        <p className="pointer-events-none absolute bottom-2 left-2.5 m-0 text-[12px] leading-4 text-ink-muted">Tap a marker to open it</p>
      ) : (
        <>
          <div aria-hidden className="absolute top-3 right-3.5 flex flex-col items-center gap-1 text-[11px] leading-[14px] text-ink-muted">
            <svg width="32" height="32" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16" fill="none" stroke="var(--border-default)" />
              <path d="M18 5 L22 18 L18 15 L14 18 Z" fill="var(--text-secondary)" />
              <text x="18" y="31" textAnchor="middle" fill="var(--border-control)" fontSize="8">
                N
              </text>
            </svg>
            <span className="flex flex-col items-center gap-0.5">
              <span className="h-1 border border-t-0 border-control" style={{ width: bar.px }} />
              {bar.km} km
            </span>
          </div>

          <div className="absolute bottom-2.5 left-3.5 flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[12px] leading-4 text-ink-secondary">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 bg-data" />
              {LEGEND[0]}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 border border-data bg-data-mid" />
              {LEGEND[1]}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 border border-ink-secondary" />
              {LEGEND[2]}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-[18px] border-t border-select" />
              {LEGEND[3]}
            </span>
            {offMap > 0 ? <span className="text-ink-muted">{offMap} outside the map or without a postcode</span> : null}
          </div>
          <p className="absolute right-3.5 bottom-2.5 m-0 text-[12px] leading-4 text-ink-muted">{coords}</p>
        </>
      )}
    </div>
  );
}
