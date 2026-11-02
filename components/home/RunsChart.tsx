"use client";

import type { RunBar } from "@/lib/home/page";

type Props = {
  title: string;
  bars: RunBar[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const PLOT_PX = 180;

function ariaOf(b: RunBar): string {
  if (b.failed) return `${b.time} run: stopped, nothing fetched`;
  const waiting = b.waiting ? `, ${b.waiting} waiting` : "";
  return `${b.time} run: ${b.total} found, ${b.kept} kept, ${b.discarded} discarded${waiting}`;
}

// Leads found per run: one bar per run, kept at the bottom, discarded above,
// waiting as an outline on top. Clicking a bar switches Home's summary to that
// run; the selected bar has the yellow selection ring. Bars rise once, one
// after another.
export function RunsChart({ title, bars, selectedId, onSelect }: Props) {
  const max = Math.max(1, ...bars.map((b) => b.total));
  return (
    <section aria-labelledby="chart-h" className="min-w-0 flex-[1_1_420px]">
      <h2 id="chart-h" className="m-0 text-[15px] leading-[22px] font-normal text-ink-secondary">
        {title}
      </h2>
      {bars.length === 0 ? (
        <p className="mt-6 mb-0 text-[14px] leading-5 text-ink-muted">No runs to show yet.</p>
      ) : (
        <>
          <div className="mt-6 flex h-[220px] items-end gap-1.5 border-b border-strong">
            {bars.map((b, i) => {
              const selected = b.id === selectedId;
              const tone = b.failed ? "text-error-ink" : selected ? "text-select" : "text-ink-secondary group-hover:text-ink";
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-label={ariaOf(b)}
                  aria-pressed={b.failed ? undefined : selected}
                  aria-disabled={b.failed || undefined}
                  onClick={() => (b.failed ? undefined : onSelect(b.id))}
                  className={`group flex h-full min-w-0 flex-[1_1_0] flex-col items-stretch justify-end gap-1.5 border-0 bg-transparent p-0 font-sans ${b.failed ? "cursor-default" : "cursor-pointer"}`}
                >
                  <span className={`text-center text-[12px] leading-4 tabular-nums transition-colors duration-150 ${tone}`}>
                    {b.failed ? "–" : b.total}
                  </span>
                  <span
                    aria-hidden
                    className={`sh-bar flex flex-col transition-opacity duration-150 ${selected ? "opacity-100 outline outline-offset-2 outline-select" : "opacity-75 group-hover:opacity-100"}`}
                    style={{ height: `${(b.total / max) * PLOT_PX}px`, animationDelay: `${260 + i * 35}ms` }}
                  >
                    <span className="box-border border border-b-0 border-data" style={{ flex: `${b.waiting} 1 0` }} />
                    <span className="bg-rule" style={{ flex: `${b.discarded} 1 0` }} />
                    <span className="bg-data" style={{ flex: `${b.kept} 1 0` }} />
                  </span>
                </button>
              );
            })}
          </div>
          <div aria-hidden className="mt-2 flex gap-1.5">
            {bars.map((b) => (
              <span
                key={b.id}
                className={`min-w-0 flex-[1_1_0] overflow-hidden text-center text-[11px] leading-4 whitespace-nowrap tabular-nums ${
                  b.failed ? "text-error-ink" : b.id === selectedId ? "text-select" : "text-ink-muted"
                }`}
              >
                {b.label}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] leading-[18px] text-ink-secondary">
            <span className="flex items-center gap-2">
              <span aria-hidden className="size-3 bg-data" />
              Kept
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden className="size-3 bg-rule" />
              Discarded
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden className="box-border size-3 border border-data" />
              Waiting for you
            </span>
          </div>
        </>
      )}
    </section>
  );
}
