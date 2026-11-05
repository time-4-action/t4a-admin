import "server-only";

// lib/agent-directory.ts
//
// Customer directory + portal agents for the agent API (/api/agent/customers,
// /api/agent/portal-agents). Reuses the Customers section's helpers: the MK
// directory query (listMkCustomers), the customer kind / country rules
// (toMkCustomerView), the per-customer preorder activity and the agent tables.

import { connectDB } from "@/lib/mongodb";
import { getSyncState, listMkCustomers, toMkCustomerView } from "@/lib/mk-customers";
import { customerPreorderActivity } from "@/lib/preorder-customers";
import { agentsOfClients, listAgents } from "@/lib/portal-agents";
import { PortalAgent, type IPortalAgent } from "@/models/portal-agent";
import { pageOf, type Paging } from "@/lib/agent-api";

export async function listAgentCustomers(query: { q?: string | null; country?: string | null }, paging: Paging) {
  const res = await listMkCustomers({
    q: query.q ?? undefined,
    countryIso: query.country || null,
    pageSize: paging.limit,
    skip: paging.skip,
  });
  const views = res.items.map(toMkCustomerView);
  const ids = views.map((c) => c.partnerMkId);

  await connectDB();
  const [activity, agentDocs, servedBy, sync] = await Promise.all([
    customerPreorderActivity(ids),
    ids.length
      ? PortalAgent.find({ partnerMkId: { $in: ids } }, { partnerMkId: 1, clients: 1 }).lean<Pick<IPortalAgent, "partnerMkId" | "clients">[]>().exec()
      : Promise.resolve([] as Pick<IPortalAgent, "partnerMkId" | "clients">[]),
    agentsOfClients(ids),
    getSyncState(),
  ]);
  const agentById = new Map(agentDocs.map((a) => [a.partnerMkId, a]));

  const items = views.map((c) => {
    const agent = agentById.get(c.partnerMkId);
    return {
      partnerMkId: c.partnerMkId,
      countCode: c.countCode,
      name: c.name,
      emails: c.emails,
      phone: c.phone,
      taxId: c.taxId,
      address: { street: c.street, postNumber: c.postNumber, city: c.city, country: c.countryRaw },
      countryIso: c.countryIso,
      countryName: c.countryName,
      kind: c.kind, // business = has a tax id (company), person = individual
      stale: c.stale,
      mkSyncedAt: c.mkSyncedAt,
      isPortalAgent: !!agent,
      agentClients: (agent?.clients ?? []).map((x) => ({ partnerMkId: x.partnerMkId, partnerName: x.partnerName })),
      servedByAgents: servedBy[c.partnerMkId] ?? [],
      preorderActivity: (activity[c.partnerMkId]?.campaigns ?? []).map((a) => ({
        campaignId: a.id,
        campaignTitle: a.title,
        campaignStatus: a.status,
        // The submission's status, or "unlocked" when the customer only holds the
        // invite grant and has not started.
        status: a.submissionStatus ?? "unlocked",
        stage: a.stage,
        unlocked: a.unlocked,
        totalNet: a.totalNet ?? 0,
        currency: a.currency,
      })),
    };
  });

  return {
    total: res.total,
    items,
    syncState: { running: sync.running, finishedAt: sync.finishedAt, ok: sync.ok, count: sync.count },
  };
}

export async function listAgentPortalAgents(paging: Paging) {
  const agents = await listAgents();
  return pageOf(
    agents.map((a) => ({
      partnerMkId: a.partnerMkId,
      partnerName: a.partnerName,
      clients: a.clients.map((c) => ({ partnerMkId: c.partnerMkId, partnerName: c.partnerName })),
      note: a.note,
      updatedAt: a.updatedAt,
    })),
    paging,
  );
}
