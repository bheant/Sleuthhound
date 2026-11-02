// Companies that are vehicles rather than startups that need an accountant: holding
// companies, property and building companies, head offices. They stay
// targets but never enter the review ranking, and their share filings are
// never read as funding.

// Holding companies (642, 643), property (681 to 683), head offices (701),
// residents' property management (98000) and building development (41100).
const VEHICLE_CODES = ["642", "643", "681", "682", "683", "701", "98000", "41100"];

/** True when every SIC code is a vehicle code. */
export function isHoldingOrProperty(sicCodes: string[]): boolean {
  return sicCodes.length > 0 && sicCodes.every((code) => VEHICLE_CODES.some((p) => code.startsWith(p)));
}

// Whole words only, so "Holdingsworth" or "Freeholder Media" don't count.
const VEHICLE_NAME = /\b(topco|holdco|freehold|holdings|hmo)\b/i;

export function hasVehicleName(name: string): boolean {
  return VEHICLE_NAME.test(name);
}

/** A holding, property or head-office company, by its codes or its name. */
export function isVehicle(company: { name: string; sicCodes: string[] | null }): boolean {
  return isHoldingOrProperty(company.sicCodes ?? []) || hasVehicleName(company.name);
}
