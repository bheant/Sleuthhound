import fs from "node:fs";
import path from "node:path";
import type { Database, SqlValue } from "sql.js";
import { loadSqlJs } from "@/lib/db/engine";

// Enough of D1's API, on sql.js, to run the functions in tests against the
// real migrations.

class Statement {
  constructor(
    private readonly db: Database,
    private readonly sql: string,
    private readonly values: SqlValue[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new Statement(this.db, this.sql, values as SqlValue[]);
  }

  private rows(): Record<string, unknown>[] {
    const stmt = this.db.prepare(this.sql);
    stmt.bind(this.values);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  async first<T>(): Promise<T | null> {
    return (this.rows()[0] as T) ?? null;
  }

  async all<T>() {
    return { results: this.rows() as T[], success: true };
  }

  async run() {
    this.rows();
    return { success: true, meta: { changes: this.db.getRowsModified() } };
  }
}

export async function fakeD1(): Promise<D1Database> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  db.exec("PRAGMA foreign_keys = ON");
  const dir = path.join(process.cwd(), "d1/migrations");
  for (const file of fs.readdirSync(dir).sort()) db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
  return {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (stmts: Statement[]) => Promise.all(stmts.map((s) => s.run())),
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;
}
