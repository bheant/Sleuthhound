"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { KeyStatus } from "@/components/ui/KeyField";
import { removeKey, saveKey } from "@/lib/credentials/actions";
import type { KeyService } from "@/lib/credentials/services";
import type { KeyRowData } from "./ConnectionsBoard";
import type { KeyState } from "./hub-model";

// One view of each key while an action is in flight, shared by Connections
// and Settings: "testing" and "removing" show at once, and a failed test's
// message stays beside the field.

type Pending = Partial<Record<KeyService, "testing" | "removing">>;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useKeyRows() {
  const [, startTransition] = useTransition();
  const [pending, setPending] = useOptimistic<Pending, Pending>({}, (s, change) => ({ ...s, ...change }));
  const [notices, setNotices] = useState<Partial<Record<KeyService, string | null>>>({});

  // A key left in "testing" by an interrupted request is treated as failed, so
  // its field stays usable.
  function keyState(row: KeyRowData): KeyState {
    return pending[row.service] ?? (row.status === "testing" ? "rejected" : row.status);
  }

  function fieldStatus(row: KeyRowData): KeyStatus {
    const p = pending[row.service];
    if (p === "testing") return "testing";
    if (p === "removing") return "off";
    return row.status === "testing" ? "rejected" : row.status;
  }

  function errorFor(row: KeyRowData): string | null {
    if (pending[row.service]) return null;
    if (row.service in notices) return notices[row.service] ?? null;
    if (row.status === "testing") return "The last test didn’t finish. Paste the key, then Test again.";
    return row.status === "rejected" ? row.message : null;
  }

  function test(service: KeyService, apiKey: string) {
    startTransition(async () => {
      setPending({ [service]: "testing" });
      const result = await saveKey(service, apiKey);
      startTransition(() => setNotices((n) => ({ ...n, [service]: result.ok ? null : result.message })));
    });
  }

  function remove(service: KeyService) {
    startTransition(async () => {
      setPending({ [service]: "removing" });
      // Let the hub line pull back into the centre before the node goes.
      await Promise.all([removeKey(service), wait(300)]);
      startTransition(() => setNotices((n) => ({ ...n, [service]: null })));
    });
  }

  return { keyState, fieldStatus, errorFor, test, remove };
}
