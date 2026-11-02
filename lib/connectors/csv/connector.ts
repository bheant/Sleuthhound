import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import type { Connector, OntologyDraft } from "../types";
import { CSV_FIELDS, cleanRow, type CsvMapping, type CsvRow } from "./fields";
import { readUpload, rowHash } from "./uploads";

// A list someone already has: event attendees, a prospect list, or the user's
// own clients (purpose "clients"). The wizard uploads and parses the file;
// Save copies its rows into raw_items, and the next run imports them once.

export const csvScope = z.object({
  uploadId: z.string().min(1, "Upload a file first."),
  fileName: z.string().min(1, "Upload a file first."),
  rowCount: z.number().int().min(0),
  purpose: z.enum(["targets", "clients"]),
});
export type CsvScope = z.infer<typeof csvScope>;

export const csvMapping = z.record(z.string(), z.enum(CSV_FIELDS));

/** What a CSV raw item holds: the row as uploaded and the file it came from. */
export type CsvItem = { row: CsvRow; file: string };

const importedCursor = z.object({ imported: z.literal(true) });

function mappingOf(mapping: unknown): CsvMapping {
  return csvMapping.safeParse(mapping).data ?? {};
}

export function normaliseRow(item: CsvItem, mapping: CsvMapping, purpose: CsvScope["purpose"], now: string): OntologyDraft {
  const { row, problem } = cleanRow(item.row, mapping);
  if (problem) throw new Error(problem);
  const hasPlace = Boolean(row.postcode || row.address);
  const draft: OntologyDraft = {
    targets: [
      {
        ref: "company",
        kind: "company",
        name: row.name,
        companyNumber: row.companyNumber ?? undefined,
        url: row.website ?? undefined,
        domain: row.domain ?? undefined,
        placeRef: hasPlace ? "place" : undefined,
        matchOnName: true,
        profile: { file: item.file },
      },
    ],
    signals: [
      {
        targetRef: "company",
        type: "imported",
        title: row.description ?? (purpose === "clients" ? "On your client list" : `Listed in ${item.file}`),
        body: row.notes ?? undefined,
        occurredAt: row.date ?? now.slice(0, 10),
        attributes: { file: item.file, signed_on: purpose === "clients" ? row.date : null },
      },
    ],
    people: [],
    places: hasPlace ? [{ ref: "place", postcode: row.postcode ?? undefined, address: row.address ?? undefined }] : [],
    links: hasPlace ? [{ fromRef: "company", toRef: "place", kind: "located_at" }] : [],
  };
  if (row.personName || row.email) {
    draft.people.push({
      ref: "contact",
      name: row.personName ?? row.email!,
      externalId: row.email ? `email:${row.email.toLowerCase()}` : undefined,
      attributes: { email: row.email, email_source: row.email ? item.file : null },
    });
    draft.links.push({ fromRef: "company", toRef: "contact", kind: "mentions", attributes: { role: "contact" } });
  }
  return draft;
}

export const csvConnector: Connector<CsvScope, CsvItem> = {
  key: "csv",
  label: "CSV upload",
  group: "Your files",
  description: "A list you already have, such as event attendees",
  costNote: "Free",
  needsKey: false,
  availability: "available",
  scopeSchema: csvScope,
  scopeFields: [{ key: "uploadId", label: "File", input: "file" }],
  describable: false,
  defaultScope: () => ({ uploadId: "", fileName: "", rowCount: 0, purpose: "targets" }),
  scopeLine: (scope) => `${scope.fileName}, ${scope.rowCount.toLocaleString("en-GB")} ${scope.rowCount === 1 ? "row" : "rows"}`,
  scopeSummary: (scope) => [
    { label: "File", value: scope.fileName },
    { label: "Rows", value: scope.rowCount.toLocaleString("en-GB") },
    { label: "Imported as", value: scope.purpose === "clients" ? "Clients" : "New companies" },
  ],
  mappingMode: "user",
  async fetch(ctx) {
    // Preview: the uploaded file itself, before anything is saved.
    if (!ctx.sourceId) {
      const upload = readUpload(ctx.scope.uploadId);
      if (!upload) throw new Error("The uploaded file has gone. Upload it again.");
      return { items: upload.rows.slice(0, ctx.limit).map((row) => ({ row, file: upload.fileName })), cursor: null };
    }
    // A file is imported once.
    if (importedCursor.safeParse(ctx.cursor).success) return { items: [], cursor: ctx.cursor };
    const r = schema.rawItems;
    const rows = db
      .select({ payload: r.payload })
      .from(r)
      .where(and(eq(r.workspaceId, ctx.workspaceId), eq(r.sourceId, ctx.sourceId)))
      .all();
    return { items: rows.map((x) => x.payload as CsvItem), cursor: { imported: true } };
  },
  externalId: (raw) => rowHash(raw.row),
  filter: (raw, _scope, mapping) => {
    const { problem } = cleanRow(raw.row, mappingOf(mapping));
    return problem ? { keep: false, reason: problem } : { keep: true };
  },
  previewMeta: (raw) => `From ${raw.file}`,
  normalise: (raw, ctx) => normaliseRow(raw, mappingOf(ctx.mapping), ctx.purpose === "clients" ? "clients" : "targets", ctx.now),
};
