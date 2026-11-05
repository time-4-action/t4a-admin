import { agentError, agentJson, agentRoute } from "@/lib/agent-api";
import { getAgentCampaign } from "@/lib/agent-preorders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/agent/preorders/campaigns/:id — one campaign: summary, sheet tabs
// (counts + volume-discount ladders), markets, customer rules, VAT overrides.
export const GET = agentRoute<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const data = await getAgentCampaign(id);
  return data ? agentJson(data) : agentError("campaign not found", 404);
});
