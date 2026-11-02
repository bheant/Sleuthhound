import type { HnHit } from "./types";

// Pure helpers for Hacker News items. No I/O, so they're unit tested.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Hacker News text is HTML: paragraphs become blank lines, tags go, entities decode. */
export function plainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const isComment = (hit: HnHit) => Boolean(hit._tags?.includes("comment") || (!hit.title && hit.comment_text));

export function itemUrl(hit: HnHit): string {
  return `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`;
}

/** The post's own text: a comment's text, or a story's title and text. */
export function bodyOf(hit: HnHit): string {
  if (isComment(hit)) return plainText(hit.comment_text);
  return [hit.title ?? "", plainText(hit.story_text)].filter(Boolean).join("\n\n");
}

/** The story title, or the first 80 characters of a comment. */
export function titleOf(hit: HnHit): string {
  if (!isComment(hit) && hit.title) return hit.title.trim();
  const text = plainText(hit.comment_text).replace(/\s+/g, " ");
  if (text.length <= 80) return text || "Comment on Hacker News";
  const cut = text.slice(0, 79);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether text contains the phrase as whole words, ignoring case. */
export function mentions(text: string, phrase: string): boolean {
  const words = phrase.trim().split(/\s+/).filter(Boolean).map(escape);
  if (words.length === 0) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${words.join("\\s+")}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

/** "2 h ago", "3 days ago", for preview rows. */
export function ageText(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
