import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { cleanBusinessName } from "./name";

// The business name is the workspace's name, kept in the encrypted local
// database like everything else the user works with.

export function getBusinessName(workspaceId: string): string | null {
  const row = db.select({ name: schema.workspaces.name }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).get();
  return cleanBusinessName(row?.name);
}

export function setBusinessName(workspaceId: string, name: string | null) {
  db.update(schema.workspaces)
    .set({ name: cleanBusinessName(name) ?? "" })
    .where(eq(schema.workspaces.id, workspaceId))
    .run();
}
