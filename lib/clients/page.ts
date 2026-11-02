import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { defaultAiName } from "@/lib/ai/provider";
import { companyPageUrl } from "@/lib/connectors/companies-house/normalise";
import { db, schema } from "@/lib/db";
import { formatDate } from "@/lib/format/time";
import { domainOf } from "@/lib/ontology/names";
import { getSetting } from "@/lib/settings";
import type { Link } from "@/lib/targets/types";
import type { ClientRow, ClientsPage, IdealClient } from "./types";
import { clientUniverse, foundAt } from "./universe";

// Everything the Clients page shows: the figures, the ideal client (and any
// held-back rewrite), and each client with its analysis and lookalike leads.

const t = schema.targets;
const c = schema.clients;
const l = schema.links;
const DAY = 86_400_000;

function idealClient(workspaceId: string, clientCount: number): IdealClient {
  const ideal = getSetting(workspaceId, "ideal_client");
  const suggestion = getSetting(workspaceId, "ideal_client_suggestion");
  const from = (n: number) => `${n} ${n === 1 ? "client" : "clients"}`;
  const ai = defaultAiName(workspaceId);
  let meta = `A starting description. Upload your clients and ${ai} rewrites it from them.`;
  if (ideal.edited_by_user && ideal.edited_at) meta = `Edited by you on ${formatDate(ideal.edited_at)}. ${ai} won’t overwrite it.`;
  else if (ideal.written_at) meta = `Written by ${ideal.written_by ?? "Claude"} from your ${from(ideal.client_count ?? clientCount)} on ${formatDate(ideal.written_at)}`;
  const pending = ideal.edited_by_user && suggestion.text && suggestion.text !== ideal.text;
  return {
    text: ideal.text,
    editedByUser: ideal.edited_by_user,
    meta,
    suggestion: pending ? { text: suggestion.text, meta: `From your ${from(suggestion.client_count)} on ${formatDate(suggestion.written_at)}` } : null,
  };
}

// Leads that resemble each client (resembles links, from lookalikes), in the
// last 8 weeks, and how many of them are kept.
function leadsByClient(ids: string[], now: number): Map<string, { leads: number; kept: number }> {
  const out = new Map<string, { leads: number; kept: number }>();
  if (ids.length === 0) return out;
  const d = schema.decisions;
  const since = new Date(now - 56 * DAY).toISOString();
  const rows = db
    .select({
      clientId: l.toId,
      kept: sql<string | null>`(select ${d.decision} from ${d} where ${d.targetId} = ${t.id} and ${d.undoneAt} is null order by ${d.decidedAt} desc limit 1)`,
    })
    .from(l)
    .innerJoin(t, eq(t.id, l.fromId))
    .where(and(eq(l.kind, "resembles"), inArray(l.toId, ids), sql`${foundAt} >= ${since}`))
    .all();
  for (const row of rows) {
    const cur = out.get(row.clientId) ?? { leads: 0, kept: 0 };
    cur.leads++;
    if (row.kept === "kept") cur.kept++;
    out.set(row.clientId, cur);
  }
  return out;
}

function directorsOf(ids: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (ids.length === 0) return out;
  const p = schema.people;
  const rows = db
    .select({ targetId: l.toId, name: p.name })
    .from(l)
    .innerJoin(p, eq(p.id, l.fromId))
    .where(and(eq(l.kind, "directs"), inArray(l.toId, ids), sql`coalesce(json_extract(${l.attributes}, '$.role'), 'director') like '%director%'`))
    .all();
  for (const row of rows) out.set(row.targetId, [...(out.get(row.targetId) ?? []), row.name]);
  return out;
}

function sourcesOf(url: string | null, companyNumber: string | null, found: string[] | null): Link[] {
  const links: Link[] = [];
  const seen = new Set<string>();
  const add = (label: string, href: string) => {
    if (seen.has(href.replace(/\/$/, ""))) return;
    seen.add(href.replace(/\/$/, ""));
    links.push({ label, url: href });
  };
  if (url) add(domainOf(url) ?? url, url);
  if (companyNumber) add("Companies House record", companyPageUrl(companyNumber));
  for (const u of found ?? []) add(u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), u);
  return links;
}

function lastUpload(workspaceId: string): string | null {
  const s = schema.sources;
  const row = db
    .select({ createdAt: s.createdAt })
    .from(s)
    .where(and(eq(s.workspaceId, workspaceId), eq(s.connector, "csv"), sql`json_extract(${s.config}, '$.scope.purpose') = 'clients'`))
    .orderBy(desc(s.createdAt))
    .get();
  return row ? formatDate(row.createdAt) : null;
}

export function clientsPage(workspaceId: string, now = Date.now()): ClientsPage {
  const rows = db
    .select({ target: t, client: c })
    .from(t)
    .innerJoin(c, eq(c.targetId, t.id))
    .where(and(eq(t.workspaceId, workspaceId), eq(t.isClient, 1)))
    .all();
  const ids = rows.map((r) => r.target.id);
  const leads = leadsByClient(ids, now);
  const directors = directorsOf(ids);
  const clients: ClientRow[] = rows
    .map(({ target, client }) => ({
      id: target.id,
      name: target.name,
      companyNumber: target.companyNumber,
      whySigned: client.whySigned,
      whySource: client.whySource,
      segment: client.segment,
      signedOn: client.signedOn,
      leads: leads.get(target.id)?.leads ?? 0,
      kept: leads.get(target.id)?.kept ?? 0,
      whatTheyDo: client.whatTheyDo,
      directors: directors.get(target.id) ?? [],
      sources: sourcesOf(target.url, target.companyNumber, client.sources),
      analysedAt: client.analysedAt,
      analysedBy: client.analysedBy ?? "Claude",
      chMatch: client.chMatch,
      isDemo: target.isDemo === 1,
    }))
    .sort((a, b) => (b.signedOn ?? "").localeCompare(a.signedOn ?? "") || a.name.localeCompare(b.name));
  const totalLeads = clients.reduce((n, x) => n + x.leads, 0);
  const totalKept = clients.reduce((n, x) => n + x.kept, 0);
  return {
    figures: {
      clients: clients.length,
      leads: totalLeads,
      kept: totalLeads ? `${totalKept}, or ${Math.round((totalKept / totalLeads) * 100)}%` : String(totalKept),
      uploaded: lastUpload(workspaceId),
    },
    ideal: idealClient(workspaceId, clients.length),
    clients,
    universe: clientUniverse(workspaceId, now),
  };
}
