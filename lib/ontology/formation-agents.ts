import { formatPostcode } from "./names";

// Well-known London formation agent and virtual office addresses, by postcode.
// A short hand-made list, not a register: a company here very likely uses a
// service address and has no accountant's office yet. Shared addresses the
// data shows (3 or more companies) catch the rest.
const KNOWN: Record<string, string> = {
  "WC2H 9JQ": "71-75 Shelton Street, Covent Garden",
  "N1 7GU": "20-22 Wenlock Road",
  "EC1V 2NX": "City Road (Kemp House and neighbours)",
  "EC2A 4NE": "86-90 Paul Street",
  "WC1N 3AX": "27 Old Gloucester Street",
  "W1W 5PF": "167-169 Great Portland Street",
  "W1W 7LT": "85 Great Portland Street",
};

/** The agent's address when the postcode is a known one, otherwise null. */
export function knownFormationAgent(postcode: string | null | undefined): string | null {
  const formatted = formatPostcode(postcode);
  return formatted ? (KNOWN[formatted] ?? null) : null;
}
