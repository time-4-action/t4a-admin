import { redirect } from "next/navigation";
import { directoryViews, getAgent, listAgents } from "@/lib/portal-agents";
import type { MkCustomerView } from "@/lib/mk-customers";
import { AgentEditor } from "../agent-editor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// New agent. `?partner=<partnerMkId>` (from "Make agent" in the Customers list)
// pre-picks the agent's own account; a customer who already is an agent opens
// their agent page instead.
export default async function NewAgentPage({ searchParams }: { searchParams: Promise<{ partner?: string | string[] }> }) {
  const raw = (await searchParams).partner;
  const partner = typeof raw === "string" ? raw.trim() : "";
  if (partner && (await getAgent(partner))) redirect(`/customers/agents/${encodeURIComponent(partner)}`);
  const [directory, agents] = await Promise.all([partner ? directoryViews([partner]) : Promise.resolve<Record<string, MkCustomerView>>({}), listAgents()]);
  return (
    <AgentEditor
      key={partner || "new"}
      agent={null}
      seed={partner ? (directory[partner] ?? null) : null}
      directory={directory}
      alsoWith={{}}
      agentIds={agents.map((a) => a.partnerMkId)}
    />
  );
}
