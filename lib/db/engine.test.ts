import { describe, expect, it } from "vitest";
import { seal, unseal } from "@/lib/vault/crypto";
import { exportDatabase, loadSqlJs, openDatabase } from "./engine";
import { MIGRATIONS } from "./migrations.generated";

const tables = (client: ReturnType<typeof openDatabase>) =>
  client.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0].values.map(([n]) => String(n));

describe("database engine", () => {
  it("applies every migration to a new database, once", async () => {
    const SQL = await loadSqlJs();
    const client = openDatabase(SQL, null);
    expect(tables(client)).toEqual(expect.arrayContaining(["targets", "signals", "sources", "__migrations"]));
    const applied = client.exec("SELECT count(*) FROM __migrations")[0].values[0][0];
    expect(applied).toBe(MIGRATIONS.length);

    const reopened = openDatabase(SQL, exportDatabase(client));
    expect(reopened.exec("SELECT count(*) FROM __migrations")[0].values[0][0]).toBe(MIGRATIONS.length);
  });

  it("reports writes, but not reads, and the rows a statement changed", async () => {
    const SQL = await loadSqlJs();
    let writes = 0;
    const client = openDatabase(SQL, null, () => writes++);
    client.prepare("SELECT 1").free();
    expect(writes).toBe(0);

    const insert = client.prepare("INSERT INTO workspaces (id, name, labels) VALUES (?, ?, ?)");
    expect(insert.run(["w1", "Acme", "{}"])).toEqual({ changes: 1 });
    insert.free();
    expect(writes).toBe(1);
  });

  it("keeps foreign keys on after an export", async () => {
    const SQL = await loadSqlJs();
    const client = openDatabase(SQL, null);
    exportDatabase(client);
    expect(client.exec("PRAGMA foreign_keys")[0].values[0][0]).toBe(1);
  });

  it("survives a sealed snapshot round trip", async () => {
    const SQL = await loadSqlJs();
    const client = openDatabase(SQL, null);
    client.run("INSERT INTO workspaces (id, name, labels) VALUES ('w1', 'Acme', '{}')");
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const sealed = await seal(key, exportDatabase(client), "database");

    const restored = openDatabase(SQL, await unseal(key, sealed, "database"));
    expect(restored.exec("SELECT name FROM workspaces")[0].values).toEqual([["Acme"]]);
  });
});
