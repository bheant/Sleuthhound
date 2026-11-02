import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace } from "@/lib/vault/workspace";
import { db, schema } from "@/lib/db";
import { NOTE_MAX, REASONS } from "./reasons";

// Keep, Discard and Undo. The workspace updates optimistically and calls these;
// they never revalidate, so a quick run of decisions doesn't redraw the page
// under the user. A failure comes back as a message and the client rolls back.

type Result = { ok: true } | { ok: false; message: string };

const Id = z.string().uuid();
const DecisionInput = z.object({ targetId: Id, decision: z.enum(["kept", "discarded"]) });

function ownsTarget(workspaceId: string, targetId: string): boolean {
  const t = schema.targets;
  return Boolean(
    db.select({ id: t.id }).from(t).where(and(eq(t.id, targetId), eq(t.workspaceId, workspaceId))).get(),
  );
}

export async function decideTarget(targetId: string, decision: "kept" | "discarded"): Promise<Result> {
  const workspaceId = requireWorkspace();
  const input = DecisionInput.safeParse({ targetId, decision });
  if (!input.success || !ownsTarget(workspaceId, input.data.targetId)) {
    return { ok: false, message: "That company is no longer here. Reload the page." };
  }
  db.insert(schema.decisions)
    .values({ targetId: input.data.targetId, decision: input.data.decision })
    .run();
  return { ok: true };
}

const ReasonInput = z.object({
  targetId: Id,
  reason: z.enum(REASONS).nullable(),
  note: z.string().trim().max(NOTE_MAX, `Keep the note under ${NOTE_MAX} characters.`).nullable(),
});

/**
 * Sets, changes or clears why the current discard was made. The note is kept
 * only with Other. Undo clears it, since the undone decision no longer counts.
 */
export async function setDiscardReason(targetId: string, reason: string | null, note: string | null = null): Promise<Result> {
  const workspaceId = requireWorkspace();
  const input = ReasonInput.safeParse({ targetId, reason, note });
  if (!input.success) return { ok: false, message: input.error.issues[0]?.message ?? "That reason didn’t save." };
  if (!ownsTarget(workspaceId, input.data.targetId)) {
    return { ok: false, message: "That company is no longer here. Reload the page." };
  }
  const d = schema.decisions;
  const latest = db
    .select({ id: d.id, decision: d.decision })
    .from(d)
    .where(and(eq(d.targetId, input.data.targetId), isNull(d.undoneAt)))
    .orderBy(desc(d.decidedAt))
    .get();
  if (latest?.decision !== "discarded") return { ok: false, message: "Only a discarded company can have a reason." };
  const keepNote = input.data.reason === "other" && input.data.note ? input.data.note : null;
  db.update(d).set({ reason: input.data.reason, note: keepNote }).where(eq(d.id, latest.id)).run();
  return { ok: true };
}

/** Undoes the current decision, which moves the company back to New. */
export async function undoDecision(targetId: string): Promise<Result> {
  const workspaceId = requireWorkspace();
  const id = Id.safeParse(targetId);
  if (!id.success || !ownsTarget(workspaceId, id.data)) {
    return { ok: false, message: "That company is no longer here. Reload the page." };
  }
  const d = schema.decisions;
  const latest = db
    .select({ id: d.id })
    .from(d)
    .where(and(eq(d.targetId, id.data), isNull(d.undoneAt)))
    .orderBy(desc(d.decidedAt))
    .get();
  if (latest) {
    db.update(d).set({ undoneAt: new Date().toISOString() }).where(eq(d.id, latest.id)).run();
  }
  return { ok: true };
}
