import type { Database } from "sql.js";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import * as schema from "./schema";

// The database open in this tab: the vault's while it's unlocked, or the
// demo's. `db` stands in for whichever is open, so the rest of the app imports
// it as before; using it while nothing is open throws.

export type DB = SQLJsDatabase<typeof schema>;

let current: DB | null = null;

export function attachDatabase(client: Database): DB {
  current = drizzle(client, { schema });
  return current;
}

export function detachDatabase(): void {
  current = null;
}

export function isDatabaseOpen(): boolean {
  return current !== null;
}

function open(): DB {
  if (!current) throw new Error("The vault is locked.");
  return current;
}

// Methods run with the proxy as `this`, and every property they read goes
// through it to the open database.
export const db: DB = new Proxy({} as DB, {
  get: (_, prop) => Reflect.get(open(), prop),
  has: (_, prop) => Reflect.has(open(), prop),
});

export { schema };

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
// Anything that can write: the database itself or an open transaction.
export type Writer = DB | Tx;

/** Rows changed by a `.run()`. lib/db/engine.ts makes run() report them. */
export function rowsChanged(result: unknown): number {
  return (result as { changes?: number } | undefined)?.changes ?? 0;
}
