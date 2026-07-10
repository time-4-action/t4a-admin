import { NextResponse } from "next/server";
import { getSessionPartner } from "@/lib/portal";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  toCampaignView,
  toSubmissionView,
  toObjectId,
} from "@/lib/preorder";
import { defaultTermsFromPartner } from "@/lib/preorder-terms";
import type { PreorderTerms } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/portal/preorder/campaigns/[id] — the OPEN campaign sheet plus this partner's
// own draft/submission (or a prefilled blank when none exists yet). Partner from session.
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const partner = await getSessionPartner();
  if (!partner) return NextResponse.json({ error: "no-account" }, { status: 404 });
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  await connectDB();
  const campaignDoc = await PreorderCampaign.findById(id).exec();
  if (!campaignDoc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const subDoc = await PreorderSubmission.findOne({
    campaignId: campaignDoc._id,
    partnerMkId: partner.mkId,
  }).exec();

  // A partner may always review their own submission (even after the campaign closes),
  // but a campaign with no submission is only visible while it's open to fill.
  if (campaignDoc.status !== "open" && !subDoc) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const submission = subDoc
    ? toSubmissionView(subDoc)
    : {
        id: "",
        campaignId: String(campaignDoc._id),
        partnerMkId: partner.mkId,
        partnerName: partner.name,
        partnerEmail: partner.emails?.[0],
        status: "draft" as const,
        terms: defaultTermsFromPartner(partner) as PreorderTerms,
        lines: [],
        totals: { qty: 0, amount: 0 },
        submittedAt: null,
        updatedAt: null,
      };

  return NextResponse.json({
    campaign: toCampaignView(campaignDoc),
    submission,
    partner: {
      mkId: partner.mkId,
      name: partner.name,
      email: partner.emails?.[0] ?? null,
    },
  });
}
