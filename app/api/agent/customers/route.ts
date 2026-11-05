import { agentJson, agentRoute, parsePaging } from "@/lib/agent-api";
import { listAgentCustomers } from "@/lib/agent-directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agent/customers?q=&country=&limit=&skip= — the Metakocka customer
// directory with portal-agent links and preorder activity, plus the sync state.
export const GET = agentRoute(async (req) => {
  const sp = new URL(req.url).searchParams;
  return agentJson(await listAgentCustomers({ q: sp.get("q"), country: sp.get("country") }, parsePaging(sp)));
});
