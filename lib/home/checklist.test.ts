import { beforeEach, describe, expect, it } from "vitest";
import { attachDatabase, db, schema } from "@/lib/db";
import { loadSqlJs, openDatabase } from "@/lib/db/engine";
import { setBusinessName } from "@/lib/business/store";
import { setSetting } from "@/lib/settings";
import { initWorkspace } from "@/lib/vault/workspace";
import { setupChecklist } from "./checklist";

let ws: string;

beforeEach(async () => {
  attachDatabase(openDatabase(await loadSqlJs(), null));
  ws = initWorkspace(null);
});

const done = () => Object.fromEntries(setupChecklist(ws).items.map((i) => [i.key, i.done]));

describe("setup checklist", () => {
  it("starts with nothing done, and ticks each step off from the data", () => {
    expect(done()).toEqual({ business: false, key: false, source: false });
    expect(setupChecklist(ws).show).toBe(true);

    setBusinessName(ws, "Acme");
    db.insert(schema.credentials).values({ workspaceId: ws, service: "anthropic", secret: "sk", last4: "0000", status: "rejected" }).run();
    expect(done()).toEqual({ business: true, key: false, source: false });

    db.update(schema.credentials).set({ status: "connected" }).run();
    db.insert(schema.sources).values({ workspaceId: ws, connector: "hacker_news", name: "HN", config: {} }).run();
    expect(done()).toEqual({ business: true, key: true, source: true });
    expect(setupChecklist(ws).show).toBe(false);
  });

  it("doesn't count sample sources, and hides when dismissed", () => {
    db.insert(schema.sources).values({ workspaceId: ws, connector: "hacker_news", name: "HN", config: {}, isDemo: 1 }).run();
    expect(done().source).toBe(false);
    setSetting(ws, "setup_checklist_dismissed", true);
    expect(setupChecklist(ws).show).toBe(false);
  });
});
