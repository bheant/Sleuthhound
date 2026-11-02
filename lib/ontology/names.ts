// Pure helpers the resolver matches on. No I/O, so they're unit tested.

const SUFFIXES = new Set(["ltd", "limited", "llp", "plc", "uk"]);

// "The Quill & Co. Studio (UK) Ltd" → "the quill and co studio". "&" reads as
// "and", as the register spells it. Suffixes are only stripped from the end,
// so "UK Power Networks" keeps its "uk".
export function normaliseName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

// The outward code of a UK postcode: "N1 3NY" → "N1", "sw1a1aa" → "SW1A".
// Returns null when the text can't be a postcode.
export function postcodeDistrict(postcode: string | null | undefined): string | null {
  if (!postcode) return null;
  const compact = postcode.toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(compact)) return null;
  return compact.slice(0, -3);
}

/** "n13ny" → "N1 3NY", or null when it isn't a postcode. */
export function formatPostcode(postcode: string | null | undefined): string | null {
  const district = postcodeDistrict(postcode);
  if (!district || !postcode) return null;
  const compact = postcode.toUpperCase().replace(/\s+/g, "");
  return `${district} ${compact.slice(-3)}`;
}

/** "https://www.northwind.io/about" → "northwind.io". */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
