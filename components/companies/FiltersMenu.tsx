"use client";

import { NO_FILTERS, type DeadlineFilter, type Filters } from "@/lib/targets/filters";

// The Filters popover: Score and Deadline as segmented toggles, Borough as
// checkboxes, then "Showing N of M" and Clear.

type Props = {
  filters: Filters;
  onChange: (f: Filters) => void;
  boroughs: string[];
  shown: number;
  total: number;
  active: number;
};

const SCORE: Array<{ v: number | null; label: string }> = [
  { v: null, label: "Any" },
  { v: 70, label: "70 and above" },
  { v: 80, label: "80 and above" },
];

const FUNDING: Array<{ v: boolean; label: string }> = [
  { v: false, label: "Any" },
  { v: true, label: "Raised money, last 12 months" },
];

const DEADLINE: Array<{ v: DeadlineFilter; label: string }> = [
  { v: "any", label: "Any" },
  { v: "overdue", label: "Overdue" },
  { v: "soon", label: "Next 3 months" },
];

const segment =
  "relative -ml-px h-9 min-w-0 flex-1 cursor-pointer border px-2.5 font-sans text-[14px] leading-5 whitespace-nowrap transition-colors duration-150 first:ml-0";
const segOn = "z-[1] cursor-default border-primary-edge bg-primary text-ink";
const segOff = "border-rule bg-transparent text-ink-secondary hover:z-[1] hover:border-control hover:text-ink";

function Segments<T>({ id, label, options, value, onPick }: { id: string; label: string; options: Array<{ v: T; label: string }>; value: T; onPick: (v: T) => void }) {
  return (
    <>
      <p id={id} className="m-0 text-[13px] leading-[18px] text-ink-muted">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={id} className="mt-2 flex">
        {options.map((o) => {
          const on = o.v === value;
          return (
            <button key={o.label} type="button" role="radio" aria-checked={on} onClick={() => onPick(o.v)} className={`${segment} ${on ? segOn : segOff}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function FiltersMenu({ filters, onChange, boroughs, shown, total, active }: Props) {
  const toggle = (b: string) =>
    onChange({ ...filters, boroughs: filters.boroughs.includes(b) ? filters.boroughs.filter((x) => x !== b) : [...filters.boroughs, b] });

  return (
    <div role="dialog" aria-label="Filters" className="sh-menu absolute top-[calc(100%+8px)] right-0 w-[384px] max-w-[calc(100vw-32px)] border border-strong bg-field px-5 pt-5 pb-4">
      <Segments id="f-score" label="Score" options={SCORE} value={filters.minScore} onPick={(v) => onChange({ ...filters, minScore: v })} />
      <div className="mt-5">
        <Segments id="f-deadline" label="Deadline" options={DEADLINE} value={filters.deadline} onPick={(v) => onChange({ ...filters, deadline: v })} />
      </div>
      <div className="mt-5">
        <Segments id="f-funding" label="Funding" options={FUNDING} value={filters.raised} onPick={(v) => onChange({ ...filters, raised: v })} />
      </div>
      <p id="f-borough" className="mt-5 mb-0 text-[13px] leading-[18px] text-ink-muted">
        Borough
      </p>
      {boroughs.length === 0 ? (
        <p className="mt-2 mb-0 text-[14px] text-ink-secondary">No boroughs in this list.</p>
      ) : (
        <div role="group" aria-labelledby="f-borough" className="mt-1 grid max-h-[288px] grid-cols-2 gap-x-4 overflow-y-auto">
          {boroughs.map((b) => {
            const on = filters.boroughs.includes(b);
            return (
              <button
                key={b}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(b)}
                className={`group flex h-8 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left font-sans text-[14px] leading-5 hover:text-ink ${on ? "text-ink" : "text-bright"}`}
              >
                <span
                  aria-hidden
                  className={`flex size-3.5 flex-none items-center justify-center border transition-colors duration-100 ${
                    on ? "border-primary-edge bg-primary-edge text-white" : "border-control text-transparent group-hover:border-ink-secondary"
                  }`}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5.2 4 7.6 8.5 2.6" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </span>
                <span className="truncate">{b}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-subtle pt-3.5 text-[14px] leading-5">
        <span className="text-ink-secondary tabular-nums">
          Showing {shown} of {total}
        </span>
        <button
          type="button"
          disabled={active === 0}
          onClick={() => onChange(NO_FILTERS)}
          className="link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-bright hover:text-ink disabled:cursor-default disabled:text-control"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
