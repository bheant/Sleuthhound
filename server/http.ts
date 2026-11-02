import type { z } from "zod";

// Responses and request checks shared by every function. Errors carry plain
// copy for the page to show, never internals.

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export const fail = (message: string, status: number, headers: HeadersInit = {}) => json({ ok: false, message }, status, headers);

export const tooMany = (retryAfterSec: number) =>
  fail("Too many attempts. Wait a few minutes, then try again.", 429, { "Retry-After": String(retryAfterSec) });

// Cookies are SameSite=Strict, and on top of that a change must come from
// this site's own pages: browsers say so in Sec-Fetch-Site, older ones in Origin.
export function fromThisSite(request: Request): boolean {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const parsed = schema.safeParse(await request.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The caller's IP, for rate limits only. */
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/** Two-letter country from Cloudflare, when it knows. */
export function clientCountry(request: Request): string | null {
  const country = (request as Request & { cf?: { country?: unknown } }).cf?.country;
  return typeof country === "string" && /^[A-Z]{2}$/.test(country) ? country : null;
}
