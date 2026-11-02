import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { MIGRATIONS } from "./migrations.generated";

// SQLite in WebAssembly, held in memory while the vault is open. The vault
// saves it as one encrypted snapshot (lib/vault/session.ts); this module only
// opens databases, migrates them and says when something was written.

let loading: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(): Promise<SqlJsStatic> {
  // In the browser the WebAssembly is served from public/ (scripts/prepare.mjs
  // copies it there); in tests sql.js finds its own copy.
  loading ??= initSqlJs(typeof window === "undefined" ? {} : { locateFile: () => "/sql-wasm.wasm" });
  return loading;
}

const WRITE = /^\s*(insert|update|delete|replace|create|drop|alter)\b/i;

/**
 * Opens a database from a snapshot, or an empty one, and brings it up to the
 * latest migration. onWrite runs whenever a statement that changes data is
 * prepared; statements' run() reports the rows it changed, as better-sqlite3
 * did, so `.run().changes` keeps working (see rowsChanged in ./index).
 */
export function openDatabase(SQL: SqlJsStatic, bytes: Uint8Array | null, onWrite: () => void = () => {}): Database {
  const client = new SQL.Database(bytes ?? undefined);
  client.exec("PRAGMA foreign_keys = ON");
  migrate(client);

  const prepare = client.prepare.bind(client);
  client.prepare = (sql, params) => {
    const stmt = prepare(sql, params);
    if (WRITE.test(sql)) {
      onWrite();
      const run = stmt.run.bind(stmt);
      // sql.js's run returns true; drizzle passes its result straight through.
      stmt.run = ((values) => {
        run(values);
        return { changes: client.getRowsModified() };
      }) as typeof stmt.run;
    }
    return stmt;
  };
  return client;
}

/** The database's bytes. Export resets pragmas, so foreign keys go back on. */
export function exportDatabase(client: Database): Uint8Array<ArrayBuffer> {
  const bytes = client.export();
  client.exec("PRAGMA foreign_keys = ON");
  return bytes as Uint8Array<ArrayBuffer>;
}

// Applies the migrations a database hasn't had yet, each in its own
// transaction. Foreign keys are off meanwhile, because drizzle-kit rebuilds a
// table to change a column, and the pragma can't change inside a transaction.
function migrate(client: Database) {
  client.exec("CREATE TABLE IF NOT EXISTS __migrations (tag text PRIMARY KEY NOT NULL, applied_at text NOT NULL)");
  const done = new Set(client.exec("SELECT tag FROM __migrations")[0]?.values.map(([tag]) => String(tag)) ?? []);
  const pending = MIGRATIONS.filter((m) => !done.has(m.tag));
  if (!pending.length) return;

  client.exec("PRAGMA foreign_keys = OFF");
  try {
    for (const m of pending) {
      client.exec("BEGIN");
      try {
        for (const statement of m.statements) client.exec(statement);
        client.run("INSERT INTO __migrations (tag, applied_at) VALUES (?, ?)", [m.tag, new Date().toISOString()]);
        client.exec("COMMIT");
      } catch (error) {
        client.exec("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.exec("PRAGMA foreign_keys = ON");
  }
}
