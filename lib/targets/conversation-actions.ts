import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { refresh } from "@/lib/vault/live";
import { requireWorkspace } from "@/lib/vault/workspace";
import { db, schema } from "@/lib/db";

// Confirm and Not them, for a conversation the AI matched to a possible
// company. Confirm moves the post onto the company's record as a signal and
// takes the conversation off the tab; Not them deletes the link.

type Result = { ok: true; message: string } | { ok: false; message: string };

const Id = z.string().uuid();
const l = schema.links;
const t = schema.targets;

function matchOf(workspaceId: string, conversationId: string) {
  return db
    .select({ linkId: l.id, companyId: l.toId, name: t.name })
    .from(l)
    .innerJoin(t, eq(t.id, l.toId))
    .where(and(eq(l.workspaceId, workspaceId), eq(l.fromId, conversationId), eq(l.kind, "possible_match")))
    .get();
}

export async function confirmMatch(conversationId: string): Promise<Result> {
  const workspaceId = requireWorkspace();
  if (!Id.safeParse(conversationId).success) return { ok: false, message: "That conversation is no longer here. Reload the page." };
  const match = matchOf(workspaceId, conversationId);
  if (!match) return { ok: false, message: "That match has already been settled. Reload the page." };

  const reviewed = db.transaction((tx) => {
    tx.update(schema.signals)
      .set({ targetId: match.companyId })
      .where(and(eq(schema.signals.targetId, conversationId), eq(schema.signals.type, "community_post")))
      .run();
    tx.update(l).set({ kind: "mentions", attributes: { confirmed: true } }).where(eq(l.id, match.linkId)).run();
    tx.update(t).set({ status: "matched" }).where(eq(t.id, conversationId)).run();
    // A discarded company comes back to New with the post as a new reason.
    const d = schema.decisions;
    tx.update(d)
      .set({ undoneAt: new Date().toISOString() })
      .where(and(eq(d.targetId, match.companyId), eq(d.decision, "discarded")))
      .run();
    return Boolean(tx.select({ id: schema.reviews.id }).from(schema.reviews).where(eq(schema.reviews.targetId, match.companyId)).get());
  });
  refresh();
  return {
    ok: true,
    message: reviewed ? `Moved to ${match.name} in New.` : `Moved to ${match.name}. It shows in New after the next run reviews it.`,
  };
}

export async function rejectMatch(conversationId: string): Promise<Result> {
  const workspaceId = requireWorkspace();
  if (!Id.safeParse(conversationId).success) return { ok: false, message: "That conversation is no longer here. Reload the page." };
  const match = matchOf(workspaceId, conversationId);
  if (match) db.delete(l).where(eq(l.id, match.linkId)).run();
  return { ok: true, message: "Match removed." };
}
