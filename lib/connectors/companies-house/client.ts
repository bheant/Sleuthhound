import { companiesHouseLimiter, type RateLimiter } from "@/lib/limits/rate-limiter";
import type {
  AdvancedSearchParams,
  AdvancedSearchResult,
  CompanyProfile,
  FilingHistoryList,
  OfficerList,
  SearchCompaniesResult,
} from "./types";
import { externalFetch } from "@/lib/net/external";

// The Companies House public data API. The key is the HTTP Basic username with
// an empty password. Every request goes through the shared rate limiter.

export const CH_BASE_URL = "https://api.company-information.service.gov.uk";
const MAX_ATTEMPTS = 3;

export class CompaniesHouseError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`Companies House returned ${status} for ${path}`);
    this.name = "CompaniesHouseError";
  }
}

type Query = Record<string, string | number | string[] | undefined>;

function toSearch(query: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export type CompaniesHouseClient = ReturnType<typeof createCompaniesHouseClient>;

export function createCompaniesHouseClient(
  apiKey: string,
  { limiter = companiesHouseLimiter(), fetchImpl = externalFetch }: { limiter?: RateLimiter; fetchImpl?: typeof fetch } = {},
) {
  const auth = `Basic ${btoa(`${apiKey}:`)}`;

  // Returns null on 404. Retries a 429 after the limiter's backoff.
  async function get<T>(path: string, query: Query = {}): Promise<T | null> {
    const url = `${CH_BASE_URL}${path}${toSearch(query)}`;
    for (let attempt = 1; ; attempt++) {
      await limiter.acquire();
      const res = await fetchImpl(url, { headers: { Authorization: auth, Accept: "application/json" } });
      limiter.report(res);
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) return null;
      if (res.status === 429 && attempt < MAX_ATTEMPTS) continue;
      throw new CompaniesHouseError(res.status, path);
    }
  }

  return {
    // Use company_name_includes for names: company_name is ignored by the API.
    advancedSearch: (p: AdvancedSearchParams) =>
      get<AdvancedSearchResult>("/advanced-search/companies", {
        location: p.location,
        incorporated_from: p.incorporatedFrom,
        incorporated_to: p.incorporatedTo,
        sic_codes: p.sicCodes,
        company_status: p.companyStatus ?? "active",
        company_type: p.companyType,
        company_name_includes: p.nameIncludes,
        size: p.size ?? 200,
        start_index: p.startIndex ?? 0,
      }),
    company: (number: string) => get<CompanyProfile>(`/company/${encodeURIComponent(number)}`),
    officers: (number: string, startIndex = 0) =>
      get<OfficerList>(`/company/${encodeURIComponent(number)}/officers`, {
        items_per_page: 100,
        start_index: startIndex,
      }),
    filingHistory: (number: string, startIndex = 0) =>
      get<FilingHistoryList>(`/company/${encodeURIComponent(number)}/filing-history`, {
        items_per_page: 100,
        start_index: startIndex,
      }),
    searchCompanies: (q: string, itemsPerPage = 20) =>
      get<SearchCompaniesResult>("/search/companies", { q, items_per_page: itemsPerPage }),
  };
}
