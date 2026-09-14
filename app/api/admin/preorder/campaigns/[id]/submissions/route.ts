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
import { getMkCustomersByIds, effectiveCountryIso } from "@/lib/mk-customers";
import { computeConfirmedTotals, type LineStatus } from "@/types/preorder";
import type { IPreorderSubmission } from "@/models/preorder-submission";
import type { IPreorderAccess } from "@/models/preorder-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/preorder/campaigns/[id]/submissions — all partner responses for a
// campaign plus the partners who unlocked it without starting. No Metakocka calls:
// allocation figures come from the stored `mkOrder.lastSeen`, countries from the
// snapshot or the customer directory.
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ submissions: [], unlocked: [] });
  await connectDB();

  const [campaignDoc, docs, grants] = await Promise.all([
    PreorderCampaign.findById(oid).exec(),
    PreorderSubmission.find({ campaignId: oid }).sort({ updatedAt: -1 }).exec() as Promise<IPreorderSubmission[]>,
    PreorderAccess.find({ campaignId: oid }).sort({ grantedAt: -1 }).exec() as Promise<IPreorderAccess[]>,
  ]);

  const view = campaignDoc ? toCampaignView(campaignDoc) : null;
  const directory = await getMkCustomersByIds([...docs.map((d) => d.partnerMkId), ...grants.map((g) => g.partnerMkId)]);
  const isoOf = (partnerMkId: string) => {
    const c = directory.get(partnerMkId);
    return c ? effectiveCountryIso(c) : null;
  };

  const submissions = docs.map((d) => {
    const summary = toSubmissionSummary(d, isoOf(d.partnerMkId));
    // Legacy submissions (no snapshot) still show admin-confirmed totals recomputed
    // from the campaign's current prices.
    if (!view || d.snapshot) return summary;
    const quantities: Record<string, number> = {};
    const fulfil: Record<string, { confirmedQty: number | null; lineStatus: LineStatus }> = {};
    for (const l of d.lines) {
      quantities[l.rowId] = l.qty;
      fulfil[l.rowId] = { confirmedQty: l.confirmedQty ?? null, lineStatus: (l.lineStatus ?? "pending") as LineStatus };
    }
    return { ...summary, confirmedTotals: computeConfirmedTotals(view, quantities, fulfil) };
  });

  // Partners who UNLOCKED the campaign (via the invite link) but haven't started a
  // submission yet — so the admin can see who has the link.
  const submittedPartners = new Set(docs.map((d) => d.partnerMkId));
  const unlocked = grants.filter((g) => !submittedPartners.has(g.partnerMkId)).map((g) => toAccessSummary(g, isoOf(g.partnerMkId)));

  return NextResponse.json({ submissions, unlocked });
}
