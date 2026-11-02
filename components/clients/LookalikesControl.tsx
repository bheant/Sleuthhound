"use client";

import { refresh } from "@/lib/vault/live";
import { useState, useTransition } from "react";
import { useRunStatus } from "@/components/header/RunStatusProvider";
import { buttonClasses } from "@/components/ui/Button";
import { findLookalikesNow, setDailyLookalikes } from "@/lib/clients/lookalike-actions";

// Find lookalikes, with the daily setting beside it. The button waits while
// any run is going, since a search is a run of its own.

type Props = { daily: boolean; lastAt: string | null; analysed: number };

export function LookalikesControl({ daily, lastAt, analysed }: Props) {
  const { status, canRun } = useRunStatus();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isDaily, setIsDaily] = useState(daily);
  const running = status.active !== null;
  const searching = status.active?.lookalikes ?? false;
  const disabled = pending || running || !canRun || analysed === 0;

  const hint = !canRun
    ? "Connect Companies House and an AI to search"
    : analysed === 0
      ? "Available once a client is analysed"
      : searching
        ? "Searching for companies like your clients. New leads appear on the radar as they’re reviewed."
        : running
          ? "A run is going. Search when it finishes."
          : lastAt
          ? `Last searched ${lastAt}`
          : null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-[14px] leading-5 text-ink-secondary">
        <input
          type="checkbox"
          checked={isDaily}
          onChange={(e) => {
            const on = e.target.checked;
            setIsDaily(on);
            start(async () => {
              await setDailyLookalikes(on);
            });
          }}
          className="m-0 size-4 cursor-pointer accent-primary-edge"
        />
        Search daily
      </label>
      <button
        type="button"
        disabled={disabled}
        title={hint ?? undefined}
        onClick={() => {
          setMessage(null);
          start(async () => {
            const result = await findLookalikesNow();
            if (!result.ok) setMessage(result.message);
            else refresh();
          });
        }}
        className={buttonClasses({ variant: "outline", size: "sm", edge: "bright" })}
      >
        {searching ? "Searching…" : "Find lookalikes"}
      </button>
      {message ? (
        <p role="alert" className="m-0 w-full text-right text-[13px] leading-5 text-error-ink max-md:text-left">
          {message}
        </p>
      ) : hint ? (
        <p className="m-0 w-full text-right text-[13px] leading-5 text-ink-muted max-md:text-left">{hint}</p>
      ) : null}
    </div>
  );
}
