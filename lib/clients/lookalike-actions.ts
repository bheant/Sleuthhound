import { sampleRefusal } from "@/lib/net/external";
import { z } from "zod";
import { refresh } from "@/lib/vault/live";
import { requireWorkspace } from "@/lib/vault/workspace";
import { canRunNow } from "@/lib/readiness";
import { activeRun, queueRun } from "@/lib/runs/queue";
import { setSetting } from "@/lib/settings";

// Find lookalikes on Clients: queues a run that searches for companies like
// each analysed client, then enriches and reviews what it finds. The daily
// setting does the same in the first scheduled run of each day.

type Result = { ok: true } | { ok: false; message: string };

export async function findLookalikesNow(): Promise<Result> {
  const sample = sampleRefusal();
  if (sample) return { ok: false, message: sample };
  const workspaceId = requireWorkspace();
  if (!canRunNow(workspaceId)) return { ok: false, message: "Connect Companies House and an AI on Connections first." };
  if (activeRun(workspaceId)) return { ok: false, message: "A run is going. Try again when it finishes." };
  queueRun(workspaceId, "manual", null, { lookalikes: true });
  refresh();
  return { ok: true };
}

export async function setDailyLookalikes(on: boolean): Promise<Result> {
  const workspaceId = requireWorkspace();
  setSetting(workspaceId, "lookalikes_daily", z.boolean().parse(on));
  refresh();
  return { ok: true };
}
