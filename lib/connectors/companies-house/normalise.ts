import type { OntologyDraft } from "../types";
import { titleCaseCompanyName } from "./names";
import type { Address, AdvancedSearchItem } from "./types";

// Turns one advanced-search hit into a company target, its registered office
// and an "incorporated" signal. Directors and deadlines come later, from
// enrichment (lib/pipeline/enrich.ts).

export const CH_PUBLIC_URL = "https://find-and-update.company-information.service.gov.uk";

export function companyPageUrl(companyNumber: string): string {
  return `${CH_PUBLIC_URL}/company/${encodeURIComponent(companyNumber)}`;
}

export function formatAddress(a: Address | undefined): string | null {
  if (!a) return null;
  const street = [a.premises, a.address_line_1].filter(Boolean).join(" ");
  const parts = [street, a.address_line_2, a.locality, a.postal_code].map((s) => s?.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function normaliseCompany(raw: AdvancedSearchItem): OntologyDraft {
  const address = raw.registered_office_address;
  const hasPlace = Boolean(address?.postal_code || formatAddress(address));
  const url = companyPageUrl(raw.company_number);
  return {
    targets: [
      {
        ref: "company",
        kind: "company",
        name: titleCaseCompanyName(raw.company_name),
        companyNumber: raw.company_number,
        status: raw.company_status,
        incorporatedOn: raw.date_of_creation,
        sicCodes: raw.sic_codes ?? [],
        companyType: raw.company_type,
        placeRef: hasPlace ? "office" : undefined,
        profile: { ...raw },
      },
    ],
    signals: raw.date_of_creation
      ? [{ targetRef: "company", type: "incorporated", title: "Incorporated", occurredAt: raw.date_of_creation, url }]
      : [],
    people: [],
    places: hasPlace ? [{ ref: "office", postcode: address?.postal_code, address: formatAddress(address) ?? undefined }] : [],
    links: hasPlace ? [{ fromRef: "company", toRef: "office", kind: "located_at" }] : [],
  };
}
