import { z } from "zod";
import { testCompaniesHouseKey } from "@/lib/credentials/key-tests";
import { formatDate } from "@/lib/format/time";
import type { Connector, MappingRow, ScopeFieldSpec } from "../types";
import { fetchCompanies } from "./fetch";
import { normaliseCompany } from "./normalise";
import { COMMON_SIC_CODES } from "./sic";
import type { AdvancedSearchItem } from "./types";

// Companies House: new companies from the register. Enrichment (profile,
// officers, deadlines) runs in the pipeline, not here: lib/pipeline/enrich.ts.

export const CH_SIGNALS = ["first_accounts_due", "overdue_filings", "share_allotments", "new_directors"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2025-01-31.");

export const companiesHouseScope = z.object({
  location: z.string().trim().min(1, "Add a place, such as London.").max(100),
  sicCodes: z.array(z.string().regex(/^\d{5}$/, "SIC codes are five digits.")).max(50),
  incorporatedAfter: isoDate,
  companyType: z.string().min(1),
  signals: z.array(z.enum(CH_SIGNALS)),
});

export type CompaniesHouseScope = z.infer<typeof companiesHouseScope>;

function monthsAgo(months: number, from = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const scopeFields: ScopeFieldSpec[] = [
  { key: "location", label: "Location", input: "text", placeholder: "London", row: "where" },
  { key: "incorporatedAfter", label: "Incorporated after", input: "date", row: "where" },
  {
    key: "sicCodes",
    label: "Industry, by SIC code",
    input: "sic",
    help: "Leave empty for every industry.",
    placeholder: "Add a code or industry",
    options: Object.entries(COMMON_SIC_CODES).map(([value, label]) => ({ value, label: `${value} ${label}` })),
  },
  {
    key: "companyType",
    label: "Company type",
    input: "select",
    options: [
      { value: "ltd", label: "Private limited company" },
      { value: "llp", label: "Limited liability partnership" },
      { value: "plc", label: "Public limited company" },
      { value: "private-limited-guarant-nsc", label: "Private limited by guarantee" },
    ],
  },
  {
    key: "signals",
    label: "Signals to watch",
    input: "checkboxes",
    options: [
      { value: "first_accounts_due", label: "First accounts due" },
      { value: "overdue_filings", label: "Overdue filings" },
      { value: "share_allotments", label: "Share allotments" },
      { value: "new_directors", label: "New directors" },
    ],
  },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  (scopeFields.find((f) => f.key === "companyType")?.options ?? []).map((o) => [o.value, o.label]),
);
const SIGNAL_LABELS: Record<string, string> = Object.fromEntries(
  (scopeFields.find((f) => f.key === "signals")?.options ?? []).map((o) => [o.value, o.label]),
);

const fixedMapping: MappingRow[] = [
  { from: "company_name", to: "Target name", group: "Target" },
  { from: "company_number", to: "Company number", group: "Target" },
  { from: "sic_codes", to: "Industry", group: "Target" },
  { from: "date_of_creation", to: "Incorporated", group: "Signal" },
  { from: "accounts.next_due", to: "Accounts due", group: "Signal" },
  { from: "accounts.overdue, confirmation_statement.overdue", to: "Overdue filings", group: "Signal" },
  { from: "officers: name, role, appointed_on", to: "Director", group: "Person" },
  { from: "registered_office_address", to: "Registered office", group: "Place" },
];

export const companiesHouseConnector: Connector<CompaniesHouseScope, AdvancedSearchItem> = {
  key: "companies_house",
  label: "Companies House",
  group: "Registers",
  description: "New and changing UK companies, with filings and directors",
  costNote: "Free, API key",
  needsKey: true,
  credentialService: "companies_house",
  availability: "available",
  scopeSchema: companiesHouseScope,
  scopeFields,
  describable: true,
  scopeLine: (scope) =>
    `${scope.location}, ${scope.sicCodes.length ? `${scope.sicCodes.length} ${scope.sicCodes.length === 1 ? "industry" : "industries"}` : "every industry"}`,
  scopeSummary: (scope) => [
    { label: "Location", value: scope.location },
    { label: "Incorporated after", value: formatDate(scope.incorporatedAfter) },
    {
      label: "Industries",
      value: scope.sicCodes.length ? scope.sicCodes.map((c) => `${c} ${COMMON_SIC_CODES[c] ?? ""}`.trim()).join(", ") : "Every industry",
    },
    { label: "Company type", value: TYPE_LABELS[scope.companyType] ?? scope.companyType },
    { label: "Signals", value: scope.signals.map((x) => SIGNAL_LABELS[x] ?? x).join(", ") || "None" },
  ],
  defaultScope: () => ({
    location: "London",
    sicCodes: [],
    incorporatedAfter: monthsAgo(24),
    companyType: "ltd",
    signals: [...CH_SIGNALS],
  }),
  mappingMode: "fixed",
  fixedMapping,
  async test({ apiKey }) {
    if (!apiKey) return { ok: false, message: "Paste a Companies House key, then Test." };
    const result = await testCompaniesHouseKey(apiKey);
    return { ok: result.ok, message: result.message ?? "Connected" };
  },
  fetch: (ctx) => fetchCompanies(ctx),
  externalId: (raw) => raw.company_number,
  normalise: (raw) => normaliseCompany(raw),
  previewMeta: (raw) =>
    [raw.date_of_creation ? `Incorporated ${formatDate(raw.date_of_creation)}` : null, raw.registered_office_address?.locality, raw.company_number]
      .filter(Boolean)
      .join(", "),
  filter: (raw, scope) => locationFilter(raw, scope),
};

// Companies House matches location against the whole address, so "London"
// also brings in "628a London Road, Stoke-On-Trent". Keep only addresses whose
// town or region matches.
export function locationFilter(raw: AdvancedSearchItem, scope: CompaniesHouseScope): { keep: boolean; reason?: string } {
  const a = raw.registered_office_address;
  const place = [a?.locality, a?.region].filter(Boolean).join(" ");
  if (!place) return { keep: true };
  if (place.toLowerCase().includes(scope.location.trim().toLowerCase())) return { keep: true };
  return { keep: false, reason: `Registered office is in ${a?.locality ?? a?.region}, not ${scope.location}` };
}
