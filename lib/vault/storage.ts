import Dexie, { type Table } from "dexie";
import type { Sealed } from "./crypto";

// IndexedDB through Dexie. Each account's vault and the sample workspace live
// in separate databases, so they can never mix. Each holds one row of
// settings and one snapshot of the SQLite database: sealed with the account's
// data key, or plain for the sample, which holds only made-up data.

export const DEMO_DB = "sleuthhound-demo";

export type StoreName = `sleuthhound-${string}`;

export const vaultDbName = (userId: string): StoreName => `sleuthhound-${userId}`;

export const DEFAULT_AUTO_LOCK_MINUTES = 30;

/** Readable without the password, so it holds nothing about the data itself. */
export type VaultMeta = {
  id: "vault";
  version: 2;
  userId: string;
  createdAt: string;
  autoLockMinutes: number;
  lastBackupAt: string | null;
  /** The browser's answer to navigator.storage.persist(). Null until asked. */
  persisted: boolean | null;
};

export type Snapshot =
  | { id: "db"; savedAt: string; sealed: Sealed; bytes?: undefined }
  | { id: "db"; savedAt: string; bytes: Uint8Array<ArrayBuffer>; sealed?: undefined };

class LocalStore extends Dexie {
  meta!: Table<VaultMeta, string>;
  snapshots!: Table<Snapshot, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ meta: "id", snapshots: "id" });
  }
}

const stores = new Map<string, LocalStore>();

export function localStore(name: StoreName): LocalStore {
  let store = stores.get(name);
  if (!store) {
    store = new LocalStore(name);
    stores.set(name, store);
  }
  return store;
}

/** Deletes a database outright. The next localStore() call starts a new one. */
export async function deleteStore(name: StoreName): Promise<void> {
  const store = stores.get(name);
  stores.delete(name);
  store?.close();
  await Dexie.delete(name);
}
