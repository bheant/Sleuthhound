import { z } from "zod";
import { deriveAccountKeys, KDF_ITERATIONS, normaliseEmail, openDataKey } from "@/lib/account/keys";
import { packSealed, seal, unpackSealed, unseal } from "./crypto";

// A .sleuthhound backup file: the whole database, sealed with the account's
// data key, plus what's needed to open it with the password used when it was
// made: the key-derivation settings, the email they use as salt, and the data
// key wrapped by that password's vault key. Nothing in it is readable without
// that password.

const FORMAT = "sleuthhound-backup";

const fileSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(1),
  createdAt: z.string(),
  kdf: z.object({ name: z.literal("PBKDF2"), hash: z.literal("SHA-256"), iterations: z.number().int().min(1_000), salt: z.literal("email") }),
  email: z.string(),
  wrapped: z.object({ byPassword: z.string() }),
  data: z.string(),
});

export type BackupFile = z.infer<typeof fileSchema>;

/** iterations: the rounds the account's keys were derived with. */
export async function makeBackup(input: {
  bytes: Uint8Array<ArrayBuffer>;
  dataKey: CryptoKey;
  byPassword: string;
  email: string;
  iterations?: number;
  now?: Date;
}): Promise<string> {
  const file: BackupFile = {
    format: FORMAT,
    version: 1,
    createdAt: (input.now ?? new Date()).toISOString(),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: input.iterations ?? KDF_ITERATIONS, salt: "email" },
    email: normaliseEmail(input.email),
    wrapped: { byPassword: input.byPassword },
    data: packSealed(await seal(input.dataKey, input.bytes, "backup")),
  };
  return JSON.stringify(file);
}

export type OpenResult = { ok: true; bytes: Uint8Array<ArrayBuffer>; createdAt: string } | { ok: false; message: string };

export function readBackup(text: string): BackupFile | null {
  try {
    const parsed = fileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Opens a backup with the password its account had when it was made. */
export async function openBackup(text: string, password: string): Promise<OpenResult> {
  const file = readBackup(text);
  if (!file) return { ok: false, message: "That isn’t a Sleuthhound backup file." };
  const { vaultKey } = await deriveAccountKeys(password, file.email, file.kdf.iterations);
  try {
    const dataKey = await openDataKey(file.wrapped.byPassword, vaultKey, "password");
    return { ok: true, bytes: await unseal(dataKey, unpackSealed(file.data), "backup"), createdAt: file.createdAt };
  } catch {
    return { ok: false, message: `That password doesn’t open this backup. Use the password ${file.email} had when it was made.` };
  }
}

export const backupFileName = (now = new Date()) => `sleuthhound-${now.toISOString().slice(0, 10)}.sleuthhound`;

export const BACKUP_REMINDER_DAYS = 14;

/** True when the last backup is older than the reminder allows, or there's none. */
export function backupDue(lastBackupAt: string | null, createdAt: string, now = Date.now()): boolean {
  const since = Date.parse(lastBackupAt ?? createdAt);
  return now - since > BACKUP_REMINDER_DAYS * 24 * 60 * 60_000;
}
