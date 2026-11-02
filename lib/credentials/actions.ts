import { sampleRefusal } from "@/lib/net/external";
import { z } from "zod";
import { AI_PROVIDERS, type AiProvider } from "@/lib/ai/provider";
import { refresh } from "@/lib/vault/live";
import { requireWorkspace } from "@/lib/vault/workspace";
import { getSetting, setSetting } from "@/lib/settings";
import { ensureDefaultCompaniesHouseSource } from "@/lib/sources/defaults";
import { testKey } from "./key-tests";
import { apiKeySchema, keyServiceSchema, type KeyService } from "./services";
import { credentialViews, deleteKey, readKey, recordKeyTest, setKeyStatus, storeKey } from "./store";

// Actions for the Connections page. They return only an outcome and a
// plain message: never the key, its ciphertext or an upstream error object.

export type KeyActionResult = { ok: boolean; message: string | null };

const keyInput = z.object({ service: keyServiceSchema, apiKey: apiKeySchema });
const aiProviderSchema = z.enum(AI_PROVIDERS);

const isAi = (service: KeyService): service is AiProvider => aiProviderSchema.safeParse(service).success;

async function runTest(workspaceId: string, service: KeyService, apiKey: string): Promise<KeyActionResult> {
  const reviewModel = isAi(service) ? getSetting(workspaceId, "ai_models")[service].review : "";
  const result = await testKey(service, apiKey, reviewModel);
  recordKeyTest(workspaceId, service, result);
  if (result.ok && service === "companies_house") ensureDefaultCompaniesHouseSource(workspaceId);
  // The first AI to connect becomes the default when the default isn't connected.
  if (result.ok && isAi(service) && !connectedAis(workspaceId).includes(getSetting(workspaceId, "default_ai"))) {
    setSetting(workspaceId, "default_ai", service);
  }
  // The header's Run now and the hub both depend on key status.
  refresh();
  return { ok: result.ok, message: result.message };
}

// Encrypts and stores the key, tests it, then marks it connected or rejected.
// Replacing a key is the same: the new key takes the old one's place.
export async function saveKey(service: KeyService, apiKey: string): Promise<KeyActionResult> {
  const sample = sampleRefusal();
  if (sample) return { ok: false, message: sample };
  const workspaceId = requireWorkspace();
  const parsed = keyInput.safeParse({ service, apiKey });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the key." };

  storeKey(workspaceId, parsed.data.service, parsed.data.apiKey);
  return runTest(workspaceId, parsed.data.service, parsed.data.apiKey);
}

// Tests the stored key again without the browser sending it.
export async function testStoredKey(service: KeyService): Promise<KeyActionResult> {
  const sample = sampleRefusal();
  if (sample) return { ok: false, message: sample };
  const workspaceId = requireWorkspace();
  const parsed = keyServiceSchema.safeParse(service);
  if (!parsed.success) return { ok: false, message: "Unknown service." };

  const apiKey = readKey(workspaceId, parsed.data);
  if (!apiKey) return { ok: false, message: "No key is stored. Paste one, then Test." };
  setKeyStatus(workspaceId, parsed.data, "testing");
  return runTest(workspaceId, parsed.data, apiKey);
}

export async function removeKey(service: KeyService): Promise<KeyActionResult> {
  const workspaceId = requireWorkspace();
  const parsed = keyServiceSchema.safeParse(service);
  if (!parsed.success) return { ok: false, message: "Unknown service." };

  deleteKey(workspaceId, parsed.data);
  handOverDefault(workspaceId, parsed.data);
  refresh();
  return { ok: true, message: null };
}

const connectedAis = (workspaceId: string) =>
  credentialViews(workspaceId)
    .filter((c) => c.status === "connected")
    .map((c) => c.service)
    .filter((s): s is AiProvider => aiProviderSchema.safeParse(s).success);

// Removing the default AI's key hands reviews to another connected AI, so runs
// keep going; with none connected, runs pause until one is.
function handOverDefault(workspaceId: string, removed: KeyService) {
  if (getSetting(workspaceId, "default_ai") !== removed) return;
  const next = AI_PROVIDERS.find((p) => connectedAis(workspaceId).includes(p));
  if (next) setSetting(workspaceId, "default_ai", next);
}

// The default AI does every review; only a connected AI can be the default.
export async function setDefaultAi(provider: string): Promise<KeyActionResult> {
  const workspaceId = requireWorkspace();
  const parsed = aiProviderSchema.safeParse(provider);
  if (!parsed.success) return { ok: false, message: "Unknown AI." };
  if (!connectedAis(workspaceId).includes(parsed.data)) {
    return { ok: false, message: "Connect this AI before making it the default." };
  }

  setSetting(workspaceId, "default_ai", parsed.data);
  refresh();
  return { ok: true, message: null };
}
