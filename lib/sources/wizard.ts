import { getBusinessName } from "@/lib/business/store";
import { generateText, Output } from "ai";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { estimateCostGbp } from "@/lib/ai/cost";
import { csvMappingPrompt, describePrompt } from "@/lib/ai/prompts";
import { defaultAiName, getModel, modelsFor } from "@/lib/ai/provider";
import { CsvMappingSuggestion } from "@/lib/ai/schemas";
import { CSV_FIELDS, cleanRow, rowKey, type CsvField, type CsvMapping } from "@/lib/connectors/csv/fields";
import { readUpload } from "@/lib/connectors/csv/uploads";
import { COMING_SOON, getConnector, listConnectors } from "@/lib/connectors/registry";
import type { AnyConnector, ScopeFieldSpec } from "@/lib/connectors/types";
import { keyServiceSchema } from "@/lib/credentials/services";
import { credentialViews, readKey } from "@/lib/credentials/store";
import { db, schema } from "@/lib/db";
import { findExistingTarget } from "@/lib/ontology/resolve";
import { getSetting } from "@/lib/settings";
import type {
  CatalogueData,
  ConnectorInfo,
  DescribeResult,
  DuplicateCheck,
  MappingResult,
  PreviewResult,
  PreviewRow,
  ScopeCheck,
} from "./types";

// The Add source wizard's server side: the catalogue, Describe (the AI fills
// in Scope), Scope checks, Preview (a dry run: fetch, filter and normalise,
// no writes, no AI) and the CSV mapping and duplicate check.

const PREVIEW_LIMIT = 10;

// Typical tokens for one review, for the estimate before any review has run.
const TYPICAL_REVIEW = { inputTokens: 3500, outputTokens: 450 };

/** What one item costs to review: the average of recent reviews, or an estimate from the price table. */
export function perItemGbp(workspaceId: string): number {
  const r = schema.reviews;
  const t = schema.targets;
  const recent = db
    .select({ cost: r.costGbp })
    .from(r)
    .innerJoin(t, eq(t.id, r.targetId))
    .where(and(eq(t.workspaceId, workspaceId), eq(t.isDemo, 0), sql`${r.costGbp} is not null`))
    .orderBy(desc(r.reviewedAt))
    .limit(200)
    .all();
  if (recent.length >= 10) return recent.reduce((sum, x) => sum + (x.cost ?? 0), 0) / recent.length;
  return estimateCostGbp({ modelId: modelsFor(workspaceId, getSetting(workspaceId, "default_ai")).review, ...TYPICAL_REVIEW });
}

export function catalogueData(workspaceId: string): CatalogueData {
  const keys = credentialViews(workspaceId);
  const added = new Set(
    db
      .select({ connector: schema.sources.connector })
      .from(schema.sources)
      .where(and(eq(schema.sources.workspaceId, workspaceId), eq(schema.sources.isDemo, 0)))
      .all()
      .map((x) => x.connector),
  );
  const connectors: ConnectorInfo[] = listConnectors().map((c) => {
    const key = keys.find((k) => k.service === c.credentialService);
    return {
      key: c.key,
      label: c.label,
      group: c.group,
      description: c.description,
      costNote: c.costNote,
      catalogueNote: c.catalogueNote ?? null,
      needsKey: c.needsKey,
      credentialService: c.credentialService ?? null,
      availability: c.availability,
      scopeFields: c.scopeFields,
      defaultScope: c.defaultScope() as Record<string, unknown>,
      mappingMode: c.mappingMode,
      fixedMapping: c.fixedMapping ?? [],
      describable: c.describable,
      added: added.has(c.key),
      key4: key?.last4 ?? null,
      keyStatus: key?.status ?? "off",
    };
  });
  return { connectors, comingSoon: COMING_SOON, perItemGbp: perItemGbp(workspaceId), reviewCap: getSetting(workspaceId, "review_cap_per_run") };
}

// ---------------------------------------------------------------- Scope

/** Field-by-field messages for a scope that doesn't validate. */
export function checkScope(connectorKey: string, scope: unknown): ScopeCheck {
  const parsed = getConnector(connectorKey).scopeSchema.safeParse(scope);
  if (parsed.success) return { ok: true };
  const issues: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "");
    issues[key] ??= issue.message;
  }
  return { ok: false, issues, message: Object.values(issues)[0] ?? "Check the settings." };
}

// ---------------------------------------------------------------- Describe

function fieldHint(f: ScopeFieldSpec): string {
  const kinds: Record<ScopeFieldSpec["input"], string> = {
    text: "text",
    date: "a date, YYYY-MM-DD",
    select: "one of the options",
    sic: "a list of five-digit UK SIC 2007 codes",
    checkboxes: "a list of the options",
    chips: "a list of short words or phrases",
    toggle: "true or false",
    number: "a whole number",
    segmented: "one of the options",
    file: "not set here",
  };
  const options = f.options?.length ? ` Options: ${f.options.map((o) => `${o.value} (${o.label})`).join("; ")}.` : "";
  return `- ${f.key}: ${f.label}, ${kinds[f.input]}.${options}${f.help ? ` ${f.help}` : ""}`;
}

function shapeOf(connector: AnyConnector): Record<string, z.ZodType> | null {
  const schemaValue = connector.scopeSchema as unknown;
  return schemaValue instanceof z.ZodObject ? (schemaValue.shape as Record<string, z.ZodType>) : null;
}

export async function describeScope(
  workspaceId: string,
  connectorKey: string,
  sentence: string,
  current: Record<string, unknown>,
): Promise<DescribeResult> {
  const connector = getConnector(connectorKey);
  const shape = shapeOf(connector);
  if (!connector.describable || !shape) return { ok: true, scope: current, suggested: [] };
  const fields = connector.scopeFields.filter((f) => f.key in shape);
  const loose = z.object(Object.fromEntries(fields.map((f) => [f.key, shape[f.key].nullable()])));
  let output: Record<string, unknown>;
  try {
    const ai = getModel("writing", workspaceId);
    const result = await generateText({
      model: ai.model,
      prompt: describePrompt(getBusinessName(workspaceId), connector.label, fields.map(fieldHint).join("\n"), sentence, new Date().toISOString().slice(0, 10)),
      output: Output.object({ schema: loose }),
      maxOutputTokens: 1500,
    });
    output = result.output as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error && /isn.t (connected|available)/.test(error.message) ? error.message : null;
    return { ok: false, message: message ?? `${defaultAiName(workspaceId)} couldn’t fill in the settings. Set them yourself on the next step.` };
  }
  // Keep each suggested value only if it's valid on its own.
  const scope = { ...current };
  const suggested: string[] = [];
  for (const f of fields) {
    const value = output[f.key];
    if (value === null || value === undefined) continue;
    if (!shape[f.key].safeParse(value).success) continue;
    scope[f.key] = value;
    suggested.push(f.key);
  }
  return { ok: true, scope, suggested };
}

// ---------------------------------------------------------------- Preview

const LOOK_BACK_TEXT: Record<string, string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days" };

export function emptyPreviewLine(scope: Record<string, unknown>): string {
  const look = LOOK_BACK_TEXT[String(scope.lookBack)];
  return look
    ? `Nothing matched in the last ${look}. Try a longer look back or broader keywords.`
    : "Nothing matched. Try broader settings.";
}

export async function previewSource(
  workspaceId: string,
  connectorKey: string,
  scopeInput: unknown,
  mapping: unknown,
): Promise<PreviewResult> {
  const connector = getConnector(connectorKey);
  if (connector.availability === "needs_approval") {
    return { ok: false, message: `Preview starts once ${connector.label} approves commercial access. You can save the source now.` };
  }
  const parsed = connector.scopeSchema.safeParse(scopeInput);
  if (!parsed.success) return { ok: false, message: "Check the settings on the Scope step first." };
  const service = keyServiceSchema.safeParse(connector.credentialService);
  const apiKey = service.success ? readKey(workspaceId, service.data) : null;
  if (connector.needsKey && !apiKey) return { ok: false, message: `Connect ${connector.label} first.` };

  let items: unknown[];
  try {
    const fetched = await connector.fetch({
      workspaceId,
      sourceId: null,
      scope: parsed.data,
      apiKey,
      cursor: null,
      limit: PREVIEW_LIMIT,
      log: () => {},
    });
    items = fetched.items.slice(0, PREVIEW_LIMIT);
  } catch (error) {
    const reason = error instanceof Error && error.message.startsWith("The uploaded") ? error.message : `${connector.label} didn’t answer. Try the preview again in a minute.`;
    return { ok: false, message: reason };
  }

  const now = new Date();
  const purpose = (parsed.data as { purpose?: string }).purpose;
  const rows: PreviewRow[] = items.map((raw) => {
    const meta = connector.previewMeta?.(raw, now) ?? "";
    const verdict = connector.filter?.(raw, parsed.data, mapping) ?? { keep: true };
    let title = "";
    try {
      const draft = connector.normalise(raw, { workspaceId, sourceId: "preview", now: now.toISOString(), mapping, purpose });
      const target = draft.targets[0];
      title = target?.name ?? "";
      if (!verdict.keep) return { outcome: "filtered", label: `Filtered out, ${verdict.reason ?? "outside the scope"}`, title, meta };
      const place = target?.placeRef ? draft.places.find((p) => p.ref === target.placeRef) : undefined;
      const existing = target ? findExistingTarget(db, workspaceId, target, place?.postcode ?? null) : null;
      if (existing) {
        const name = db.select({ name: schema.targets.name }).from(schema.targets).where(eq(schema.targets.id, existing)).get()?.name;
        return { outcome: "signal", label: `Signal on ${name ?? "an existing target"}`, title, meta };
      }
      return { outcome: "new", label: purpose === "clients" ? "New client" : "New target", title, meta };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "couldn’t be read";
      return { outcome: "filtered", label: `Filtered out, ${verdict.reason ?? reason}`, title: title || "Unreadable item", meta };
    }
  });
  return { ok: true, rows, source: connector.label };
}

// ---------------------------------------------------------------- CSV

// Columns whose names say what they are, for when the AI isn't available.
const NAME_HINTS: Array<[RegExp, CsvField]> = [
  [/(company|co\.?)\s*(no|number|reg)/i, "Company number"],
  [/^(company|business|organisation|organization|client|name|company name)$/i, "Target name"],
  [/web|site|url|domain/i, "Website"],
  [/e-?mail/i, "Email"],
  [/contact|person|founder|director/i, "Person name"],
  [/post\s*code|postal|zip/i, "Postcode"],
  [/address/i, "Address"],
  [/date|signed|met|since/i, "Date"],
  [/note|comment/i, "Notes"],
  [/description|event|where|source|tag/i, "Description"],
];

export function guessMapping(headers: string[]): CsvMapping {
  const used = new Set<CsvField>();
  const mapping: CsvMapping = {};
  for (const h of headers) {
    const hit = NAME_HINTS.find(([re, field]) => re.test(h) && !used.has(field));
    mapping[h] = hit ? hit[1] : "Ignore";
    if (hit) used.add(hit[1]);
  }
  return mapping;
}

export async function suggestMapping(workspaceId: string, uploadId: string, purpose: string): Promise<MappingResult> {
  const upload = readUpload(uploadId);
  if (!upload) return { ok: false, message: "The uploaded file has gone. Upload it again.", mapping: {} };
  const fallback = guessMapping(upload.headers);
  try {
    const ai = getModel("writing", workspaceId);
    const result = await generateText({
      model: ai.model,
      prompt: csvMappingPrompt(upload.headers, upload.rows.slice(0, 5), CSV_FIELDS, purpose),
      output: Output.object({ schema: CsvMappingSuggestion }),
      maxOutputTokens: 1500,
    });
    const mapping: CsvMapping = Object.fromEntries(upload.headers.map((h) => [h, "Ignore" as CsvField]));
    const suggested: string[] = [];
    const used = new Set<CsvField>();
    for (const m of result.output.mappings) {
      const field = CSV_FIELDS.find((f) => f === m.field);
      if (!field || !(m.column in mapping) || (field !== "Ignore" && used.has(field))) continue;
      mapping[m.column] = field;
      if (field !== "Ignore") {
        used.add(field);
        suggested.push(m.column);
      }
    }
    return { ok: true, mapping, suggested };
  } catch {
    return { ok: false, message: `${defaultAiName(workspaceId)} couldn’t suggest a mapping, so these are guesses from the column names.`, mapping: fallback };
  }
}

export function duplicateCheck(workspaceId: string, uploadId: string, mapping: CsvMapping): DuplicateCheck | null {
  const upload = readUpload(uploadId);
  if (!upload) return null;
  const out: DuplicateCheck = { fresh: [], match: [], problems: [] };
  const seen = new Set<string>();
  for (const raw of upload.rows) {
    const { row, problem } = cleanRow(raw, mapping);
    if (problem) {
      out.problems.push({ name: row.name || "(no name)", note: problem });
      continue;
    }
    const key = rowKey(row);
    if (seen.has(key)) {
      out.problems.push({ name: row.name, note: "Listed twice in this file" });
      continue;
    }
    seen.add(key);
    const existing = findExistingTarget(
      db,
      workspaceId,
      { ref: "x", kind: "company", name: row.name, companyNumber: row.companyNumber ?? undefined, domain: row.domain ?? undefined, matchOnName: true },
      row.postcode,
    );
    if (existing) {
      const name = db.select({ name: schema.targets.name }).from(schema.targets).where(eq(schema.targets.id, existing)).get()?.name;
      out.match.push({ name: row.name, note: `Merges with ${name ?? "an existing company"}` });
    } else {
      out.fresh.push({ name: row.name, note: row.companyNumber ? `Company ${row.companyNumber}` : row.domain ?? "Matched by name at import" });
    }
  }
  return out;
}
