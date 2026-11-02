import { describe, expect, it } from "vitest";
import { seal, unseal } from "@/lib/vault/crypto";
import {
  deriveAccountKeys,
  KDF_ITERATIONS,
  newDataKey,
  newRecoveryCode,
  normaliseEmail,
  openDataKey,
  parseRecoveryCode,
  rewrapWithPassword,
  rewrapWithRecovery,
} from "./keys";

// Few rounds keep the tests fast; production uses KDF_ITERATIONS.
const ROUNDS = 1_000;
const bytes = (s: string) => new TextEncoder().encode(s);

describe("account keys", () => {
  it("defaults to 600,000 PBKDF2 rounds", () => {
    expect(KDF_ITERATIONS).toBe(600_000);
  });

  it("derives the same auth key for the same password and email, ignoring email case", async () => {
    const a = await deriveAccountKeys("correct horse", "Sam@Example.com ", ROUNDS);
    const b = await deriveAccountKeys("correct horse", "sam@example.com", ROUNDS);
    expect(a.authKey).toBe(b.authKey);
    expect(atob(a.authKey)).toHaveLength(32);
    expect(normaliseEmail(" A@B.CO ")).toBe("a@b.co");
  });

  it("gives a different auth key for another password or another email", async () => {
    const base = await deriveAccountKeys("correct horse", "sam@example.com", ROUNDS);
    expect((await deriveAccountKeys("correct horsf", "sam@example.com", ROUNDS)).authKey).not.toBe(base.authKey);
    expect((await deriveAccountKeys("correct horse", "sal@example.com", ROUNDS)).authKey).not.toBe(base.authKey);
  });

  it("keeps the vault key separate from the auth key and unexportable", async () => {
    const { authKey, vaultKey } = await deriveAccountKeys("correct horse", "sam@example.com", ROUNDS);
    expect(vaultKey.extractable).toBe(false);
    // The auth key as an AES key can't open what the vault key sealed.
    const asKey = await crypto.subtle.importKey("raw", Uint8Array.from(atob(authKey), (c) => c.charCodeAt(0)), "AES-GCM", false, ["decrypt"]);
    const sealed = await seal(vaultKey, bytes("data"), "database");
    await expect(unseal(asKey, sealed, "database")).rejects.toThrow();
  });

  it("opens the data key with the password or the recovery code, not a wrong password", async () => {
    const code = newRecoveryCode();
    const { vaultKey } = await deriveAccountKeys("correct horse", "sam@example.com", ROUNDS);
    const { dataKey, wrapped } = await newDataKey(vaultKey, code);
    const sealed = await seal(dataKey, bytes("targets"), "database");

    const viaPassword = await openDataKey(wrapped.byPassword, vaultKey, "password");
    expect(new TextDecoder().decode(await unseal(viaPassword, sealed, "database"))).toBe("targets");

    const wrong = await deriveAccountKeys("wrong horse", "sam@example.com", ROUNDS);
    await expect(openDataKey(wrapped.byPassword, wrong.vaultKey, "password")).rejects.toThrow();
  });

  it("re-wraps for a new password after a reset, through the recovery code", async () => {
    const code = newRecoveryCode();
    const old = await deriveAccountKeys("old password", "sam@example.com", ROUNDS);
    const { dataKey, wrapped } = await newDataKey(old.vaultKey, code);
    const sealed = await seal(dataKey, bytes("clients"), "database");

    const next = await deriveAccountKeys("new password", "sam@example.com", ROUNDS);
    const typed = code.toLowerCase().replace(/-/g, " ");
    const { byPassword } = await rewrapWithRecovery(wrapped.byRecovery, typed, next.vaultKey);
    const reopened = await openDataKey(byPassword, next.vaultKey, "password");
    expect(new TextDecoder().decode(await unseal(reopened, sealed, "database"))).toBe("clients");
    await expect(rewrapWithRecovery(wrapped.byRecovery, newRecoveryCode(), next.vaultKey)).rejects.toThrow();
  });

  it("re-wraps for a changed password with the old one", async () => {
    const old = await deriveAccountKeys("old password", "sam@example.com", ROUNDS);
    const { dataKey, wrapped } = await newDataKey(old.vaultKey, newRecoveryCode());
    const sealed = await seal(dataKey, bytes("notes"), "database");
    const next = await deriveAccountKeys("new password", "sam@example.com", ROUNDS);
    const byPassword = await rewrapWithPassword(wrapped.byPassword, old.vaultKey, next.vaultKey);
    const reopened = await openDataKey(byPassword, next.vaultKey, "password");
    expect(new TextDecoder().decode(await unseal(reopened, sealed, "database"))).toBe("notes");
  });

  it("makes readable recovery codes and forgives case, spaces and look-alike letters", () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(newRecoveryCode()).not.toBe(code);
    expect(parseRecoveryCode(code.toLowerCase().replace(/-/g, " "))).toBe(code.replace(/-/g, ""));
    expect(parseRecoveryCode("0000-1111-2222-3333-4444-555O")).toBe("000011112222333344445550");
    expect(parseRecoveryCode("ILIL-0000-0000-0000-0000-0000")).toBe("111100000000000000000000");
    expect(parseRecoveryCode("too short")).toBeNull();
  });
});
