// A small lookup of SIC 2007 codes common among young London companies, so the
// Scope form can show names beside codes. Not the full list of 700-odd codes.

export const COMMON_SIC_CODES: Record<string, string> = {
  "47910": "Retail sale via mail order houses or via internet",
  "56101": "Licensed restaurants",
  "58290": "Other software publishing",
  "59111": "Motion picture production activities",
  "62011": "Ready-made interactive leisure and entertainment software development",
  "62012": "Business and domestic software development",
  "62020": "Information technology consultancy activities",
  "62090": "Other information technology service activities",
  "63110": "Data processing, hosting and related activities",
  "63120": "Web portals",
  "64209": "Activities of other holding companies not elsewhere classified",
  "66190": "Activities auxiliary to financial intermediation not elsewhere classified",
  "68209": "Other letting and operating of own or leased real estate",
  "70100": "Activities of head offices",
  "70210": "Public relations and communications activities",
  "70229": "Management consultancy activities other than financial management",
  "71129": "Other engineering activities",
  "72190": "Other research and experimental development on natural sciences and engineering",
  "73110": "Advertising agencies",
  "73120": "Media representation services",
  "74100": "Specialised design activities",
  "74201": "Portrait photographic activities",
  "74909": "Other professional, scientific and technical activities not elsewhere classified",
  "78109": "Other activities of employment placement agencies",
  "82990": "Other business support service activities not elsewhere classified",
  "85590": "Other education not elsewhere classified",
  "86900": "Other human health activities",
  "90030": "Artistic creation",
  "96090": "Other personal service activities not elsewhere classified",
};

export function sicLabel(code: string): string {
  return COMMON_SIC_CODES[code] ?? `SIC ${code}`;
}
