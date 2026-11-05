import { agentJson, agentRoute, parsePaging } from "@/lib/agent-api";
import { listAgentCampaigns } from "@/lib/agent-preorders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agent/preorders/campaigns?status=draft|open|closed&limit=&skip=
// Campaigns, most recently edited first, with submission counts and the net total
// of submitted + confirmed preorders. Read-only, bearer-token auth (lib/agent-api.ts).
export const GET = agentRoute(async (req) => {
  const sp = new URL(req.url).searchParams;
  return agentJson(await listAgentCampaigns({ status: sp.get("status") }, parsePaging(sp)));
});
