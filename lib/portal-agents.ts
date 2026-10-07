import "server-only";

// lib/portal-agents.ts
//
// Storage for portal agents (models/portal-agent.ts): who is an agent and which
// client partners they may see. Pure Mongo — the portal resolves the agent from the
// session partner (lib/portal.ts), the Customers section edits the assignments.

import { connectDB } from "@/lib/mongodb";
import { PortalAgent, type IPortalAgent } from "@/models/portal-agent";
import { MkCustomer } from "@/models/mk-customer";
import { getMkCustomersByIds, toMkCustomerView, type MkCustomerView } from "@/lib/mk-customers";
import { normalizeAgentClients, type AgentClient, type PortalAgentView } from "@/types/portal-agent";

function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

export function toAgentView(a: IPortalAgent): PortalAgentView {
  return {
    partnerMkId: a.partnerMkId,
    partnerName: a.partnerName,
    clients: (a.clients ?? []).map((c) => ({
      partnerMkId: c.partnerMkId,
      partnerName: c.partnerName,
      addedAt: iso(c.addedAt),
      addedBy: c.addedBy ?? null,
    })),
    note: a.note ?? null,
    createdBy: a.createdBy ?? null,
    updatedBy: a.updatedBy ?? null,
    createdAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
  };
}

export async function listAgents(): Promise<PortalAgentView[]> {
  await connectDB();
  const docs = await PortalAgent.find({}).sort({ partnerName: 1 }).lean<IPortalAgent[]>().exec();
  return docs.map(toAgentView);
}

export async function getAgent(partnerMkId: string): Promise<PortalAgentView | null> {
  await connectDB();
  const doc = await PortalAgent.findOne({ partnerMkId }).lean<IPortalAgent>().exec();
  return doc ? toAgentView(doc) : null;
}

// The clients a partner may act for as an agent ([] for a plain customer).
export async function getAgentClients(partnerMkId: string): Promise<AgentClient[]> {
  await connectDB();
  const doc = await PortalAgent.findOne({ partnerMkId }, { clients: 1 }).lean<Pick<IPortalAgent, "clients">>().exec();
  return (doc?.clients ?? []).map((c) => ({ partnerMkId: c.partnerMkId, partnerName: c.partnerName }));
}

// Create or replace an agent's client list. Clients already assigned keep their
// original addedAt / addedBy; new ones are stamped with the actor.
export async function saveAgent(input: {
  partnerMkId: string;
  partnerName: string;
  clients: unknown;
  note?: string | null;
  actor: string | null;
}): Promise<PortalAgentView> {
  await connectDB();
  const partnerMkId = input.partnerMkId.trim();
  const clients = normalizeAgentClients(partnerMkId, input.clients);
  const existing = await PortalAgent.findOne({ partnerMkId }).lean<IPortalAgent>().exec();
  const prev = new Map((existing?.clients ?? []).map((c) => [c.partnerMkId, c]));
  const now = new Date();
  const next = clients.map((c) => {
    const old = prev.get(c.partnerMkId);
    return {
      partnerMkId: c.partnerMkId,
      partnerName: c.partnerName,
      addedAt: old?.addedAt ?? now,
      addedBy: old ? (old.addedBy ?? null) : input.actor,
    };
  });
  const set: Record<string, unknown> = {
    partnerName: input.partnerName.trim() || existing?.partnerName || partnerMkId,
    clients: next,
    updatedBy: input.actor,
  };
  if (input.note !== undefined) set.note = input.note?.trim().slice(0, 2000) || null;
  const doc = await PortalAgent.findOneAndUpdate(
    { partnerMkId },
    { $set: set, $setOnInsert: { createdBy: input.actor } },
    { upsert: true, returnDocument: "after" },
  )
    .lean<IPortalAgent>()
    .exec();
  return toAgentView(doc!);
}

export async function deleteAgent(partnerMkId: string): Promise<boolean> {
  await connectDB();
  const r = await PortalAgent.deleteOne({ partnerMkId }).exec();
  return r.deletedCount > 0;
}

// Directory records for a set of partners (agent page: client details).
export async function directoryViews(ids: string[]): Promise<Record<string, MkCustomerView>> {
  const map = await getMkCustomersByIds(ids);
  return Object.fromEntries(Array.from(map, ([id, c]) => [id, toMkCustomerView(c)]));
}

// Every agent a partner is a client of (agent page: "also with …").
export async function agentsOfClients(ids: string[]): Promise<Record<string, { partnerMkId: string; partnerName: string }[]>> {
  await connectDB();
  if (ids.length === 0) return {};
  const docs = await PortalAgent.find({ "clients.partnerMkId": { $in: ids } }, { partnerMkId: 1, partnerName: 1, clients: 1 }).lean<IPortalAgent[]>().exec();
  const want = new Set(ids);
  const out: Record<string, { partnerMkId: string; partnerName: string }[]> = {};
  for (const a of docs) {
    for (const c of a.clients) {
      if (!want.has(c.partnerMkId)) continue;
      (out[c.partnerMkId] ??= []).push({ partnerMkId: a.partnerMkId, partnerName: a.partnerName });
    }
  }
  return out;
}

export const MAX_RESOLVE_LINES = 1000;

export type ResolvedLine =
  | { line: string; status: "matched"; customer: MkCustomerView; via: "id" | "code" | "email" | "name" }
  | { line: string; status: "ambiguous"; candidates: MkCustomerView[] }
  | { line: string; status: "unmatched" };

// Turn a pasted list (one customer per line: Metakocka customer code, partner id,
// email or exact name) into directory customers. Exact matches only, case
// ignored; a line matching several customers is reported, never guessed.
export async function resolveCustomerLines(input: string[]): Promise<ResolvedLine[]> {
  await connectDB();
  const lines = Array.from(new Set(input.map((l) => l.trim()).filter(Boolean))).slice(0, MAX_RESOLVE_LINES);
  if (lines.length === 0) return [];
  const lower = lines.map((l) => l.toLowerCase());
  const variants = Array.from(new Set([...lines, ...lower, ...lines.map((l) => l.toUpperCase())]));
  const docs = await MkCustomer.find({
    stale: { $ne: true },
    $or: [{ partnerMkId: { $in: lines } }, { countCode: { $in: variants } }, { emails: { $in: variants } }, { name: { $in: lines } }],
  }).exec();
  // Exact names in any case: one more query for the lines not matched as typed.
  const missingNames = lines.filter((l) => !docs.some((d) => d.name.toLowerCase() === l.toLowerCase()));
  if (missingNames.length) {
    const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const more = await MkCustomer.find({
      stale: { $ne: true },
      name: { $in: missingNames.slice(0, 200).map((n) => new RegExp(`^${esc(n)}$`, "i")) },
    }).exec();
    docs.push(...more);
  }

  type Via = "id" | "code" | "email" | "name";
  return lines.map((line): ResolvedLine => {
    const l = line.toLowerCase();
    // Most specific first: an id or customer code beats an email, an email a name.
    const tiers: [Via, (d: (typeof docs)[number]) => boolean][] = [
      ["id", (d) => d.partnerMkId === line],
      ["code", (d) => (d.countCode ?? "").toLowerCase() === l],
      ["email", (d) => (d.emails ?? []).some((e) => e.toLowerCase() === l)],
      ["name", (d) => d.name.toLowerCase() === l],
    ];
    for (const [via, test] of tiers) {
      const hits = Array.from(new Map(docs.filter(test).map((d) => [d.partnerMkId, d])).values());
      if (hits.length === 1) return { line, status: "matched", customer: toMkCustomerView(hits[0]), via };
      if (hits.length > 1) return { line, status: "ambiguous", candidates: hits.slice(0, 10).map(toMkCustomerView) };
    }
    return { line, status: "unmatched" };
  });
}
