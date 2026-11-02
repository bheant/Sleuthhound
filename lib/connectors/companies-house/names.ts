// Companies House returns names in capitals. Show them in title case, keeping
// suffixes and short forms people expect in capitals.

const UPPER = new Set(["LLP", "PLC", "UK", "LP", "CIC", "AI", "IT", "HR", "PR", "TV", "EU", "USA", "UAE", "B2B", "B2C", "SAAS", "VR", "AR", "3D"]);
const LOWER = new Set(["and", "of", "the", "for", "in", "on", "at", "to", "by", "de"]);

function titleWord(word: string, first: boolean): string {
  if (!/[A-Za-z]/.test(word)) return word;
  const bare = word.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (UPPER.has(bare) || /\d/.test(word)) return word.toUpperCase();
  const lower = word.toLowerCase();
  if (!first && LOWER.has(lower)) return lower;
  // Capitalise the first letter of each hyphenated or bracketed part, and after
  // an O' or D' prefix.
  return lower
    .replace(/(^|[-(/.&])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase())
    .replace(/^([od])'([a-z])/i,(_, p: string, c: string) => `${p.toUpperCase()}'${c.toUpperCase()}`);
}

export function titleCaseCompanyName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  // Leave names that already use mixed case alone.
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed
    .split(" ")
    .map((w, i) => titleWord(w, i === 0))
    .join(" ");
}

// Officer names arrive as "ROHAN, Stephan Louis Yannick". Show "Stephan Rohan".
export function officerDisplayName(name: string): string {
  const [surname, given] = name.split(",").map((s) => s.trim());
  if (!given) return titleCaseCompanyName(name.toUpperCase());
  const firstGiven = given.split(/\s+/)[0];
  const tc = (s: string) => titleCaseCompanyName(s.toUpperCase());
  return `${tc(firstGiven)} ${tc(surname)}`;
}
