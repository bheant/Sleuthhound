"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { useRunStatus } from "@/components/header/RunStatusProvider";
import type { StoppedRun } from "@/lib/runs/home";

// "The 15:00 run stopped": what happened, when, and the way out. A 1px error
// border, no red fill.
export function RunStopped({ stopped }: { stopped: StoppedRun }) {
  const { status, canRun, starting, start } = useRunStatus();
  const busy = starting || status.active !== null;
  return (
    <section
      role="alert"
      aria-labelledby="run-stopped-h"
      className="sh-in sh-d3 mx-gutter mt-24 flex flex-wrap items-end justify-between gap-x-12 gap-y-7 border border-error px-9 py-8"
    >
      <div className="max-w-[680px] flex-[1_1_480px]">
        <h2 id="run-stopped-h" className="m-0 text-[28px] leading-9 font-light tracking-[-0.01em]">
          {stopped.title}
        </h2>
        <p className="mt-3 mb-0 text-bright">{stopped.reason}</p>
        <p className="mt-3 mb-0 text-[14px] leading-5 text-ink-muted tabular-nums">{stopped.detail}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {stopped.keyHref ? (
          <Link href={stopped.keyHref} className={buttonClasses({ variant: "solid", size: "lg", className: "text-[17px]! no-underline hover:text-white" })}>
            Replace the key in Connections
          </Link>
        ) : null}
        <button
          type="button"
          onClick={start}
          disabled={!canRun || busy}
          title={canRun ? undefined : "Replace the key first, then run again."}
          className={buttonClasses({ size: "lg", className: "text-[16px]!" })}
        >
          {busy ? "Running" : "Run again"}
        </button>
      </div>
    </section>
  );
}
