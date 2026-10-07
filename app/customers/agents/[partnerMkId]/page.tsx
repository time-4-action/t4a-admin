import { notFound } from "next/navigation";
import { agentsOfClients, directoryViews, getAgent, listAgents } from "@/lib/portal-agents";
import { AgentEditor } from "../agent-editor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One agent: their own account, every client (with directory details and the other
// agents a client is shared with), staged editing. Gated by the /customers rule.
export default async function AgentPage({ params }: { params: Promise<{ partnerMkId: string }> }) {
  const id = decodeURIComponent((await params).partnerMkId);
  const agent = await getAgent(id);
  if (!agent) notFound();
  const clientIds = agent.clients.map((c) => c.partnerMkId);
  const [directory, alsoWith, agents] = await Promise.all([
    directoryViews([agent.partnerMkId, ...clientIds]),
    agentsOfClients(clientIds),
    listAgents(),
  ]);
  return <AgentEditor agent={agent} directory={directory} alsoWith={alsoWith} agentIds={agents.map((a) => a.partnerMkId)} />;
}
