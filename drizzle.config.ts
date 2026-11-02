import { defineConfig } from "drizzle-kit";

// Generates migrations only: the database lives in the browser, and
// scripts/prepare.mjs bundles drizzle/ into lib/db/migrations.generated.ts.
export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
});
