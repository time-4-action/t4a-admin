import { NextResponse } from "next/server";
import { getSessionPartner } from "@/lib/portal";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  PreorderAccess,
  toCampaignSummary,
  toObjectId,
} from "@/lib/preorder";
import type { IPreorderCampaign } from "@/models/preorder-campaign";
import { submissionStage, type SubmissionStage, type SubmissionStatus } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/portal/preorder/campaigns — the campaigns a logged-in partner has UNLOCKED
// (via a magic invite link → access grant) or already has a submission on, each
// annotated with their own submission status. Campaigns are NOT visible by default —
// this is the invite boundary. Partner from session only.
export async function GET() {
  const partner = await getSessionPartner();
  if (!partner) {
    return NextResponse.json({ error: "no-account", campaigns: [] }, { status: 404 });
  }
  await connectDB();

  const [subs, grants] = await Promise.all([
    PreorderSubmission.find({ partnerMkId: partner.mkId }).exec(),
    PreorderAccess.find({ partnerMkId: partner.mkId }).exec(),
  ]);
  const statusByCampaign = new Map<string, SubmissionStatus>(
    subs.map((s) => [String(s.campaignId), s.status]),
  );
  // Customer-facing stage: never leaks MK identifiers, only whether the order was
  // registered / shown to them.
  const stageByCampaign = new Map<string, SubmissionStage>(
    subs.map((s) => [
      String(s.campaignId),
      submissionStage({
        status: s.status,
        mkOrder: s.mkOrder?.state ? { state: s.mkOrder.state, buyerOrder: "", attempts: 0 } : null,
        mkSalesOrder: s.mkSalesOrder?.mkId ? { mkId: s.mkSalesOrder.mkId, countCode: s.mkSalesOrder.countCode } : null,
        resultPublishedToCustomer: s.resultPublishedToCustomer,
      }),
    ]),
  );

  // Union of campaigns granted (unlocked) and campaigns already submitted to.
  const ids = new Set<string>();
  for (const g of grants) ids.add(String(g.campaignId));
  for (const s of subs) ids.add(String(s.campaignId));
  if (ids.size === 0) return NextResponse.json({ campaigns: [] });

  const oids = Array.from(ids)
    .map(toObjectId)
    .filter((o): o is NonNullable<typeof o> => !!o);
  const docs = (await PreorderCampaign.find({ _id: { $in: oids } })
    .sort({ deadline: 1, updatedAt: -1 })
    .exec()) as IPreorderCampaign[];

  // Never surface a draft campaign to the portal, even if a grant exists.
  const campaigns = docs
    .filter((d) => d.status !== "draft")
    .map((d) => ({
      ...toCampaignSummary(d, 0),
      mySubmissionStatus: statusByCampaign.get(String(d._id)) ?? null,
      myStage: stageByCampaign.get(String(d._id)) ?? null,
    }));
  return NextResponse.json({ campaigns });
}
