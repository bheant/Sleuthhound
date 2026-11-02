// Corporate bodies: the Companies House company types Apollo and HubSpot are
// offered for. Sole traders and partnerships have no register entry, and
// charities, CICs and overseas entities aren't the kind of client this is for.
const CORPORATE = new Set([
  "ltd",
  "plc",
  "llp",
  "private-unlimited",
  "private-limited-guarant-nsc",
  "private-limited-guarant-nsc-limited-exemption",
  "private-limited-shares-section-30-exemption",
]);

export function isCorporateBody(companyType: string | null | undefined): boolean {
  return Boolean(companyType && CORPORATE.has(companyType));
}
