"use client";

import { useState } from "react";
import { ScoreFigure } from "./ScoreFigure";

// The phone list for companies and conversations: score, name, the AI's one
// line and where or how old, with Keep and Discard always showing. Tapping
// the row opens the full-screen detail. Eight rows show, then ten more a press.

export type PhoneRow = {
  id: string;
  score: number;
  title: string;
  /** The AI's one-line reason. */
  summary: string;
  /** "Hackney, 1 yr 2 mo" or "r/smallbusiness, 3 h ago". */
  meta: string;
  decided: boolean;
  /** Shown instead of Keep and Discard once decided, e.g. "Kept". */
  decidedLabel?: string;
};

type Props = {
  label: string;
  rows: PhoneRow[];
  selectedId: string | null;
  leavingId: string | null;
  onOpen: (id: string) => void;
  onDecide: (id: string, decision: "kept" | "discarded") => void;
};

const FIRST = 8;
const MORE = 10;

const square =
  "press relative z-[1] flex size-11 cursor-pointer items-center justify-center border border-strong bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-black";

export function PhoneList({ label, rows, selectedId, leavingId, onOpen, onDecide }: Props) {
  const [shown, setShown] = useState(FIRST);
  const visible = rows.slice(0, Math.max(shown, rows.findIndex((r) => r.id === selectedId) + 1));
  const left = rows.length - visible.length;

  return (
    <div className="md:hidden">
      <ul aria-label={label} className="m-0 list-none p-0 tabular-nums">
        {visible.map((row) => (
          <li
            key={row.id}
            data-row-id={row.id}
            data-sel={row.id === selectedId}
            data-leaving={row.id === leavingId}
            className="sh-row flex items-start gap-4 border-b border-subtle py-4 pr-0 pl-0"
          >
            <ScoreFigure score={row.score} className="w-8 shrink-0 pl-0 text-[17px] leading-6" />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                aria-label={`${row.title}, score ${row.score}`}
                onClick={() => onOpen(row.id)}
                className="sh-open block max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left font-sans text-[17px] leading-6 text-ink"
              >
                {row.title}
              </button>
              <p className="mt-1 mb-0 truncate text-[14px] leading-5 text-ink-secondary">{row.summary}</p>
              {row.meta ? <p className="mt-0.5 mb-0 text-[13px] leading-5 text-ink-muted">{row.meta}</p> : null}
            </div>
            {row.decided ? (
              row.decidedLabel ? (
                <span className="shrink-0 pt-0.5 text-[14px] text-ok">{row.decidedLabel}</span>
              ) : null
            ) : (
              <div className="flex shrink-0 gap-1">
                <button type="button" aria-label={`Keep ${row.title}`} onClick={() => onDecide(row.id, "kept")} className={square}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M2 7.5 5.5 11 12 3.5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
                <button type="button" aria-label={`Discard ${row.title}`} onClick={() => onDecide(row.id, "discarded")} className={square}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {left > 0 ? (
        <button
          type="button"
          onClick={() => setShown(visible.length + MORE)}
          className="press mt-6 h-[52px] w-full cursor-pointer border border-control bg-transparent font-sans text-[16px] text-ink hover:border-ink hover:bg-ink hover:text-black"
        >
          Show {Math.min(MORE, left)} more
        </button>
      ) : null}
    </div>
  );
}

/** The bar above a full-screen detail on phone: back to the list, and where this one sits in it. */
export function PhoneBack({ label, position, onBack }: { label: string; position: string | null; onBack: () => void }) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-subtle md:hidden">
      <button
        type="button"
        onClick={onBack}
        className="flex cursor-pointer items-center gap-3 border-0 bg-transparent p-0 font-sans text-[16px] text-ink hover:text-white"
      >
        <svg width="8" height="12" viewBox="0 0 8 12" fill="none" aria-hidden>
          <path d="M6.5 1 1.5 6l5 5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {label}
      </button>
      {position ? <span className="text-[14px] text-ink-muted tabular-nums">{position}</span> : null}
    </div>
  );
}
