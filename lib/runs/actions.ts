import { sampleRefusal } from "@/lib/net/external";
import { refresh } from "@/lib/vault/live";
import { requireWorkspace } from "@/lib/vault/workspace";
import { canRunNow } from "@/lib/readiness";
import { ensureDefaultCompaniesHouseSource } from "@/lib/sources/defaults";
import { queueRun } from "./queue";

// Run now: queues a manual run for the runner to claim. Keys connected before
// phase 3 never got the default source, so make sure it exists first.
export async function runNow(): Promise<{ ok: boolean; message: string | null }> {
  const sample = sampleRefusal();
  if (sample) return { ok: false, message: sample };
  const workspaceId = requireWorkspace();
  if (!canRunNow(workspaceId)) {
    return { ok: false, message: "Connect Companies House and an AI on Connections to run." };
  }
  ensureDefaultCompaniesHouseSource(workspaceId);
  queueRun(workspaceId, "manual");
  refresh();
  return { ok: true, message: null };
}
