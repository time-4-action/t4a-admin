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
import { flattenRows, rowUnitPrice } from "@/types/preorder";
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

  const priceByRow = campaignDoc
    ? new Map(flattenRows(toCampaignView(campaignDoc)).map(({ row }) => [row.id, rowUnitPrice(row)]))
    : new Map<string, number>();

  const submissions = docs.map((d) => {
    let qty = 0;
    let amount = 0;
    for (const l of d.lines) {
      if (l.lineStatus !== "confirmed") continue;
      const c = l.confirmedQty ?? l.qty;
      if (c <= 0) continue;
      qty += c;
      amount += c * (priceByRow.get(l.rowId) ?? 0);
    }
    return { ...toSubmissionSummary(d), confirmedTotals: { qty, amount } };
  });

  // Partners who UNLOCKED the campaign (via the invite link) but haven't started a
  // submission yet — so the admin can see who has the link.
  const submittedPartners = new Set(docs.map((d) => d.partnerMkId));
  const unlocked = grants
    .filter((g) => !submittedPartners.has(g.partnerMkId))
    .map(toAccessSummary);

  return NextResponse.json({ submissions, unlocked });
}
