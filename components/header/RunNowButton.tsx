"use client";

import { useVault } from "@/components/vault/useVault";
import { SAMPLE_OFFLINE } from "@/lib/net/external";
import { runFraction, useRunStatus } from "./RunStatusProvider";

// Disabled until Companies House and a default AI are connected. During a run
// the label reads "Running 2 of 4" and a 1px data line fills along the bottom
// edge as the run moves through its steps.
/** wide: the phone version, full width inside the page under its figures. */
export function RunNowButton({ wide = false }: { wide?: boolean }) {
  const size = wide ? "h-[52px] w-full text-[17px]" : "h-[52px] w-60 text-[18px]";
  const { status, canRun, starting, message, start } = useRunStatus();
  const sample = useVault().status === "demo";
  const active = status.active;

  if (!canRun && !active) {
    return (
      <button
        type="button"
        disabled
        title={sample ? SAMPLE_OFFLINE : "Connect Companies House and an AI on Connections to run."}
        className={`${size} cursor-default border border-strong bg-transparent text-ink-muted`}
      >
        Run now
      </button>
    );
  }

  const running = active?.status === "running";
  const busy = starting || active !== null;
  const label = running ? `Running ${Math.min(active.step, 4)} of 4` : busy ? "Queued" : "Run now";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={start}
      title={message ?? undefined}
      className={`press relative ${size} cursor-pointer overflow-hidden border bg-transparent tabular-nums disabled:cursor-default ${
        busy
          ? "border-control text-ink-secondary"
          : "border-bright text-ink hover:border-ink hover:bg-ink hover:text-black"
      }`}
    >
      <span aria-live="polite">{label}</span>
      {busy ? (
        <span
          aria-hidden
          className="sh-run-line absolute inset-x-0 bottom-0 h-px bg-data"
          style={{ transform: `scaleX(${runFraction(active)})` }}
        />
      ) : null}
    </button>
  );
}
