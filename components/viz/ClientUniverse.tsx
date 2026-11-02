"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePhone } from "@/components/ui/usePhone";
import type { Universe } from "@/lib/clients/types";
import { shortName } from "@/lib/targets/format";
import { EDGE, layoutUniverse, radiusFor, UCX, UCY, UH, UW } from "./universe-layout";

// The client universe on Clients, clustered by type: each type is one box
// around the ideal client, sized by its clients and labelled with its leads.
// Only the selected type's leads show, better fits nearer the centre; today's
// are small squares joined to their type by yellow lines. On phone the plate
// shows the middle 680 units of the 1344-wide space, which holds every type
// box, so the rings stay round at a usable size.

type Props = {
  universe: Universe;
  selected: string | null;
  onSelect: (segment: string) => void;
  /** Find lookalikes, beside the figures. */
  action?: ReactNode;
};

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const FULL = { x0: 0, w: UW };
const PHONE = { x0: UCX - 340, w: 680 };
const GRID_X = [96, 192, 288, 384, 480, 576, 768, 864, 960, 1056, 1152, 1248];
const GRID_Y = [75, 150, 225, 375, 450, 525];
const RINGS = [90, 80, 70, 60];

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function ClientUniverse({ universe, selected, onSelect, action }: Props) {
  const { boxes, dots } = layoutUniverse(universe.segments, selected);
  const sel = boxes.find((b) => b.selected);
  const { totals } = universe;
  const view = usePhone() ? PHONE : FULL;
  const left = (x: number) => pct(x - view.x0, view.w);

  let status: string;
  if (boxes.length === 0) status = "Client types appear here once your clients are analysed.";
  else if (!sel) status = "Pick a type to see its leads.";
  else if (sel.leads === 0) status = `${sel.name}: ${plural(sel.clients, "client")}, no lookalike leads in the last 8 weeks yet. Find lookalikes to look for some.`;
  else status = `${sel.name}: ${plural(sel.clients, "client")}, ${plural(sel.leads, "lead")} in the last 8 weeks, ${sel.today} of them today. Pick another type to see its leads.`;

  return (
    <section aria-labelledby="universe-h" className="mx-gutter mt-[144px] max-md:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-4 border-b border-rule pb-6">
        <h2 id="universe-h" className="m-0 text-[40px] leading-[44px] font-light tracking-[-0.02em] max-md:text-[32px] max-md:leading-10">
          Client universe
        </h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[14px] leading-5 text-ink-secondary tabular-nums">
            <span>{plural(totals.clients, "client")}</span>
            <span>{plural(totals.leads, "lookalike lead")}, last 8 weeks</span>
            <span>{totals.today} today</span>
          </p>
          {action}
        </div>
      </div>

      <div className="relative mt-6 overflow-hidden border border-faint bg-plate md:min-h-[360px]" style={{ aspectRatio: `${view.w} / ${UH}` }}>
        <svg aria-hidden viewBox={`${view.x0} 0 ${view.w} ${UH}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path
            d={[...GRID_X.map((x) => `M${x} 0V${UH}`), ...GRID_Y.map((y) => `M0 ${y}H${UW}`)].join("")}
            stroke="var(--plate-grid)"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          <path d={`M${UCX} 0V${UH}M0 ${UCY}H${UW}`} stroke="var(--border-default)" fill="none" vectorEffect="non-scaling-stroke" />
          {RINGS.map((score) => (
            <ellipse
              key={score}
              cx={UCX}
              cy={UCY}
              rx={radiusFor(score)}
              ry={radiusFor(score)}
              fill="none"
              stroke={score === 60 ? "var(--border-default)" : "var(--border-subtle)"}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <ellipse cx={UCX} cy={UCY} rx={EDGE} ry={EDGE} fill="none" stroke="var(--border-subtle)" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />
          {sel
            ? dots
                .filter((d) => d.today)
                .map((d) => (
                  <line key={d.id} x1={sel.x} y1={sel.y} x2={d.x} y2={d.y} stroke="var(--select)" strokeOpacity={0.8} vectorEffect="non-scaling-stroke" />
                ))
            : null}
        </svg>
        {RINGS.map((score) => (
          <span
            key={score}
            aria-hidden
            className="absolute pl-1.5 text-[11px] leading-[14px] text-control"
            style={{ left: left(UCX), top: pct(UCY - radiusFor(score) - 14, UH) }}
          >
            {score === 90 ? "Score 90" : score}
          </span>
        ))}

        <svg aria-hidden width="44" height="44" viewBox="-300 -300 600 600" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-logo">
          <circle r="206" fill="none" stroke="currentColor" strokeWidth="30" />
          <path fill="currentColor" d="M-15 -294h30v186h-30zM-15 108h30v186h-30zM-294 -15h186v30h-186zM108 -15h186v30h-186z" />
        </svg>
        <span aria-hidden className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-7 text-[11px] whitespace-nowrap text-ink-muted">
          Ideal client
        </span>

        <div key={selected ?? "none"} className="sh-swap absolute inset-0">
          {dots.map((d) =>
            d.today ? (
              <Link
                key={d.id}
                href={`/companies?c=${d.id}`}
                aria-label={`${d.name}, score ${d.score}, found today. Opens on Companies.`}
                className="absolute flex -translate-x-[5px] -translate-y-[5px] items-center gap-1.5 no-underline"
                style={{ left: left(d.x), top: pct(d.y, UH) }}
              >
                <span className={`size-2.5 shrink-0 border border-data ${d.score >= 80 ? "bg-data" : "bg-data-mid"}`} />
                {d.labelled ? (
                  <span className="bg-plate/70 px-1 text-[11px] leading-[15px] whitespace-nowrap text-ink">
                    {shortName(d.name)} {d.score}
                  </span>
                ) : null}
              </Link>
            ) : (
              <span
                key={d.id}
                aria-hidden
                className="absolute size-[5px] -translate-x-1/2 -translate-y-1/2 bg-control"
                style={{ left: left(d.x), top: pct(d.y, UH) }}
              />
            ),
          )}
        </div>

        {boxes.map((b) => (
          <div key={b.name} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: left(b.x), top: pct(b.y, UH) }}>
            <button
              type="button"
              aria-pressed={b.selected}
              aria-label={`${b.name}: ${plural(b.clients, "client")}, ${plural(b.leads, "lead")} in 8 weeks, ${b.today} today`}
              onClick={() => onSelect(b.name)}
              className="group relative block cursor-pointer border-0 bg-transparent p-0 font-sans"
            >
              <span
                className={`flex items-center justify-center border bg-field text-[16px] leading-5 tabular-nums transition-colors duration-150 ${
                  b.selected ? "border-select text-select" : "border-data text-ink group-hover:border-ink"
                }`}
                style={{ width: b.size, height: b.size }}
              >
                {b.clients}
              </span>
              <span
                className={`absolute left-1/2 -translate-x-1/2 text-[12px] leading-4 whitespace-nowrap ${b.labelAbove ? "bottom-full mb-2" : "top-full mt-2"} ${
                  b.selected ? "text-ink" : "text-ink-secondary"
                }`}
              >
                {b.name}, {plural(b.leads, "lead")}
              </span>
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] leading-[18px] text-ink-secondary">
        <span className="flex items-center gap-2">
          <span className="size-3.5 border border-data bg-field" />
          Client type, sized by number of clients
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 bg-data" />
          Today’s lead
        </span>
        <span className="flex items-center gap-2">
          <span className="size-[5px] bg-control" />
          Earlier lead, last 8 weeks
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 border-t border-select" />
          Selected type and its leads today
        </span>
        <span>Leads show for the selected type only. Score 90 sits near the middle, 60 at the outer ring.</span>
      </div>
      <p role="status" className="mt-6 mb-0 text-[15px] leading-[22px] text-bright tabular-nums">
        {status}
        {universe.unsorted > 0 ? ` ${plural(universe.unsorted, "client")} not analysed yet, so not on the radar.` : ""}
      </p>
    </section>
  );
}
