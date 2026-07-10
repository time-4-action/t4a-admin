import { NextResponse } from "next/server";
import { getSessionPartner } from "@/lib/portal";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  toCampaignSummary,
} from "@/lib/preorder";
import type { IPreorderCampaign } from "@/models/preorder-campaign";
import type { SubmissionStatus } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/portal/preorder/campaigns — the OPEN campaigns a logged-in partner can fill,
// each annotated with this partner's own submission status. Partner from session only.
export async function GET() {
  const partner = await getSessionPartner();
  if (!partner) {
    return NextResponse.json({ error: "no-account", campaigns: [] }, { status: 404 });
  }
  await connectDB();

  // This partner's submissions across ALL campaigns — so they can still review a preorder
  // they've placed even after its campaign closes.
  const subs = await PreorderSubmission.find({ partnerMkId: partner.mkId }).exec();
  const statusByCampaign = new Map<string, SubmissionStatus>(
    subs.map((s) => [String(s.campaignId), s.status]),
  );

  // Open campaigns (fillable) plus any the partner already has a submission on.
  const docs = (await PreorderCampaign.find({
    $or: [{ status: "open" }, { _id: { $in: subs.map((s) => s.campaignId) } }],
  })
    .sort({ deadline: 1, updatedAt: -1 })
    .exec()) as IPreorderCampaign[];

  const campaigns = docs.map((d) => ({
    ...toCampaignSummary(d, 0),
    mySubmissionStatus: statusByCampaign.get(String(d._id)) ?? null,
  }));
  return NextResponse.json({ campaigns });
}
