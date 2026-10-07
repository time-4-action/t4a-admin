import "server-only";

// lib/portal-agents.ts
//
// Storage for portal agents (models/portal-agent.ts): who is an agent and which
// client partners they may see. Pure Mongo — the portal resolves the agent from the
// session partner (lib/portal.ts), the Customers section edits the assignments.

import { connectDB } from "@/lib/mongodb";
import { PortalAgent, type IPortalAgent } from "@/models/portal-agent";
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
