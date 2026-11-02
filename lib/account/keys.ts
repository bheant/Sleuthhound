import { packSealed, seal, toBase64, unpackSealed, unseal } from "@/lib/vault/crypto";

// The account's keys, made in the browser (the Bitwarden model).
//
//   master   = PBKDF2-SHA256(password, salt = email, 600,000 rounds)
//   authKey  = HKDF(master, "sleuthhound auth v1")   sent to log in, stored hashed
//   vaultKey = HKDF(master, "sleuthhound vault v1")  never leaves the browser
//
// The data is encrypted with a random data key, not the vault key. The vault
// key wraps the data key, and so does a key from the recovery code, so a new
// password only re-wraps it and the recovery code still opens everything after
// an admin reset. The server keeps both wrapped copies and can open neither.

export const KDF_ITERATIONS = 600_000;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

const text = (s: string) => new TextEncoder().encode(s);
const hkdf = (info: string) => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: text(info) });

export type AccountKeys = {
  /** Base64 of 32 bytes. Proves the password to the server without revealing it. */
  authKey: string;
  /** Opens the password-wrapped data key. Can't be exported. */
  vaultKey: CryptoKey;
};

export async function deriveAccountKeys(password: string, email: string, iterations = KDF_ITERATIONS): Promise<AccountKeys> {
  const material = await crypto.subtle.importKey("raw", text(password.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  const master = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", iterations, salt: text(normaliseEmail(email)) },
    material,
    256,
  );
  const stretched = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits", "deriveKey"]);
  const auth = await crypto.subtle.deriveBits(hkdf("sleuthhound auth v1"), stretched, 256);
  const vaultKey = await crypto.subtle.deriveKey(hkdf("sleuthhound vault v1"), stretched, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  return { authKey: toBase64(new Uint8Array(auth)), vaultKey };
}

const importDataKey = (raw: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

/** Both wrapped copies of a data key, as the server stores them. */
export type WrappedKeys = { byPassword: string; byRecovery: string };

/** A new data key, wrapped by the vault key and the recovery code. */
export async function newDataKey(vaultKey: CryptoKey, recoveryCode: string): Promise<{ dataKey: CryptoKey; wrapped: WrappedKeys }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  try {
    return {
      dataKey: await importDataKey(raw),
      wrapped: {
        byPassword: packSealed(await seal(vaultKey, raw, "datakey-password")),
        byRecovery: packSealed(await seal(await recoveryKey(recoveryCode), raw, "datakey-recovery")),
      },
    };
  } finally {
    raw.fill(0);
  }
}

/** Opens a wrapped data key. Throws when the key is wrong. */
export async function openDataKey(wrapped: string, key: CryptoKey, by: "password" | "recovery"): Promise<CryptoKey> {
  const raw = await unseal(key, unpackSealed(wrapped), by === "password" ? "datakey-password" : "datakey-recovery");
  try {
    return await importDataKey(raw);
  } finally {
    raw.fill(0);
  }
}

/** Opens the recovery copy and wraps the same data key for a new vault key. */
export async function rewrapWithRecovery(byRecovery: string, recoveryCode: string, newVaultKey: CryptoKey): Promise<{ dataKey: CryptoKey; byPassword: string }> {
  const raw = await unseal(await recoveryKey(recoveryCode), unpackSealed(byRecovery), "datakey-recovery");
  try {
    return { dataKey: await importDataKey(raw), byPassword: packSealed(await seal(newVaultKey, raw, "datakey-password")) };
  } finally {
    raw.fill(0);
  }
}

/** Wraps an open data key for a new password, by way of the old password's copy. */
export async function rewrapWithPassword(byPassword: string, oldVaultKey: CryptoKey, newVaultKey: CryptoKey): Promise<string> {
  const raw = await unseal(oldVaultKey, unpackSealed(byPassword), "datakey-password");
  try {
    return packSealed(await seal(newVaultKey, raw, "datakey-password"));
  } finally {
    raw.fill(0);
  }
}

// Recovery codes: 120 random bits in Crockford base32, as six groups of four,
// such as 7KQ2-M9XD-... Easy to read aloud and to type; I, L, O and U are
// left out, and typing them is forgiven.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_BYTES = 15;

export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_BYTES));
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join("-");
}

/** The code's 24 characters, or null when it can't be a recovery code. */
export function parseRecoveryCode(code: string): string | null {
  const clean = code
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V");
  return /^[0-9A-HJKMNP-TV-Z]{24}$/.test(clean) ? clean : null;
}

// The code is 120 random bits, so it needs no slow stretching: HKDF turns it
// into a key directly.
async function recoveryKey(code: string): Promise<CryptoKey> {
  const clean = parseRecoveryCode(code);
  if (!clean) throw new Error("That isn’t a recovery code.");
  const material = await crypto.subtle.importKey("raw", text(clean), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(hkdf("sleuthhound recovery v1"), material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
