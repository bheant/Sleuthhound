"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { runNow } from "@/lib/runs/actions";
import { runStatus, type RunStatus } from "@/lib/runs/status";
import { refresh } from "@/lib/vault/live";
import { requireWorkspace } from "@/lib/vault/workspace";

// Shares the current run between the header's Run now and Home's step list.
// Reads the run from the database every 1.5 seconds while one is going and
// every 5 seconds otherwise, so a scheduled run shows up too. When a run
// finishes, the page refreshes to show what it found.

type Value = {
  status: RunStatus;
  canRun: boolean;
  starting: boolean;
  message: string | null;
  start: () => void;
};

const RunStatusContext = createContext<Value | null>(null);

const FAST_MS = 1_500;
const SLOW_MS = 5_000;

export function RunStatusProvider({ initial, canRun, children }: { initial: RunStatus; canRun: boolean; children: ReactNode }) {
  const [status, setStatus] = useState(initial);
  const [seenInitial, setSeenInitial] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const lastFinished = useRef(initial.lastFinishedId);

  // A refresh (after a run step or an action) brings newer data.
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setStatus(initial);
  }

  const busy = status.active !== null || starting;

  useEffect(() => {
    let stopped = false;
    const timer = setInterval(() => {
      if (stopped) return;
      let next: RunStatus;
      try {
        next = runStatus(requireWorkspace());
      } catch {
        return; // Locked: the vault screen takes over.
      }
      setStatus(next);
      if (next.lastFinishedId !== lastFinished.current) {
        lastFinished.current = next.lastFinishedId;
        refresh();
      }
    }, busy ? FAST_MS : SLOW_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [busy]);

  function start() {
    setMessage(null);
    startTransition(async () => {
      const result = await runNow();
      if (!result.ok) setMessage(result.message);
    });
  }

  return (
    <RunStatusContext.Provider value={{ status, canRun, starting, message, start }}>{children}</RunStatusContext.Provider>
  );
}

export function useRunStatus(): Value {
  const value = useContext(RunStatusContext);
  if (!value) throw new Error("useRunStatus must be used inside RunStatusProvider.");
  return value;
}

/** How far along the run is, 0 to 1, including progress within the step. */
export function runFraction(active: RunStatus["active"]): number {
  if (!active || active.status !== "running") return 0;
  const within = active.progress && active.progress.total > 0 ? active.progress.done / active.progress.total : 0;
  return Math.min(1, (active.step - 1 + within) / 4);
}
