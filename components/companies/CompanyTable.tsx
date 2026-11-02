"use client";

import { formatAge } from "@/lib/targets/format";
import type { WorkspaceItem } from "@/lib/targets/types";
import { ScoreFigure } from "./ScoreFigure";

// Score, company, why, age and borough, sorted by score. The name button covers
// the row; Keep and Discard show on hover, focus and selection.

type Props = {
  label: string;
  rows: WorkspaceItem[];
  selectedId: string | null;
  leavingId: string | null;
  nowMs: number;
  onOpen: (id: string, fromKeyboard: boolean) => void;
  onDecide: (id: string, decision: "kept" | "discarded") => void;
};

const GRID = "grid grid-cols-[56px_minmax(180px,1.1fr)_minmax(0,1.4fr)_84px_130px_76px] items-center gap-5 px-3";

const actButton =
  "press flex size-8 cursor-pointer items-center justify-center border border-strong bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-black";

export function CompanyTable({ label, rows, selectedId, leavingId, nowMs, onOpen, onDecide }: Props) {
  const now = new Date(nowMs);
  return (
    <div className="overflow-x-auto">
      <div role="table" aria-label={label} className="min-w-[680px] tabular-nums">
        <div role="row" className={`${GRID} h-10 border-b border-rule text-[13px] leading-5 text-ink-muted`}>
          <span role="columnheader" aria-sort="descending">
            Score ↓
          </span>
          <span role="columnheader">Company</span>
          <span role="columnheader">Why</span>
          <span role="columnheader">Age</span>
          <span role="columnheader">Borough</span>
          <span role="columnheader">
            <span className="sr-only">Decide</span>
          </span>
        </div>
        {rows.map((row) => {
          const undecided = row.decision === null;
          return (
            <div
              key={row.id}
              role="row"
              data-row-id={row.id}
              data-sel={row.id === selectedId}
              data-leaving={row.id === leavingId}
              aria-selected={row.id === selectedId}
              className={`sh-row ${GRID} min-h-14`}
            >
              <span role="cell" className="text-[17px]">
                <ScoreFigure score={row.score} />
              </span>
              <span role="cell" className="min-w-0">
                <button
                  type="button"
                  aria-label={`${row.name}, score ${row.score}`}
                  onClick={(e) => onOpen(row.id, e.detail === 0)}
                  className="sh-open block max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left font-sans text-[16px] leading-6 text-ink"
                >
                  {row.name}
                </button>
              </span>
              <span role="cell" className="truncate text-[15px] text-ink-secondary" title={row.summary}>
                {row.summary}
              </span>
              <span role="cell" className="text-[15px] text-ink-secondary">
                {formatAge(row.incorporatedOn, now) ?? ""}
              </span>
              <span role="cell" className="truncate text-[15px] text-ink-secondary">
                {row.borough ?? ""}
              </span>
              <span role="cell" className={undecided ? "sh-acts flex justify-end gap-1" : "flex justify-end"}>
                {undecided ? (
                  <>
                    <button type="button" aria-label={`Keep ${row.name}`} title="Keep (Y)" onClick={() => onDecide(row.id, "kept")} className={actButton}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                        <path d="M2 7.5 5.5 11 12 3.5" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                    <button type="button" aria-label={`Discard ${row.name}`} title="Discard (N)" onClick={() => onDecide(row.id, "discarded")} className={actButton}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                        <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
