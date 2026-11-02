import { domainOf, normaliseName } from "@/lib/ontology/names";

// Pure helpers for uploaded lists: the Sleuthhound fields a column can map
// to, and how a row's values are cleaned. No I/O, so they're unit tested.

export const CSV_FIELDS = [
  "Target name",
  "Company number",
  "Website",
  "Email",
  "Person name",
  "Postcode",
  "Address",
  "Date",
  "Description",
  "Notes",
  "Ignore",
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

/** Which part of the ontology each field feeds, for the Map step's groups. */
export const FIELD_GROUP: Record<CsvField, "Target" | "Signal" | "Person" | "Place" | null> = {
  "Target name": "Target",
  "Company number": "Target",
  Website: "Target",
  Email: "Person",
  "Person name": "Person",
  Postcode: "Place",
  Address: "Place",
  Date: "Signal",
  Description: "Signal",
  Notes: "Signal",
  Ignore: null,
};

/** Column name to field. Columns left out are ignored. */
export type CsvMapping = Record<string, CsvField>;

export type CsvRow = Record<string, string>;

/** "123456" → "00123456", "sc 123456" → "SC123456"; null when it can't be one. */
export function cleanCompanyNumber(value: string | undefined): string | null {
  const v = (value ?? "").toUpperCase().replace(/\s+/g, "");
  if (!v) return null;
  if (/^\d{1,8}$/.test(v)) return v.padStart(8, "0");
  if (/^[A-Z]{2}\d{6}$/.test(v)) return v;
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function isoOf(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Dates as people type them in UK spreadsheets: 2026-10-02, 02/10/2026, 03/2026, 2 Oct 2026, Oct 2026. */
export function parseLooseDate(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoOf(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return isoOf(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = v.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) return isoOf(+m[2], +m[1], 1);
  m = v.match(/^(\d{1,2})\s+([a-z]{3,})\.?,?\s+(\d{4})$/i);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return month < 0 ? null : isoOf(+m[3], month + 1, +m[1]);
  }
  m = v.match(/^([a-z]{3,})\.?\s+(\d{4})$/i);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return month < 0 ? null : isoOf(+m[2], month + 1, 1);
  }
  return null;
}

/** The first column mapped to a field, and its value in this row. */
export function valueOf(row: CsvRow, mapping: CsvMapping, field: CsvField): string {
  const column = Object.keys(mapping).find((c) => mapping[c] === field);
  return column ? (row[column] ?? "").trim() : "";
}

export type CleanRow = {
  name: string;
  companyNumber: string | null;
  website: string | null;
  domain: string | null;
  email: string | null;
  personName: string | null;
  postcode: string | null;
  address: string | null;
  date: string | null;
  description: string | null;
  notes: string | null;
};

export type RowProblem = "No name" | "Company number isn’t valid";

export function cleanRow(row: CsvRow, mapping: CsvMapping): { row: CleanRow; problem: RowProblem | null } {
  const rawNumber = valueOf(row, mapping, "Company number");
  const companyNumber = cleanCompanyNumber(rawNumber);
  const site = valueOf(row, mapping, "Website");
  const email = valueOf(row, mapping, "Email");
  const clean: CleanRow = {
    name: valueOf(row, mapping, "Target name"),
    companyNumber,
    website: site ? (site.includes("://") ? site : `https://${site}`) : null,
    // A company's own address is a better match key than a contact's email.
    domain: domainOf(site) ?? null,
    email: email || null,
    personName: valueOf(row, mapping, "Person name") || null,
    postcode: valueOf(row, mapping, "Postcode") || null,
    address: valueOf(row, mapping, "Address") || null,
    date: parseLooseDate(valueOf(row, mapping, "Date")),
    description: valueOf(row, mapping, "Description") || null,
    notes: valueOf(row, mapping, "Notes") || null,
  };
  const problem: RowProblem | null = !clean.name ? "No name" : rawNumber && !companyNumber ? "Company number isn’t valid" : null;
  return { row: clean, problem };
}

/** The key the duplicate check groups rows by within one file. */
export function rowKey(row: CleanRow): string {
  return row.companyNumber ?? row.domain ?? normaliseName(row.name);
}
