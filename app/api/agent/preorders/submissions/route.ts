import { agentJson, agentRoute, parsePaging } from "@/lib/agent-api";
import { listAgentSubmissions } from "@/lib/agent-preorders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agent/preorders/submissions?campaignId=&partnerMkId=&q=&status=&mkState=&limit=&skip=
// Partner preorders, newest first. q matches partner name / email; mkState is
// pending | created | failed | legacy | none.
export const GET = agentRoute(async (req) => {
  const sp = new URL(req.url).searchParams;
  return agentJson(
    await listAgentSubmissions(
      {
        campaignId: sp.get("campaignId"),
        partnerMkId: sp.get("partnerMkId"),
        q: sp.get("q"),
        status: sp.get("status"),
        mkState: sp.get("mkState"),
      },
      parsePaging(sp),
    ),
  );
});
