import { z } from "zod";
import { refresh } from "@/lib/vault/live";
import { requireWorkspace } from "@/lib/vault/workspace";
import { getSetting, setSetting } from "@/lib/settings";

// The ideal-client text. Typing in the box saves it (debounced in the
// browser) and marks it edited by the user, so Claude's rewrites from the
// clients are held back as suggestions instead of overwriting it.

type Result = { ok: true; meta: string } | { ok: false; message: string };

const Text = z.string().trim().min(20, "Write at least a sentence, so the AI has something to score against.").max(1200, "Keep it under 1,200 characters.");

export async function saveIdealClient(text: string): Promise<Result> {
  const workspaceId = requireWorkspace();
  const parsed = Text.safeParse(text);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the text." };
  const current = getSetting(workspaceId, "ideal_client");
  if (current.text === parsed.data) return { ok: true, meta: "Saved" };
  const editedAt = new Date().toISOString();
  setSetting(workspaceId, "ideal_client", { ...current, text: parsed.data, edited_by_user: true, edited_at: editedAt });
  return { ok: true, meta: "Saved. The next run scores against this." };
}

/** Takes Claude's suggested rewrite, which hands the text back to Claude. */
export async function applyIdealSuggestion(): Promise<Result> {
  const workspaceId = requireWorkspace();
  const suggestion = getSetting(workspaceId, "ideal_client_suggestion");
  if (!suggestion.text) return { ok: false, message: "There’s no suggestion to apply." };
  setSetting(workspaceId, "ideal_client", {
    text: suggestion.text,
    edited_by_user: false,
    written_at: suggestion.written_at,
    client_count: suggestion.client_count,
  });
  setSetting(workspaceId, "ideal_client_suggestion", { text: "", client_count: 0, written_at: "" });
  refresh();
  return { ok: true, meta: "Applied" };
}

export async function dismissIdealSuggestion(): Promise<Result> {
  const workspaceId = requireWorkspace();
  setSetting(workspaceId, "ideal_client_suggestion", { text: "", client_count: 0, written_at: "" });
  refresh();
  return { ok: true, meta: "Dismissed" };
}
