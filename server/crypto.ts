// Small crypto helpers for the server, WebCrypto only.

const enc = new TextEncoder();

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** A random token for a cookie or a reset link: 32 bytes, base64url. */
export function randomToken(): string {
  return toBase64(randomBytes(32)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

// The browser sends an auth key that is already 256 bits stretched by
// 600,000 PBKDF2 rounds, so one salted SHA-256 is enough here. A slow hash
// wouldn't fit the free plan's 10 ms of CPU per request anyway.
export async function hashAuthKey(salt: Uint8Array<ArrayBuffer>, authKey: Uint8Array<ArrayBuffer>): Promise<string> {
  const joined = new Uint8Array(salt.length + authKey.length);
  joined.set(salt);
  joined.set(authKey, salt.length);
  return toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", joined)));
}

/** Compares in time that doesn't depend on where the strings differ. */
export function sameText(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** A new salt and hash for an auth key. */
export async function newAuthHash(authKey: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16);
  return { salt: toBase64(salt), hash: await hashAuthKey(salt, fromBase64(authKey)) };
}

export async function checkAuthKey(authKey: string, salt: string | null, hash: string | null): Promise<boolean> {
  if (!salt || !hash) return false;
  return sameText(await hashAuthKey(fromBase64(salt), fromBase64(authKey)), hash);
}
