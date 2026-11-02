import { db } from "@/lib/db";
import { openDemo, resetDemo } from "@/lib/vault/session";
import { seedDemo } from "./seed";

// The sample workspace: made-up data in its own local database.

const seed = (workspaceId: string) => {
  db.transaction((tx) => seedDemo(tx, workspaceId));
};

export const exploreSample = () => openDemo(seed);
export const restartSample = () => resetDemo(seed);
