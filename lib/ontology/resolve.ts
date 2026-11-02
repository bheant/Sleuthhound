import { and, eq, like } from "drizzle-orm";
import type { TargetDraft } from "@/lib/connectors/types";
import { schema, type Writer } from "@/lib/db";
import { normaliseName, postcodeDistrict } from "./names";

export { normaliseName, postcodeDistrict } from "./names";

const t = schema.targets;

// Matches a draft target to an existing one, stopping at the first hit:
// company number, then domain, then normalised name plus the same postcode
// district. Conversations also match on their exact URL. An uploaded list
// often has no postcodes, so its rows (matchOnName) may match on the
// normalised name alone, but only when exactly one target has it. No fuzzy
// merges.
// Demo rows never match, so real data can't merge into them.
export function findExistingTarget(
  tx: Writer,
  workspaceId: string,
  draft: TargetDraft,
  postcode: string | null,
): string | null {
  const real = and(eq(t.workspaceId, workspaceId), eq(t.isDemo, 0));

  if (draft.companyNumber) {
    const row = tx.select({ id: t.id }).from(t).where(and(real, eq(t.companyNumber, draft.companyNumber))).get();
    if (row) return row.id;
  }
  if (draft.kind === "conversation" && draft.url) {
    const row = tx.select({ id: t.id }).from(t).where(and(real, eq(t.url, draft.url))).get();
    if (row) return row.id;
  }
  if (draft.domain) {
    const row = tx.select({ id: t.id }).from(t).where(and(real, eq(t.domain, draft.domain))).get();
    if (row) return row.id;
  }

  const district = postcodeDistrict(postcode);
  const name = normaliseName(draft.name);
  if (!name) return null;
  if (!district) return draft.matchOnName ? matchNameAlone(tx, workspaceId, draft, name) : null;
  const p = schema.places;
  const candidates = tx
    .select({ id: t.id, name: t.name })
    .from(t)
    .innerJoin(p, eq(p.id, t.placeId))
    .where(and(real, eq(t.kind, draft.kind), like(p.postcode, `${district} %`)))
    .all();
  return candidates.find((c) => normaliseName(c.name) === name)?.id ?? null;
}

// Narrowed in SQL by the name's first word, then compared normalised.
function matchNameAlone(tx: Writer, workspaceId: string, draft: TargetDraft, name: string): string | null {
  const first = name.split(" ")[0];
  const candidates = tx
    .select({ id: t.id, name: t.name })
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.isDemo, 0), eq(t.kind, draft.kind), like(t.name, `%${first}%`)))
    .all()
    .filter((c) => normaliseName(c.name) === name);
  return candidates.length === 1 ? candidates[0].id : null;
}
