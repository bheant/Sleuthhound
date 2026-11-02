import { sampleRefusal } from "@/lib/net/external";
import { z } from "zod";
import { refresh } from "@/lib/vault/live";
import { requireWorkspace } from "@/lib/vault/workspace";
import { CSV_FIELDS, type CsvMapping } from "@/lib/connectors/csv/fields";
import { registry } from "@/lib/connectors/registry";
import { createSource, removeSource, restoreVersion, retrySource, setPaused, updateSource } from "./manage";
import type { ActionResult, DescribeResult, DuplicateCheck, MappingResult, PreviewResult, ScopeCheck, WizardConfig } from "./types";
import { checkScope, describeScope, duplicateCheck, previewSource, suggestMapping } from "./wizard";

// Actions for the Add source wizard and the source panels. Inputs are
// checked here; each returns an outcome and plain copy, never an error object.

const connectorKey = z.string().refine((k) => registry.has(k), "Unknown source.");
const id = z.string().uuid();
const scope = z.record(z.string(), z.unknown());
const mapping = z.record(z.string(), z.enum(CSV_FIELDS));

const wizardConfig = z.object({
  scope,
  mapping: mapping.nullable(),
  schedule: z.enum(["hourly", "every_6_hours", "daily"]),
  max_items: z.number().int().min(1).max(1000),
  spend_cap_gbp: z.number().min(0).max(10_000).nullable(),
  weight: z.enum(["low", "normal", "high"]),
  describe_text: z.string().max(2000).nullable(),
});

export async function describeSource(connector: string, sentence: string, current: Record<string, unknown>): Promise<DescribeResult> {
  const sample = sampleRefusal();
  if (sample) return { ok: false, message: sample };
  const workspaceId = requireWorkspace();
  const input = z.object({ connector: connectorKey, sentence: z.string().trim().min(3).max(2000), current: scope }).safeParse({ connector, sentence, current });
  if (!input.success) return { ok: false, message: "Describe what it should look for in a sentence or two." };
  return describeScope(workspaceId, input.data.connector, input.data.sentence, input.data.current);
}

export async function checkSourceScope(connector: string, value: Record<string, unknown>): Promise<ScopeCheck> {
  requireWorkspace();
  if (!registry.has(connector)) return { ok: false, issues: {}, message: "Unknown source." };
  return checkScope(connector, value);
}

export async function previewNewSource(connector: string, value: Record<string, unknown>, map: CsvMapping | null): Promise<PreviewResult> {
  const sample = sampleRefusal();
  if (sample && connector !== "csv") return { ok: false, message: sample };
  const workspaceId = requireWorkspace();
  if (!registry.has(connector)) return { ok: false, message: "Unknown source." };
  return previewSource(workspaceId, connector, value, map);
}

export async function suggestCsvMapping(uploadId: string, purpose: string): Promise<MappingResult> {
  const workspaceId = requireWorkspace();
  if (!id.safeParse(uploadId).success) return { ok: false, message: "Upload the file again.", mapping: {} };
  return suggestMapping(workspaceId, uploadId, purpose === "clients" ? "clients" : "targets");
}

export async function checkCsvDuplicates(uploadId: string, map: CsvMapping): Promise<DuplicateCheck | null> {
  const workspaceId = requireWorkspace();
  const input = z.object({ uploadId: id, map: mapping }).safeParse({ uploadId, map });
  if (!input.success) return null;
  return duplicateCheck(workspaceId, input.data.uploadId, input.data.map);
}

export async function saveSource(connector: string, config: WizardConfig, sourceId: string | null): Promise<ActionResult> {
  const workspaceId = requireWorkspace();
  const parsed = wizardConfig.safeParse(config);
  if (!parsed.success) return { ok: false, message: "Check the schedule and limits." };
  const result = sourceId
    ? id.safeParse(sourceId).success
      ? updateSource(workspaceId, sourceId, parsed.data)
      : { ok: false, message: "That source has been removed." }
    : connectorKey.safeParse(connector).success
      ? createSource(workspaceId, connector, parsed.data)
      : { ok: false, message: "Unknown source." };
  if (result.ok) refresh();
  return result;
}

async function onSource(sourceId: string, fn: (workspaceId: string, sourceId: string) => ActionResult): Promise<ActionResult> {
  const workspaceId = requireWorkspace();
  if (!id.safeParse(sourceId).success) return { ok: false, message: "That source has been removed." };
  const result = fn(workspaceId, sourceId);
  if (result.ok) refresh();
  return result;
}

export async function pauseSource(sourceId: string, paused: boolean): Promise<ActionResult> {
  return onSource(sourceId, (w, s) => setPaused(w, s, Boolean(paused)));
}

export async function retryNow(sourceId: string): Promise<ActionResult> {
  return onSource(sourceId, retrySource);
}

export async function deleteSource(sourceId: string): Promise<ActionResult> {
  return onSource(sourceId, removeSource);
}

export async function restoreSourceVersion(sourceId: string, version: number): Promise<ActionResult> {
  if (!Number.isInteger(version) || version < 1) return { ok: false, message: "That version can’t be restored." };
  return onSource(sourceId, (w, s) => restoreVersion(w, s, version));
}
