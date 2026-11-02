"use client";

import type { ReactNode } from "react";
import { useRunStatus } from "@/components/header/RunStatusProvider";

// Home's date line. While a run is going it lists the four steps: done ones
// with a tick and their note, the current one with a pulsing dot, the rest
// muted. Otherwise it shows `idle`, e.g. "Last run 14:00, next run 15:00".
export function RunSteps({ idle }: { idle: ReactNode }) {
  const { status } = useRunStatus();
  const active = status.active;
  if (!active) return <>{idle}</>;

  const current = active.status === "running" ? active.step : 1;
  return (
    <ol aria-label="Run in progress" className="sh-swap mt-2.5 mb-0 flex list-none flex-col gap-1.5 p-0 text-[14px] leading-5 tabular-nums">
      {status.labels.map((name, i) => {
        const n = i + 1;
        const done = n < current;
        const now = n === current;
        const note = done
          ? active.notes[i]
          : now
            ? active.progress && n === 3
              ? `${active.progress.done} of ${active.progress.total}`
              : "running"
            : null;
        return (
          <li key={name} className={`flex items-center gap-2.5 ${done || now ? "text-ink" : "text-ink-muted"}`}>
            <span aria-hidden className="flex size-3 flex-none items-center justify-center">
              {done ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6.2 4.8 9 10 3" stroke="var(--status-ok)" strokeWidth="1.5" />
                </svg>
              ) : now ? (
                <span className="sh-pulse size-2 rounded-full bg-data" />
              ) : (
                <span className="size-2 rounded-full border border-strong" />
              )}
            </span>
            <span>{name}</span>
            {note ? <span className="text-ink-muted">{note}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
