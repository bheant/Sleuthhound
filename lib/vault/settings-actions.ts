import * as account from "@/lib/account/api";
import { backupFileName, makeBackup, openBackup } from "./backup";
import { refresh } from "./live";
import {
  currentByPassword,
  databaseBytes,
  dataKey,
  forgetAccount,
  getVaultState,
  passwordChanged,
  replaceDatabase,
  updateVaultMeta,
} from "./session";

// Actions for the Settings page. Each returns plain copy for the page.

type Result = { ok: true; message?: string } | { ok: false; message: string };

function signedIn() {
  const { user, status } = getVaultState();
  return status === "open" && user ? user : null;
}

/** The backup file's text and name, sealed with the account's data key. */
export async function exportBackup(): Promise<({ ok: true; text: string; fileName: string }) | { ok: false; message: string }> {
  const user = signedIn();
  const key = dataKey();
  const byPassword = currentByPassword();
  if (!user || !key || !byPassword) return { ok: false, message: "Unlock first." };
  const text = await makeBackup({ bytes: await databaseBytes(), dataKey: key, byPassword, email: user.email });
  await updateVaultMeta({ lastBackupAt: new Date().toISOString() });
  return { ok: true, text, fileName: backupFileName() };
}

/** Replaces everything in this browser with the backup's contents. */
export async function importBackup(text: string, password: string): Promise<Result> {
  if (!signedIn()) return { ok: false, message: "Unlock first." };
  const opened = await openBackup(text, password);
  if (!opened.ok) return opened;
  await replaceDatabase(opened.bytes);
  refresh();
  return { ok: true, message: `Restored the backup from ${new Date(opened.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.` };
}

export async function setAutoLock(minutes: number): Promise<Result> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) return { ok: false, message: "Choose a time from the list." };
  await updateVaultMeta({ autoLockMinutes: minutes });
  return { ok: true };
}

export async function changeMyPassword(current: string, next: string): Promise<Result> {
  const user = signedIn();
  const byPassword = currentByPassword();
  if (!user || !byPassword) return { ok: false, message: "Unlock first." };
  const res = await account.changePassword({ email: user.email, current, next, byPassword });
  if (!res.ok) return res;
  passwordChanged(res.byPassword);
  return { ok: true, message: "Password changed. Other devices are logged out." };
}

export async function deleteMyAccount(password: string): Promise<Result> {
  const user = signedIn();
  if (!user) return { ok: false, message: "Unlock first." };
  const res = await account.deleteAccount(user.email, password);
  if (!res.ok) return res;
  await forgetAccount(user.id);
  return { ok: true };
}
