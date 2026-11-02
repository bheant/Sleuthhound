// The business Sleuthhound finds clients for, as the user names it in
// Settings. Every piece of copy that names it comes from here, with neutral
// wording when no name is set. Pure, so it's tested.

export const MAX_BUSINESS_NAME = 80;

/** A trimmed name, or null when there's none. */
export function cleanBusinessName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  return name ? name.slice(0, MAX_BUSINESS_NAME) : null;
}

/** "Acme’s", "Jones’". Pass "'" for text sent to an AI. */
export function possessive(name: string, apostrophe = "’"): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}${apostrophe}` : `${n}${apostrophe}s`;
}

/** "Acme’s clients", or "your clients" with no name. */
export const clientsOf = (name: string | null) => (name ? `${possessive(name)} clients` : "your clients");

/** "Acme’s sales", or "your sales". */
export const salesOf = (name: string | null) => (name ? `${possessive(name)} sales` : "your sales");

/** One client as a label: "Acme client", or "Your client". */
export const clientLabel = (name: string | null) => (name ? `${name} client` : "Your client");

/** Clients as a label: "Acme clients", or "Your clients". */
export const clientsLabel = (name: string | null) => (name ? `${name} clients` : "Your clients");

/** In a sentence: "a client of Acme", or "one of your clients". */
export const aClientOf = (name: string | null) => (name ? `a client of ${name}` : "one of your clients");

// For prompts. Sleuthhound's review rubric is written for an accounting firm
// finding UK companies, so that's how the business is described to the AI.

/** "Acme, a UK accounting firm", or "a UK accounting firm". */
export const firmIntro = (name: string | null) => (name ? `${name}, a UK accounting firm` : "a UK accounting firm");

/** "Acme's", or "the firm's". */
export const firmsPossessive = (name: string | null) => (name ? possessive(name, "'") : "the firm's");
