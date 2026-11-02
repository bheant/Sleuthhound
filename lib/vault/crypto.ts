// Sealing with AES-GCM, WebCrypto only. Every write gets a fresh random
// 12-byte IV, and each kind of payload is bound to its purpose through the
// additional data, so a sealed database can't be passed off as a wrapped key
// or the other way round. lib/account/keys.ts makes the keys.

const IV_BYTES = 12;

/** A sealed payload: the IV and the ciphertext, which ends with the GCM tag. */
export type Sealed = { iv: Uint8Array<ArrayBuffer>; data: Uint8Array<ArrayBuffer> };

/** What a sealed payload is for. Opening it as anything else fails. */
export type Purpose = "database" | "backup" | "datakey-password" | "datakey-recovery";

const AAD: Record<Purpose, Uint8Array<ArrayBuffer>> = {
  database: new TextEncoder().encode("sleuthhound:database:v1"),
  backup: new TextEncoder().encode("sleuthhound:backup:v1"),
  "datakey-password": new TextEncoder().encode("sleuthhound:datakey:password:v1"),
  "datakey-recovery": new TextEncoder().encode("sleuthhound:datakey:recovery:v1"),
};

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function seal(key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>, purpose: Purpose): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD[purpose] }, key, plaintext);
  return { iv, data: new Uint8Array(data) };
}

/** Throws when the key is wrong or the payload was changed. */
export async function unseal(key: CryptoKey, sealed: Sealed, purpose: Purpose): Promise<Uint8Array<ArrayBuffer>> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: sealed.iv, additionalData: AAD[purpose] },
    key,
    sealed.data,
  );
  return new Uint8Array(plain);
}

/** A sealed payload as one string, for the API and backup files: "v1.<iv>.<data>". */
export function packSealed(sealed: Sealed): string {
  return `v1.${toBase64(sealed.iv)}.${toBase64(sealed.data)}`;
}

export function unpackSealed(text: string): Sealed {
  const [version, iv, data] = text.split(".");
  if (version !== "v1" || !iv || !data) throw new Error("Unknown sealed format.");
  return { iv: fromBase64(iv), data: fromBase64(data) };
}
