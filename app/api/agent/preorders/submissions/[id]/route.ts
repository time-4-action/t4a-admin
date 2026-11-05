import { agentError, agentJson, agentRoute } from "@/lib/agent-api";
import { getAgentSubmission } from "@/lib/agent-preorders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/agent/preorders/submissions/:id — one preorder with its terms, lines
// (frozen snapshot prices once submitted) and pricing. No live Metakocka call.
export const GET = agentRoute<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const data = await getAgentSubmission(id);
  return data ? agentJson(data) : agentError("submission not found", 404);
});
