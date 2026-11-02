import { and, eq, isNull } from "drizzle-orm";
import type { OntologyDraft, TargetDraft } from "@/lib/connectors/types";
import { db, schema, type Writer } from "@/lib/db";
import { formatPostcode } from "./names";
import { findExistingTarget } from "./resolve";

// Writes an OntologyDraft in one transaction: places, then targets (through the
// resolver), people, signals and links. Drafts refer to each other by ref;
// known refs let a caller attach drafts to rows that already exist.

export type NodeType = "target" | "person" | "place";
export type NodeRef = { type: NodeType; id: string };

export type UpsertResult = {
  targets: Array<{ ref: string; id: string; isNew: boolean }>;
  signalsAdded: number;
};

type Ctx = { workspaceId: string; sourceId: string };

function upsertPlace(tx: Writer, ctx: Ctx, postcode: string | null, address: string | null): string {
  const p = schema.places;
  const match = and(
    eq(p.workspaceId, ctx.workspaceId),
    eq(p.isDemo, 0),
    postcode ? eq(p.postcode, postcode) : isNull(p.postcode),
    address ? eq(p.address, address) : isNull(p.address),
  );
  const existing = tx.select({ id: p.id }).from(p).where(match).get();
  if (existing) return existing.id;
  return tx.insert(p).values({ workspaceId: ctx.workspaceId, postcode, address }).returning({ id: p.id }).get().id;
}

function upsertTarget(
  tx: Writer,
  ctx: Ctx,
  draft: TargetDraft,
  placeId: string | null,
  postcode: string | null,
): { id: string; isNew: boolean } {
  const t = schema.targets;
  const existingId = findExistingTarget(tx, ctx.workspaceId, draft, postcode);
  if (existingId) {
    const current = tx.select().from(t).where(eq(t.id, existingId)).get();
    // The source is the authority for register facts; never overwrite a URL,
    // domain or enriched profile someone or something else already set.
    tx.update(t)
      .set({
        status: draft.status ?? current?.status,
        companyType: draft.companyType ?? current?.companyType,
        sicCodes: draft.sicCodes ?? current?.sicCodes,
        incorporatedOn: draft.incorporatedOn ?? current?.incorporatedOn,
        placeId: placeId ?? current?.placeId,
        companyNumber: current?.companyNumber ?? draft.companyNumber,
        url: current?.url ?? draft.url,
        domain: current?.domain ?? draft.domain,
        profile: current?.profile ?? draft.profile,
      })
      .where(eq(t.id, existingId))
      .run();
    return { id: existingId, isNew: false };
  }
  const row = tx
    .insert(t)
    .values({
      workspaceId: ctx.workspaceId,
      kind: draft.kind,
      name: draft.name,
      companyNumber: draft.companyNumber,
      url: draft.url,
      domain: draft.domain,
      status: draft.status,
      incorporatedOn: draft.incorporatedOn,
      sicCodes: draft.sicCodes,
      companyType: draft.companyType,
      placeId,
      profile: draft.profile,
      firstSourceId: ctx.sourceId,
    })
    .returning({ id: t.id })
    .get();
  return { id: row.id, isNew: true };
}

function upsertPerson(tx: Writer, ctx: Ctx, name: string, externalId?: string, attributes?: Record<string, unknown>) {
  const p = schema.people;
  if (externalId) {
    const existing = tx
      .select({ id: p.id })
      .from(p)
      .where(and(eq(p.workspaceId, ctx.workspaceId), eq(p.externalId, externalId), eq(p.isDemo, 0)))
      .get();
    if (existing) return existing.id;
  }
  return tx.insert(p).values({ workspaceId: ctx.workspaceId, name, externalId, attributes }).returning({ id: p.id }).get().id;
}

function writeDraft(tx: Writer, ctx: Ctx, draft: OntologyDraft, known: Record<string, NodeRef>): UpsertResult {
  const refs = new Map<string, NodeRef>(Object.entries(known));
  const placePostcodes = new Map<string, string | null>();

  for (const place of draft.places) {
    const postcode = formatPostcode(place.postcode) ?? place.postcode ?? null;
    placePostcodes.set(place.ref, postcode);
    refs.set(place.ref, { type: "place", id: upsertPlace(tx, ctx, postcode, place.address ?? null) });
  }

  const targets: UpsertResult["targets"] = [];
  for (const target of draft.targets) {
    const placeId = target.placeRef ? (refs.get(target.placeRef)?.id ?? null) : null;
    const postcode = target.placeRef ? (placePostcodes.get(target.placeRef) ?? null) : null;
    const result = upsertTarget(tx, ctx, target, placeId, postcode);
    refs.set(target.ref, { type: "target", id: result.id });
    targets.push({ ref: target.ref, ...result });
  }

  for (const person of draft.people) {
    refs.set(person.ref, { type: "person", id: upsertPerson(tx, ctx, person.name, person.externalId, person.attributes) });
  }

  const s = schema.signals;
  let signalsAdded = 0;
  for (const signal of draft.signals) {
    const targetId = refs.get(signal.targetRef)?.id ?? null;
    if (targetId) {
      // With an external ID, that alone says it's the same signal; without one,
      // the same type on the same date does.
      const duplicate = tx
        .select({ id: s.id })
        .from(s)
        .where(
          signal.externalId
            ? and(eq(s.targetId, targetId), eq(s.externalId, signal.externalId))
            : and(eq(s.targetId, targetId), eq(s.type, signal.type), eq(s.occurredAt, signal.occurredAt)),
        )
        .get();
      if (duplicate) continue;
    }
    tx.insert(s)
      .values({
        workspaceId: ctx.workspaceId,
        targetId,
        sourceId: ctx.sourceId,
        type: signal.type,
        title: signal.title,
        body: signal.body,
        url: signal.url,
        occurredAt: signal.occurredAt,
        dueAt: signal.dueAt,
        weight: signal.weight ?? "normal",
        attributes: signal.attributes,
        externalId: signal.externalId,
      })
      .run();
    signalsAdded++;
  }

  const l = schema.links;
  for (const link of draft.links) {
    const from = refs.get(link.fromRef);
    const to = refs.get(link.toRef);
    if (!from || !to) continue;
    const duplicate = tx
      .select({ id: l.id })
      .from(l)
      .where(and(eq(l.fromId, from.id), eq(l.toId, to.id), eq(l.kind, link.kind)))
      .get();
    if (duplicate) continue;
    tx.insert(l)
      .values({
        workspaceId: ctx.workspaceId,
        fromType: from.type,
        fromId: from.id,
        toType: to.type,
        toId: to.id,
        kind: link.kind,
        attributes: link.attributes,
        sourceId: ctx.sourceId,
      })
      .run();
  }

  return { targets, signalsAdded };
}

export function upsertDraft(ctx: Ctx, draft: OntologyDraft, known: Record<string, NodeRef> = {}): UpsertResult {
  return db.transaction((tx) => writeDraft(tx, ctx, draft, known));
}
