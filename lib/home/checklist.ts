import { and, eq } from "drizzle-orm";
import { getBusinessName } from "@/lib/business/store";
import { db, schema } from "@/lib/db";
import { refresh } from "@/lib/vault/live";
import { requireWorkspace } from "@/lib/vault/workspace";
import { getSetting, setSetting } from "@/lib/settings";

// The first-run checklist on Home: three things a new account needs before
// its first useful run. Each ticks itself off from the data, so it's always
// true; the list goes once all three are done, or when hidden.

export type ChecklistItem = { key: "business" | "key" | "source"; done: boolean };

export type Checklist = { items: ChecklistItem[]; show: boolean };

export function setupChecklist(workspaceId: string): Checklist {
  const c = schema.credentials;
  const s = schema.sources;
  const items: ChecklistItem[] = [
    { key: "business", done: getBusinessName(workspaceId) !== null },
    {
      key: "key",
      done: Boolean(db.select({ id: c.id }).from(c).where(and(eq(c.workspaceId, workspaceId), eq(c.status, "connected"))).limit(1).get()),
    },
    { key: "source", done: Boolean(db.select({ id: s.id }).from(s).where(and(eq(s.workspaceId, workspaceId), eq(s.isDemo, 0))).limit(1).get()) },
  ];
  const show = !getSetting(workspaceId, "setup_checklist_dismissed") && items.some((i) => !i.done);
  return { items, show };
}

export async function hideChecklist(): Promise<void> {
  setSetting(requireWorkspace(), "setup_checklist_dismissed", true);
  refresh();
}
