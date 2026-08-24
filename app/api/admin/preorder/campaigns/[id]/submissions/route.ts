import { NextResponse } from "next/server";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  PreorderAccess,
  toCampaignView,
  toSubmissionSummary,
  toAccessSummary,
  toObjectId,
} from "@/lib/preorder";
import { computeConfirmedTotals, type LineStatus } from "@/types/preorder";
import type { IPreorderSubmission } from "@/models/preorder-submission";
import type { IPreorderAccess } from "@/models/preorder-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/preorder/campaigns/[id]/submissions — all partner responses for a
// campaign. Confirmed totals are computed FRESH from the campaign's prices + each
// submission's current fulfilment (so they never go stale vs. the stored snapshot).
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ submissions: [] });
  await connectDB();

  const [campaignDoc, docs, grants] = await Promise.all([
    PreorderCampaign.findById(oid).exec(),
    PreorderSubmission.find({ campaignId: oid }).sort({ updatedAt: -1 }).exec() as Promise<
      IPreorderSubmission[]
    >,
    PreorderAccess.find({ campaignId: oid }).sort({ grantedAt: -1 }).exec() as Promise<
      IPreorderAccess[]
    >,
  ]);

  const view = campaignDoc ? toCampaignView(campaignDoc) : null;

  const submissions = docs.map((d) => {
    const summary = toSubmissionSummary(d);
    if (!view) return summary;
    const quantities: Record<string, number> = {};
    const fulfil: Record<string, { confirmedQty: number | null; lineStatus: LineStatus }> = {};
    for (const l of d.lines) {
      quantities[l.rowId] = l.qty;
      fulfil[l.rowId] = {
        confirmedQty: l.confirmedQty ?? null,
        lineStatus: (l.lineStatus ?? "pending") as LineStatus,
      };
    }
    // Recomputed (not read from the snapshot) so a price or tier edit on the campaign
    // shows up here immediately — volume discounts included.
    return { ...summary, confirmedTotals: computeConfirmedTotals(view, quantities, fulfil) };
  });

  // Partners who UNLOCKED the campaign (via the invite link) but haven't started a
  // submission yet — so the admin can see who has the link.
  const submittedPartners = new Set(docs.map((d) => d.partnerMkId));
  const unlocked = grants
    .filter((g) => !submittedPartners.has(g.partnerMkId))
    .map(toAccessSummary);

  return NextResponse.json({ submissions, unlocked });
}
