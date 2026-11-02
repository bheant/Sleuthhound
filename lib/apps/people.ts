import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Work emails found for directors, kept on the person's attributes with where
// and when they came from. Nothing else from Apollo is stored.

export type FoundEmail = { address: string; source: string; foundOn: string };

export function emailOf(attributes: Record<string, unknown> | null): FoundEmail | null {
  const address = attributes?.email;
  if (typeof address !== "string" || !address) return null;
  return {
    address,
    source: typeof attributes?.email_source === "string" ? attributes.email_source : "Apollo",
    foundOn: typeof attributes?.email_found_on === "string" ? attributes.email_found_on : "",
  };
}

export function saveEmail(personId: string, address: string, foundOn: string) {
  const p = schema.people;
  const row = db.select({ attributes: p.attributes }).from(p).where(eq(p.id, personId)).get();
  db.update(p)
    .set({ attributes: { ...(row?.attributes ?? {}), email: address, email_source: "Apollo", email_found_on: foundOn } })
    .where(eq(p.id, personId))
    .run();
}

/** The person, if they direct the target and both are in the workspace. */
export function directorOf(workspaceId: string, targetId: string, personId: string) {
  const p = schema.people;
  const l = schema.links;
  return db
    .select({ id: p.id, name: p.name, attributes: p.attributes })
    .from(l)
    .innerJoin(p, eq(p.id, l.fromId))
    .where(
      and(
        eq(l.kind, "directs"),
        eq(l.fromType, "person"),
        eq(l.fromId, personId),
        eq(l.toId, targetId),
        eq(p.workspaceId, workspaceId),
      ),
    )
    .get();
}
