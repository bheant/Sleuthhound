import Papa from "papaparse";
import { sha256Hex } from "@/lib/format/sha256";
import type { UploadResult } from "@/lib/sources/types";
import type { CsvRow } from "./fields";

// An uploaded file waits here, parsed and in memory only, between the
// wizard's Scope step and Save, which copies its rows into raw_items. Locking
// or reloading drops it, and the file is chosen again.

const uploads = new Map<string, Upload>();
export const MAX_ROWS = 5000;
export const MAX_BYTES = 5 * 1024 * 1024;

export type Upload = { fileName: string; headers: string[]; rows: CsvRow[]; uploadedAt: string };

export type ParseResult = { ok: true; upload: Upload } | { ok: false; message: string };

export function parseCsv(fileName: string, text: string): ParseResult {
  const parsed = Papa.parse<CsvRow>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  if (headers.length === 0) return { ok: false, message: "That file has no column names. The first row should name the columns." };
  if (parsed.data.length === 0) return { ok: false, message: "That file has column names but no rows." };
  if (parsed.data.length > MAX_ROWS) {
    return { ok: false, message: `That file has ${parsed.data.length.toLocaleString("en-GB")} rows. Split it into files of up to 5,000.` };
  }
  const rows = parsed.data.map((r) => Object.fromEntries(headers.map((h) => [h, String(r[h] ?? "").trim()])));
  return { ok: true, upload: { fileName, headers, rows, uploadedAt: new Date().toISOString() } };
}

export function saveUpload(upload: Upload): string {
  const id = crypto.randomUUID();
  uploads.set(id, upload);
  return id;
}

export function readUpload(id: string): Upload | null {
  return uploads.get(id) ?? null;
}

export function deleteUpload(id: string): void {
  uploads.delete(id);
}

/** The external ID of a row: a hash of its values, so the same row twice is one item. */
export function rowHash(row: CsvRow): string {
  const values = Object.keys(row)
    .sort()
    .map((k) => `${k}=${row[k]}`)
    .join("\u0000");
  return sha256Hex(values).slice(0, 32);
}

/** The wizard's upload: checks, parses and holds a chosen file. */
export async function uploadCsvFile(file: File): Promise<UploadResult> {
  if (file.size > MAX_BYTES) return { ok: false, message: "That file is over 5 MB. Split it into smaller files." };
  if (/\.xlsx?$/i.test(file.name)) {
    return { ok: false, message: "Save the sheet as CSV first (File, then Save as, then CSV), and upload that." };
  }
  const parsed = parseCsv(file.name, await file.text());
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    uploadId: saveUpload(parsed.upload),
    fileName: parsed.upload.fileName,
    rowCount: parsed.upload.rows.length,
    headers: parsed.upload.headers,
    samples: parsed.upload.rows.slice(0, 5),
  };
}
