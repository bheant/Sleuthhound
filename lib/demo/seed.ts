import { schema, type Writer } from "@/lib/db";
import {
  BOROUGHS,
  DEMO_CLIENTS,
  DEMO_COMPANIES,
  DEMO_CONVERSATIONS,
  FORMATION_AGENT,
  type DemoCompany,
} from "./data";
import { seedSourcesAndRun } from "./sources";

const DEMO = 1;
const DEMO_REVIEW = { provider: "demo", model: "demo" } as const;

// A small, stable offset so companies in one borough don't stack on the map.
function jitter(seed: string, spread = 0.012): [number, number] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  const a = ((h & 0xffff) / 0xffff - 0.5) * spread;
  const b = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * spread;
  return [a, b];
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

type Ctx = { tx: Writer; workspaceId: string; people: Map<string, string> };

function personId(ctx: Ctx, name: string): string {
  const existing = ctx.people.get(name);
  if (existing) return existing;
  const row = ctx.tx
    .insert(schema.people)
    .values({ workspaceId: ctx.workspaceId, name, attributes: { role: "director" }, isDemo: DEMO })
    .returning({ id: schema.people.id })
    .get();
  ctx.people.set(name, row.id);
  return row.id;
}

function link(ctx: Ctx, from: [string, string], to: [string, string], kind: typeof schema.links.$inferInsert.kind) {
  ctx.tx
    .insert(schema.links)
    .values({
      workspaceId: ctx.workspaceId,
      fromType: from[0],
      fromId: from[1],
      toType: to[0],
      toId: to[1],
      kind,
      isDemo: DEMO,
    })
    .run();
}

function insertPlace(ctx: Ctx, borough: string, address: string, seed: string, postcode?: string) {
  const centre = BOROUGHS[borough];
  const [dLat, dLng] = jitter(seed);
  return ctx.tx
    .insert(schema.places)
    .values({
      workspaceId: ctx.workspaceId,
      postcode: postcode ?? centre.district,
      address,
      lat: centre.lat + dLat,
      lng: centre.lng + dLng,
      borough,
      isDemo: DEMO,
    })
    .returning({ id: schema.places.id })
    .get().id;
}

function insertDirectors(ctx: Ctx, targetId: string, directors: string[]) {
  for (const name of directors) link(ctx, ["person", personId(ctx, name)], ["target", targetId], "directs");
}

function seedClients(ctx: Ctx): Map<string, string> {
  const ids = new Map<string, string>();
  for (const c of DEMO_CLIENTS) {
    const target = ctx.tx
      .insert(schema.targets)
      .values({
        workspaceId: ctx.workspaceId,
        kind: "company",
        name: c.name,
        status: "active",
        isClient: 1,
        profile: { demo: true },
        isDemo: DEMO,
      })
      .returning({ id: schema.targets.id })
      .get();
    ctx.tx
      .insert(schema.clients)
      .values({ targetId: target.id, whySigned: c.why, whySource: c.whySource, segment: c.segment, signedOn: c.signedOn })
      .run();
    insertDirectors(ctx, target.id, c.directors);
    ids.set(c.key, target.id);
  }
  return ids;
}

function seedCompany(ctx: Ctx, c: DemoCompany, index: number, agentPlaceId: string, clientIds: Map<string, string>) {
  const placeId = c.formationAgent
    ? agentPlaceId
    : insertPlace(ctx, c.borough, `Own office, ${c.borough}`, c.key);

  const target = ctx.tx
    .insert(schema.targets)
    .values({
      workspaceId: ctx.workspaceId,
      kind: "company",
      name: c.name,
      companyNumber: c.number,
      url: `https://${c.site}`,
      domain: c.site,
      status: "active",
      incorporatedOn: c.incorporated,
      sicCodes: [c.sic.code],
      companyType: "ltd",
      placeId,
      profile: { demo: true, sic_descriptions: { [c.sic.code]: c.sic.label }, accounts: { next_due: c.accountsDue } },
      firstSeenAt: hoursAgo(index % 6),
      isDemo: DEMO,
    })
    .returning({ id: schema.targets.id })
    .get();

  ctx.tx
    .insert(schema.signals)
    .values({
      workspaceId: ctx.workspaceId,
      targetId: target.id,
      type: "incorporated",
      title: "Incorporated",
      occurredAt: c.incorporated,
      isDemo: DEMO,
    })
    .run();
  if (c.deadline) {
    const overdue = c.deadline.kind === "confirmation_overdue";
    ctx.tx
      .insert(schema.signals)
      .values({
        workspaceId: ctx.workspaceId,
        targetId: target.id,
        type: c.deadline.kind,
        title: c.deadline.title,
        dueAt: c.deadline.due,
        weight: overdue ? "high" : "normal",
        isDemo: DEMO,
      })
      .run();
  }

  ctx.tx
    .insert(schema.reviews)
    .values({
      targetId: target.id,
      score: c.score,
      summary: c.summary,
      whatTheyDo: c.what,
      whyFit: c.fit,
      whyNow: c.now,
      sources: [],
      ...DEMO_REVIEW,
      reviewedAt: hoursAgo(index % 6),
    })
    .run();

  link(ctx, ["target", target.id], ["place", placeId], "located_at");
  insertDirectors(ctx, target.id, c.directors);
  const client = c.resembles && clientIds.get(c.resembles);
  if (client) link(ctx, ["target", target.id], ["target", client], "resembles");
  return target.id;
}

function seedConversations(ctx: Ctx, companyIds: Map<string, string>) {
  for (const cv of DEMO_CONVERSATIONS) {
    const target = ctx.tx
      .insert(schema.targets)
      .values({
        workspaceId: ctx.workspaceId,
        kind: "conversation",
        name: cv.title,
        url: cv.url,
        status: "open",
        profile: { demo: true, where: cv.where, quote: cv.quote },
        firstSeenAt: hoursAgo(cv.hoursAgo),
        isDemo: DEMO,
      })
      .returning({ id: schema.targets.id })
      .get();
    ctx.tx
      .insert(schema.signals)
      .values({
        workspaceId: ctx.workspaceId,
        targetId: target.id,
        type: "community_post",
        title: cv.title,
        body: cv.quote,
        url: cv.url,
        occurredAt: hoursAgo(cv.hoursAgo),
        isDemo: DEMO,
      })
      .run();
    ctx.tx
      .insert(schema.reviews)
      .values({
        targetId: target.id,
        score: cv.score,
        summary: cv.summary,
        whatTheyDo: cv.quote,
        whyFit: cv.fit,
        suggestedReply: cv.reply,
        possibleCompanyName: cv.possibleCompany ?? null,
        sources: [cv.url],
        ...DEMO_REVIEW,
      })
      .run();
    const match = cv.possibleCompany && companyIds.get(cv.possibleCompany);
    if (match) link(ctx, ["target", target.id], ["target", match], "possible_match");
  }
}

export function seedDemo(tx: Writer, workspaceId: string) {
  const ctx: Ctx = { tx, workspaceId, people: new Map() };
  const clientIds = seedClients(ctx);
  const agentPlaceId = insertPlace(
    ctx,
    FORMATION_AGENT.borough,
    FORMATION_AGENT.address,
    "formation-agent",
    FORMATION_AGENT.postcode,
  );
  const companyIds = new Map<string, string>();
  DEMO_COMPANIES.forEach((c, i) => {
    const id = seedCompany(ctx, c, i, agentPlaceId, clientIds);
    companyIds.set(c.name.replace(/ Ltd$/, ""), id);
  });
  seedConversations(ctx, companyIds);
  seedSourcesAndRun(tx, workspaceId);
  return {
    companies: DEMO_COMPANIES.length,
    conversations: DEMO_CONVERSATIONS.length,
    clients: DEMO_CLIENTS.length,
  };
}
