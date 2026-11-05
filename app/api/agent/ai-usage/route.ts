import { agentJson, agentRoute } from "@/lib/agent-api";
import { loadAgentAiUsage } from "@/lib/agent-ai-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agent/ai-usage?userId= — AI cost / token totals by model and by user
// (dev users excluded like the AI dashboard), user limits, conversations today.
export const GET = agentRoute(async (req) => {
  return agentJson(await loadAgentAiUsage({ userId: new URL(req.url).searchParams.get("userId") }));
});
