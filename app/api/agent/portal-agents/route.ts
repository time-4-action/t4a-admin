import { agentJson, agentRoute, parsePaging } from "@/lib/agent-api";
import { listAgentPortalAgents } from "@/lib/agent-directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agent/portal-agents?limit=&skip= — portal agents and the client
// partners they serve.
export const GET = agentRoute(async (req) => {
  return agentJson(await listAgentPortalAgents(parsePaging(new URL(req.url).searchParams)));
});
