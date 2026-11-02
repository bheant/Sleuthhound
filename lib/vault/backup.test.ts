import { describe, expect, it } from "vitest";
import { deriveAccountKeys, newDataKey, newRecoveryCode } from "@/lib/account/keys";
import { backupDue, makeBackup, openBackup, readBackup } from "./backup";

const ROUNDS = 1_000;

async function account(password: string) {
  const { vaultKey } = await deriveAccountKeys(password, "sam@example.com", ROUNDS);
  return newDataKey(vaultKey, newRecoveryCode());
}

describe("backup files", () => {
  it("opens with the right password and carries version and key-derivation details", async () => {
    const { dataKey, wrapped } = await account("the right password");
    const bytes = new TextEncoder().encode("SQLite format 3 and everything after");
    const text = await makeBackup({ bytes, dataKey, byPassword: wrapped.byPassword, email: "Sam@Example.com", iterations: ROUNDS });

    const file = readBackup(text)!;
    expect(file).toMatchObject({ format: "sleuthhound-backup", version: 1, email: "sam@example.com", kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ROUNDS, salt: "email" } });
    expect(text).not.toContain("SQLite format 3");

    const opened = await openBackup(text, "the right password");
    expect(opened.ok && new TextDecoder().decode(opened.bytes)).toBe("SQLite format 3 and everything after");
  });

  it("refuses a wrong password and a file that isn't a backup", async () => {
    const { dataKey, wrapped } = await account("the right password");
    const text = await makeBackup({ bytes: new Uint8Array([1, 2, 3]), dataKey, byPassword: wrapped.byPassword, email: "sam@example.com", iterations: ROUNDS });
    expect(await openBackup(text, "the wrong password")).toMatchObject({ ok: false });
    expect(await openBackup("{}", "anything")).toMatchObject({ ok: false, message: "That isn’t a Sleuthhound backup file." });
    expect(await openBackup("not json", "anything")).toMatchObject({ ok: false });
  });

  it("reminds after 14 days without a backup", () => {
    const day = 24 * 60 * 60_000;
    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(backupDue(null, new Date(now - 3 * day).toISOString(), now)).toBe(false);
    expect(backupDue(null, new Date(now - 15 * day).toISOString(), now)).toBe(true);
    expect(backupDue(new Date(now - 13 * day).toISOString(), new Date(now - 90 * day).toISOString(), now)).toBe(false);
    expect(backupDue(new Date(now - 15 * day).toISOString(), new Date(now - 90 * day).toISOString(), now)).toBe(true);
  });
});
