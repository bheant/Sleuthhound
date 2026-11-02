import type { Database } from "sql.js";
import * as account from "@/lib/account/api";
import type { User } from "@/lib/account/api";
import { attachDatabase, detachDatabase } from "@/lib/db";
import { exportDatabase, loadSqlJs, openDatabase } from "@/lib/db/engine";
import { seal, unseal } from "./crypto";
import { DEFAULT_AUTO_LOCK_MINUTES, deleteStore, DEMO_DB, localStore, vaultDbName, type StoreName, type VaultMeta } from "./storage";
import { initWorkspace, readWorkspaceId } from "./workspace";

// The signed-in account and its vault in this tab. The data key lives only in
// this module's memory: nothing writes it anywhere, and Lock drops it. While
// open, the whole database sits in memory and is saved, sealed, a moment
// after each change. Only one tab holds the vault at a time, so two copies of
// the database can never overwrite each other.

export type VaultStatus =
  /** Before the server and the browser have answered. Also the prerendered state. */
  | "starting"
  /** Nobody is logged in: log in or sign up. */
  | "signed-out"
  /** Logged in, but the vault is locked: the password opens it. */
  | "locked"
  | "open"
  /** The sample workspace. No account, no network. */
  | "demo"
  /** A reset link is open: set a new password. */
  | "reset"
  /** This browser holds data sealed with a data key the account no longer has. */
  | "stale"
  /** Another tab holds the vault. */
  | "elsewhere"
  /** The server couldn't be reached to check the session. */
  | "offline"
  /** The browser lacks IndexedDB or WebCrypto. */
  | "unsupported";

export type VaultState = {
  status: VaultStatus;
  user: User | null;
  workspaceId: string | null;
  /** Shown once, after sign-up or a fresh start, until the user says it's saved. */
  recoveryCode: string | null;
  /** The reset link's token, while status is "reset". */
  resetToken: string | null;
  /** Set when a save failed; the data is still in memory and the next save retries. */
  saveError: string | null;
  /** /signup, and the sample's Create account link, open sign-up, not log in. */
  wantsSignUp: boolean;
  /** The invite from /signup?invite=…, which sign-up needs. */
  inviteToken: string | null;
  /** Locked from the remembered sign-in because the server couldn't be reached. */
  offline: boolean;
};

const SAVE_DELAY_MS = 800;
// Under a steady stream of writes, such as a run, save at least this often.
const SAVE_AT_MOST_MS = 5_000;
const TAB_LOCK = "sleuthhound-tab";
const CHANNEL = "sleuthhound";

const EMPTY: VaultState = { status: "starting", user: null, workspaceId: null, recoveryCode: null, resetToken: null, saveError: null, wantsSignUp: false, inviteToken: null, offline: false };
let state: VaultState = EMPTY;
const listeners = new Set<() => void>();

let key: CryptoKey | null = null;
let client: Database | null = null;
let store: StoreName | null = null;
/** The password-wrapped data key from the server, for unlocking after a reload. */
let byPassword: string | null = null;

function set(next: Partial<VaultState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function getVaultState(): VaultState {
  return state;
}

export function subscribeVault(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getServerVaultState = () => EMPTY;

// Saving

let dirty = false;
let firstDirtyAt = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> = Promise.resolve();

function onWrite() {
  if (!dirty) firstDirtyAt = Date.now();
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  const wait = Date.now() - firstDirtyAt >= SAVE_AT_MOST_MS ? 0 : SAVE_DELAY_MS;
  saveTimer = setTimeout(() => void flush(), wait);
}

async function write() {
  if (!dirty || !client || !store) return;
  const [c, k, s] = [client, key, store];
  dirty = false;
  try {
    const bytes = exportDatabase(c);
    const savedAt = new Date().toISOString();
    if (s === DEMO_DB) await localStore(s).snapshots.put({ id: "db", savedAt, bytes });
    else if (k) await localStore(s).snapshots.put({ id: "db", savedAt, sealed: await seal(k, bytes, "database") });
    if (state.saveError) set({ saveError: null });
  } catch {
    dirty = true;
    set({ saveError: "Couldn’t save to this browser’s storage. Free some disk space, then keep working: it tries again on the next change." });
  }
}

/** Saves now if anything changed. Lock, leaving the page and backups wait on it. */
export function flush(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  saving = saving.then(write);
  return saving;
}

// One tab at a time

let releaseTab: (() => void) | null = null;
let channel: BroadcastChannel | null = null;

function claimTab(wait: boolean): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    void navigator.locks.request(TAB_LOCK, wait ? {} : { ifAvailable: true }, (lock) => {
      if (!lock) return resolve(false);
      resolve(true);
      return new Promise<void>((release) => (releaseTab = release));
    });
  });
}

// Right after a reload or a link, the page being left may still hold the
// lock for a moment, so ask a few times before deciding another tab has it.
async function claimTabSoon(): Promise<boolean> {
  for (let i = 0; i < 6; i++) {
    if (await claimTab(false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function listenForTakeOver() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = async (event) => {
    if (event.data !== "take-over" || !releaseTab) return;
    await close();
    releaseTab();
    releaseTab = null;
    set({ ...EMPTY, status: "elsewhere" });
  };
}

/** Asks the tab holding the vault to let go, then starts here. */
export async function takeOverTab(): Promise<void> {
  channel?.postMessage("take-over");
  await claimTab(true);
  await enter();
}

// A reset link or an invite waits here from page load until this tab holds
// the vault.
let pendingReset: string | null = null;
let pendingInvite: string | null = null;

async function enter() {
  if (pendingReset) set({ ...EMPTY, status: "reset", resetToken: pendingReset });
  else await checkSession();
  pendingReset = null;
  // /signup opens sign-up for anyone not logged in; the log-in page doesn't
  // link to it. Sign-up needs the invite from the link.
  const signUpPage = window.location.pathname.replace(/\/$/, "") === "/signup";
  if ((signUpPage || pendingInvite) && getVaultState().status === "signed-out") set({ wantsSignUp: true, inviteToken: pendingInvite });
  pendingInvite = null;
}

// Starting

let started: Promise<void> | null = null;

/** Runs once, in the browser, when the app loads, however often it's called. */
export function startVault(): Promise<void> {
  started ??= start();
  return started;
}

async function start(): Promise<void> {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) {
    set({ status: "unsupported" });
    return;
  }
  // A reset link: /?reset=<token>. Taken out of the address bar at once.
  const params = new URL(window.location.href).searchParams;
  pendingReset = params.get("reset");
  pendingInvite = params.get("invite");
  if (pendingReset || pendingInvite) window.history.replaceState(null, "", window.location.pathname);

  listenForTakeOver();
  if (!(await claimTabSoon())) {
    set({ status: "elsewhere" });
    return;
  }
  // Leaving the page saves and lets go of the tab, so the next page (or a
  // page kept in the back-forward cache) doesn't keep the vault from it.
  window.addEventListener("pagehide", () => {
    void flush();
    releaseTab?.();
    releaseTab = null;
  });
  window.addEventListener("pageshow", async (event) => {
    if (!event.persisted) return;
    if (!(await claimTabSoon())) {
      await close();
      set({ ...EMPTY, status: "elsewhere" });
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
  await enter();
}

// The last sign-in, so the vault unlocks without a connection: the user's
// details and the password-wrapped data key. Both are what the server holds
// already; the key opens only with the password. Logging out forgets it.
const REMEMBERED = "sleuthhound:session";

function remember(user: User, wrapped: string) {
  try {
    localStorage.setItem(REMEMBERED, JSON.stringify({ user, byPassword: wrapped }));
  } catch {
    // Storage blocked: unlocking just needs a connection.
  }
}

function remembered(): { user: User; byPassword: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(REMEMBERED) ?? "null") as { user?: User; byPassword?: string } | null;
    return value?.user && value.byPassword ? { user: value.user, byPassword: value.byPassword } : null;
  } catch {
    return null;
  }
}

function forget() {
  try {
    localStorage.removeItem(REMEMBERED);
  } catch {
    // Nothing to forget.
  }
}

/** Asks the server who is logged in. Offline, the remembered sign-in stands in. */
export async function checkSession(): Promise<void> {
  const me = await account.fetchMe();
  if (!me.ok) {
    const last = remembered();
    byPassword = last?.byPassword ?? null;
    set(last ? { ...EMPTY, status: "locked", user: last.user, offline: true } : { ...EMPTY, status: "offline" });
    return;
  }
  byPassword = me.user ? (me.wrapped?.byPassword ?? null) : null;
  if (me.user && byPassword) {
    remember(me.user, byPassword);
    set({ ...EMPTY, status: "locked", user: me.user });
  } else {
    forget();
    set({ ...EMPTY, status: "signed-out" });
  }
}

// Opening and closing

async function openWith(name: StoreName, bytes: Uint8Array | null, businessName: string | null = null): Promise<string> {
  const SQL = await loadSqlJs();
  client = openDatabase(SQL, bytes, onWrite);
  store = name;
  attachDatabase(client);
  return readWorkspaceId() ?? initWorkspace(businessName);
}

// Opens the account's vault in this browser with its data key, making one on
// first use. Returns false when the stored data was sealed with another key.
async function openVault(user: User, dataKey: CryptoKey): Promise<boolean> {
  const name = vaultDbName(user.id);
  const local = localStore(name);
  const snapshot = await local.snapshots.get("db");
  let bytes: Uint8Array | null = null;
  if (snapshot?.sealed) {
    try {
      bytes = await unseal(dataKey, snapshot.sealed, "database");
    } catch {
      set({ status: "stale", user });
      return false;
    }
  }
  key = dataKey;
  const workspaceId = await openWith(name, bytes, user.company);
  if (!(await local.meta.get("vault"))) {
    const meta: VaultMeta = {
      id: "vault",
      version: 2,
      userId: user.id,
      createdAt: new Date().toISOString(),
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
      lastBackupAt: null,
      persisted: null,
    };
    await local.meta.put(meta);
  }
  if (!snapshot) {
    onWrite();
    await flush();
  }
  set({ status: "open", user, workspaceId });
  if (byPassword) remember(user, byPassword);
  void askToPersist();
  return true;
}

export type SignUpInput = { name: string; email: string; company: string; password: string };

export async function signUp(input: SignUpInput): Promise<string | null> {
  if (!state.inviteToken) return "Sign-up needs an invite link.";
  const res = await account.signUp({ ...input, invite: state.inviteToken });
  if (!res.ok) return res.message;
  // Kept for Lock and unlock, Change password and backups, without a reload.
  byPassword = res.byPassword;
  await openVault(res.user, res.dataKey);
  set({ recoveryCode: res.recoveryCode });
  return null;
}

/** Null on success, or the message to show. */
export async function logIn(email: string, password: string): Promise<string | null> {
  const res = await account.logIn(email, password);
  if (!res.ok) return res.message;
  byPassword = res.byPassword;
  await openVault(res.user, res.dataKey);
  return null;
}

/** False when the password is wrong. */
export async function unlock(password: string): Promise<boolean> {
  if (!state.user || !byPassword) return false;
  const dataKey = await account.unlockWith(state.user.email, password, byPassword);
  if (!dataKey) return false;
  await openVault(state.user, dataKey);
  return true;
}

export type ResetInput = { email: string; password: string; byRecovery: string; recoveryCode: string | null };

/** Sets a new password from the reset link. Null on success, or the message. */
export async function finishReset(input: ResetInput): Promise<string | null> {
  if (!state.resetToken) return "Open the reset link again.";
  const res = await account.resetPassword({ token: state.resetToken, ...input });
  if (!res.ok) return res.message;
  // A fresh start can't open what was sealed before, so it goes.
  if (res.newRecoveryCode) await deleteStore(vaultDbName(res.user.id));
  byPassword = res.byPassword;
  await openVault(res.user, res.dataKey);
  set({ resetToken: null, recoveryCode: res.newRecoveryCode });
  return null;
}

export function cancelReset(): Promise<void> {
  return checkSession();
}

/** After sign-up or a fresh start, once the recovery code is saved. */
export function recoveryCodeSaved(): void {
  set({ recoveryCode: null });
}

/** Deletes the data this browser can no longer open, and opens an empty vault. */
export async function discardStaleData(password: string): Promise<boolean> {
  if (!state.user || !byPassword) return false;
  const dataKey = await account.unlockWith(state.user.email, password, byPassword);
  if (!dataKey) return false;
  await deleteStore(vaultDbName(state.user.id));
  await openVault(state.user, dataKey);
  return true;
}

// Saves, then drops the database and the key from memory.
async function close() {
  await flush();
  detachDatabase();
  client?.close();
  client = null;
  key = null;
  store = null;
}

export async function lockVault(): Promise<void> {
  if (state.status !== "open") return;
  await close();
  set({ status: "locked", workspaceId: null, recoveryCode: null });
}

export async function logOutAccount(): Promise<void> {
  forget();
  await close();
  await account.logOut();
  byPassword = null;
  set({ ...EMPTY, status: "signed-out" });
}

/** Deletes this account's data from this browser. There is no undo. */
export async function resetLocalData(): Promise<void> {
  if (!state.user) return;
  dirty = false;
  if (saveTimer) clearTimeout(saveTimer);
  detachDatabase();
  client?.close();
  client = null;
  key = null;
  store = null;
  await deleteStore(vaultDbName(state.user.id));
  set({ status: "locked", workspaceId: null, saveError: null });
}

/** After the account is deleted on the server: removes the local data too. */
export async function forgetAccount(userId: string): Promise<void> {
  await resetLocalData();
  await deleteStore(vaultDbName(userId));
  forget();
  byPassword = null;
  set({ ...EMPTY, status: "signed-out" });
}

/** Keeps the new password's wrapped key, after a password change. */
export function passwordChanged(nextByPassword: string): void {
  byPassword = nextByPassword;
  if (state.user) remember(state.user, nextByPassword);
}

export function currentByPassword(): string | null {
  return byPassword;
}

// The sample workspace

/** Opens the sample workspace, which holds only made-up data. */
export async function openDemo(seed: (workspaceId: string) => void): Promise<void> {
  const snapshot = await localStore(DEMO_DB).snapshots.get("db");
  const workspaceId = await openWith(DEMO_DB, snapshot?.bytes ?? null);
  if (!snapshot) {
    seed(workspaceId);
    onWrite();
    await flush();
  }
  set({ status: "demo", workspaceId });
}

export async function leaveDemo({ signUp = false } = {}): Promise<void> {
  if (state.status !== "demo") return;
  await close();
  await checkSession();
  if (signUp && getVaultState().status === "signed-out") set({ wantsSignUp: true });
}

/** Starts the sample again from fresh data. */
export async function resetDemo(seed: (workspaceId: string) => void): Promise<void> {
  if (state.status === "demo") await close();
  await deleteStore(DEMO_DB);
  await openDemo(seed);
}

// Vault settings kept beside the data, readable without the password.

export async function vaultMeta(): Promise<VaultMeta | undefined> {
  return state.user ? localStore(vaultDbName(state.user.id)).meta.get("vault") : undefined;
}

export async function updateVaultMeta(change: Partial<Pick<VaultMeta, "autoLockMinutes" | "lastBackupAt" | "persisted">>): Promise<void> {
  if (state.user) await localStore(vaultDbName(state.user.id)).meta.update("vault", change);
}

// Asks the browser not to clear this site's storage under pressure. Browsers
// may say no; Settings then shows a quiet warning.
async function askToPersist() {
  if (!navigator.storage?.persist) return;
  try {
    const persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    await updateVaultMeta({ persisted });
  } catch {
    // Not available here: leave it unasked.
  }
}

/** The data key, for sealing a backup. Only the backup module calls this. */
export function dataKey(): CryptoKey | null {
  return key;
}

/** The open database's bytes, saved first so nothing is missing. */
export async function databaseBytes(): Promise<Uint8Array<ArrayBuffer>> {
  await flush();
  if (!client) throw new Error("The vault is locked.");
  return exportDatabase(client);
}

/** Replaces the open vault's database with restored bytes, and saves it. */
export async function replaceDatabase(bytes: Uint8Array): Promise<void> {
  if (!store || store === DEMO_DB || !state.user) throw new Error("Open your vault first.");
  const name = store;
  detachDatabase();
  client?.close();
  const workspaceId = await openWith(name, bytes);
  onWrite();
  await flush();
  set({ workspaceId });
}

// Auto-lock waits while something holds it open, such as a run in progress,
// since locking drops the database the run is writing to.

let holds = 0;

export function holdOpen(): () => void {
  holds++;
  let released = false;
  return () => {
    if (!released) holds--;
    released = true;
  };
}

export function isHeldOpen(): boolean {
  return holds > 0;
}
