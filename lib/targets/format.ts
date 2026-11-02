import { sicLabel } from "@/lib/connectors/companies-house/sic";

// Small, pure formatting for the New Companies workspace: company age, a short
// sector name from SIC codes, and score steps.

/** "1 yr 2 mo", "9 mo", "2 yr", "Under 1 mo". Date-only strings are local dates. */
export function formatAge(incorporatedOn: string | null, now = new Date()): string | null {
  if (!incorporatedOn) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(incorporatedOn) ? `${incorporatedOn}T12:00:00` : incorporatedOn);
  if (Number.isNaN(d.getTime())) return null;
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 1) return "Under 1 mo";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} mo`;
  return rest === 0 ? `${years} yr` : `${years} yr ${rest} mo`;
}

// SIC 2007 code prefixes to a short sector name, most specific first. A plain
// reading of the register's own classification, not an inference.
const SECTORS: Array<[string, string]> = [
  ["47910", "E-commerce"],
  ["58210", "Games"],
  ["62011", "Games"],
  ["620", "Software"],
  ["582", "Software"],
  ["631", "Data and web"],
  ["639", "Information services"],
  ["731", "Agency"],
  ["732", "Market research"],
  ["741", "Design"],
  ["742", "Photography"],
  ["70229", "Consultancy"],
  ["70210", "Public relations"],
  ["701", "Holding company"],
  ["642", "Holding company"],
  ["64", "Finance"],
  ["65", "Insurance"],
  ["66", "Financial services"],
  ["691", "Legal"],
  ["692", "Accounting"],
  ["711", "Architecture and engineering"],
  ["72", "Research"],
  ["74", "Professional services"],
  ["78", "Recruitment"],
  ["82", "Business services"],
  ["68", "Property"],
  ["41", "Construction"],
  ["42", "Construction"],
  ["43", "Construction"],
  ["49", "Logistics"],
  ["52", "Logistics"],
  ["53", "Logistics"],
  ["55", "Hospitality"],
  ["56", "Food and drink"],
  ["10", "Food"],
  ["11", "Drinks"],
  ["46", "Wholesale"],
  ["47", "Retail"],
  ["45", "Motor trade"],
  ["59", "Film and video"],
  ["60", "Broadcasting"],
  ["90", "Arts"],
  ["93", "Sport and leisure"],
  ["85", "Education"],
  ["86", "Health"],
  ["87", "Care"],
  ["88", "Social care"],
  ["96", "Personal services"],
  ["81", "Facilities"],
  ["77", "Rental and leasing"],
  ["79", "Travel"],
  ["80", "Security"],
  ["61", "Telecoms"],
  ["35", "Energy"],
  ["01", "Farming"],
];

/** "Software", from the first SIC code with a known prefix, or null. */
export function sectorOf(sicCodes: string[] | null | undefined): string | null {
  for (const code of sicCodes ?? []) {
    const hit = SECTORS.find(([prefix]) => code.startsWith(prefix));
    if (hit) return hit[1];
  }
  return null;
}

/** "Business and domestic software development (62012)", one line per code. */
export function industryLines(sicCodes: string[] | null | undefined): string[] {
  return (sicCodes ?? []).map((code) => {
    const label = sicLabel(code);
    return label.startsWith("SIC ") ? label : `${label} (${code})`;
  });
}

export type ScoreStep = "high" | "mid" | "low" | "under";

/** 80 and above, 70 to 79, 60 to 69, under 60. */
export function scoreStep(score: number): ScoreStep {
  if (score >= 80) return "high";
  if (score >= 70) return "mid";
  if (score >= 60) return "low";
  return "under";
}

/** "Northwind Labs" from "Northwind Labs Ltd", for map labels. */
export function shortName(name: string): string {
  return name.replace(/\s+(Ltd\.?|Limited|LLP|PLC)$/i, "").trim() || name;
}
