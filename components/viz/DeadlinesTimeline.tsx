"use client";

import { useEffect, useMemo, useRef } from "react";
import { formatShortDate } from "@/lib/format/time";
import type { WorkspaceItem } from "@/lib/targets/types";

// The Deadlines tab: one row per company with a filing date, on an axis from a
// month ago to six months ahead. Overdue filings are orange; the selected row
// is yellow. Dates outside the axis sit at its edge with their real date.

type Props = {
  items: WorkspaceItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  nowMs: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROW_H = 34;
const HEAD_H = 36;

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

export function DeadlinesTimeline({ items, selectedId, onSelect, nowMs }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date(nowMs), [nowMs]);
  const t0 = addMonths(today, -1).getTime();
  const t1 = addMonths(today, 6).getTime();
  const pos = (ms: number) => ((ms - t0) / (t1 - t0)) * 100;
  const clamp = (p: number) => Math.max(0, Math.min(100, p));
  const todayP = pos(nowMs);

  const months = useMemo(() => {
    const out: Array<{ p: number; label: string }> = [];
    for (let i = 0; i <= 7; i++) {
      const m = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const p = ((m.getTime() - t0) / (t1 - t0)) * 100;
      // Leave room for the "Today" marker.
      if (p < 0 || p > 96 || Math.abs(p - todayP) < 7) continue;
      out.push({ p, label: `${MONTHS[m.getMonth()]}${m.getMonth() === 0 || out.length === 0 ? ` ${m.getFullYear()}` : ""}` });
    }
    return out;
  }, [today, t0, t1, todayP]);

  const rows = useMemo(
    () =>
      items
        .filter((i) => i.deadline)
        .sort((a, b) => a.deadline!.dueAt.localeCompare(b.deadline!.dueAt)),
    [items],
  );

  // Keep the selected row in view inside the band, without scrolling the page.
  useEffect(() => {
    const el = scroller.current;
    const i = rows.findIndex((r) => r.id === selectedId);
    if (!el || i < 0) return;
    const top = HEAD_H + i * ROW_H;
    if (top < el.scrollTop + HEAD_H) el.scrollTop = top - HEAD_H;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
  }, [rows, selectedId]);

  if (rows.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <p className="m-0 text-[15px] leading-[22px] text-ink-secondary">No filing deadlines for the companies in this list.</p>
      </div>
    );
  }

  return (
    <div ref={scroller} className="sh-vfade absolute inset-0 overflow-auto bg-black">
      <div role="table" aria-label={`Filing deadlines for ${rows.length} ${rows.length === 1 ? "company" : "companies"}`} className="min-w-[820px]">
        <div
          role="row"
          className="sticky top-0 z-[2] grid h-9 grid-cols-[300px_minmax(0,1fr)] items-end border-b border-faint bg-black text-[12px] leading-4 text-ink-muted"
        >
          <span role="columnheader" className="px-3 pb-2">
            Company
          </span>
          <div role="columnheader" className="relative h-9">
            <span className="sr-only">Due date</span>
            {months.map((m) => (
              <span
                key={m.label}
                aria-hidden
                className="absolute bottom-2 border-l border-rule pl-1.5 whitespace-nowrap"
                style={{ left: `${m.p}%` }}
              >
                {m.label}
              </span>
            ))}
            <span
              aria-hidden
              className="absolute top-0.5 -translate-x-1/2 bg-ink px-1.5 text-[11px] leading-[15px] whitespace-nowrap text-black"
              style={{ left: `${todayP}%` }}
            >
              Today {today.getDate()} {MONTHS[today.getMonth()]}
            </span>
          </div>
        </div>
        {rows.map((r) => {
          const d = r.deadline!;
          const isSel = r.id === selectedId;
          const p = clamp(pos(new Date(d.dueAt).getTime()));
          // Past dates label after the today line, clear of their bar.
          const labelAt = p < todayP ? todayP : p;
          const colour = d.overdue ? "var(--status-overdue)" : isSel ? "var(--select)" : "var(--border-bright)";
          const bar = d.overdue ? "var(--overdue-edge)" : isSel ? "var(--select-dim)" : "var(--border-default)";
          const date = d.overdue ? `Overdue since ${formatShortDate(d.dueAt)}` : formatShortDate(d.dueAt);
          return (
            <div
              key={r.id}
              role="row"
              aria-selected={isSel}
              className={`grid h-[34px] grid-cols-[300px_minmax(0,1fr)] items-center border-b border-faint transition-colors duration-150 ${
                isSel ? "bg-row-selected" : "hover:bg-row-hover"
              }`}
            >
              <div role="cell" className="flex min-w-0 items-baseline gap-2 px-3">
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className={`min-w-0 flex-[0_1_auto] cursor-pointer truncate border-0 bg-transparent p-0 text-left font-sans text-[14px] leading-5 ${
                    isSel ? "text-select" : "text-ink"
                  }`}
                >
                  {r.name}
                </button>
                <span className="min-w-0 flex-[0_1_auto] truncate text-[12px] leading-4 text-ink-muted">{d.label}</span>
              </div>
              <div role="cell" className="relative h-[34px]">
                <span aria-hidden className="absolute inset-y-0 border-l border-dashed border-strong" style={{ left: `${todayP}%` }} />
                <span
                  aria-hidden
                  className="absolute top-4 h-0.5"
                  style={{ left: `${Math.min(p, todayP)}%`, width: `${Math.abs(p - todayP)}%`, background: bar }}
                />
                <span
                  aria-hidden
                  className="absolute top-[17px] size-[9px] -translate-x-1/2 -translate-y-1/2 rotate-45"
                  style={{ left: `${p}%`, background: colour }}
                />
                <span
                  className="absolute top-[17px] text-[12px] leading-4 whitespace-nowrap"
                  style={{ left: `${labelAt}%`, color: colour, transform: `translate(${p > 78 ? "calc(-100% - 12px)" : "8px"}, -50%)` }}
                >
                  {date}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
