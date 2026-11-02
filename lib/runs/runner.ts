import { executeRun } from "@/lib/pipeline/run";
import { refresh } from "@/lib/vault/live";
import { holdOpen } from "@/lib/vault/session";
import { claimNextRun, failStaleRuns, queueScheduledRuns } from "./queue";

// Runs happen in the tab that holds the vault, while it's open: this takes
// the old server worker's place. Every couple of seconds it claims the oldest queued run
// and runs it; once a minute it queues a run for any source whose next run
// time has passed, which catches up on schedules missed while Sleuthhound
// was closed. One run at a time, and the vault stays unlocked until it ends.

const CLAIM_EVERY_MS = 2_000;
const SCHEDULE_EVERY_MS = 60_000;

let running = false;

export function isRunning(): boolean {
  return running;
}

async function tick() {
  if (running) return;
  failStaleRuns();
  const runId = claimNextRun();
  if (!runId) return;
  running = true;
  const release = holdOpen();
  refresh();
  try {
    await executeRun(runId);
  } catch {
    // Locked or closed mid-run: the next unlock marks it as cut off.
  } finally {
    running = false;
    release();
    refresh();
  }
}

function schedule() {
  try {
    queueScheduledRuns();
  } catch {
    // Locked between ticks: the next start picks it up.
  }
}

// Leaving the page during a run asks first, since the run stops with it.
function warnOnLeave(event: BeforeUnloadEvent) {
  if (running) event.preventDefault();
}

/** Starts running queued and scheduled runs. Returns the function that stops it. */
export function startRunner(): () => void {
  // Nothing can be running yet in this tab, so a run marked running was cut
  // off when Sleuthhound was last locked or closed.
  if (!running) failStaleRuns({ all: true });
  schedule();
  void tick();
  const claimTimer = setInterval(() => void tick(), CLAIM_EVERY_MS);
  const scheduleTimer = setInterval(schedule, SCHEDULE_EVERY_MS);
  window.addEventListener("beforeunload", warnOnLeave);
  return () => {
    clearInterval(claimTimer);
    clearInterval(scheduleTimer);
    window.removeEventListener("beforeunload", warnOnLeave);
  };
}
