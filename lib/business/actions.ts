import { refresh } from "@/lib/vault/live";
import { requireWorkspace } from "@/lib/vault/workspace";
import { cleanBusinessName, MAX_BUSINESS_NAME } from "./name";
import { setBusinessName } from "./store";

/** Saves the business name from Settings; empty clears it. Every page shows it at once. */
export async function saveBusinessName(raw: string): Promise<{ ok: true; name: string | null } | { ok: false; message: string }> {
  if (raw.trim().length > MAX_BUSINESS_NAME) return { ok: false, message: `Keep it under ${MAX_BUSINESS_NAME} characters.` };
  const name = cleanBusinessName(raw);
  setBusinessName(requireWorkspace(), name);
  refresh();
  return { ok: true, name };
}
