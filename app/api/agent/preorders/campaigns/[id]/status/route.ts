import { agentError, agentJson, agentWriteRoute } from "@/lib/agent-api";
import { getAgentCampaign } from "@/lib/agent-preorders";
import { applyCampaignStatus, CAMPAIGN_STATUSES } from "@/lib/preorder-admin";
import { connectDB, PreorderCampaign, toObjectId } from "@/lib/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/agent/preorders/campaigns/:id/status
//   { actor, status: "draft" | "open" | "closed", deadline?: ISO date | null }
// Open / close / back-to-draft a campaign (and optionally move its deadline), the
// same change as the campaign builder's save (applyCampaignStatus). The admin UI
// records no acting user on a campaign, so the actor is only in the audit log line.
// → 200 { campaign } (the summary of GET /api/agent/preorders/campaigns/:id).
export const POST = agentWriteRoute<Ctx>(async (w, { params }) => {
  const { id } = await params;
  w.target = id;
  const { status, deadline } = w.body;
  const details: string[] = [];
  if (typeof status !== "string" || !(CAMPAIGN_STATUSES as string[]).includes(status)) {
    details.push(`status must be one of ${CAMPAIGN_STATUSES.join(", ")}`);
  }
  const hasDeadline = "deadline" in w.body;
  if (hasDeadline && deadline !== null && (typeof deadline !== "string" || Number.isNaN(Date.parse(deadline)))) {
    details.push("deadline must be an ISO date string or null");
  }
  if (details.length) return agentError("invalid request", 400, details);

  if (!toObjectId(id)) return agentError("campaign not found", 404);
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return agentError("campaign not found", 404);
  applyCampaignStatus(doc, hasDeadline ? { status, deadline: deadline as string | null } : { status });
  await doc.save();

  const data = await getAgentCampaign(id);
  return data ? agentJson({ campaign: data.campaign }) : agentError("campaign not found", 404);
});
