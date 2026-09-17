import { NextResponse } from "next/server";
import { getSessionPartner } from "@/lib/portal";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  PreorderAccess,
  loadEffectiveCampaignForPartner,
  toPortalCampaignView,
  toPortalSubmissionView,
  toObjectId,
  snapshotView,
} from "@/lib/preorder";
import { readSubmissionOrder } from "@/lib/preorder-mk";
import { upsertMkCustomer } from "@/lib/mk-customers";
import { defaultTermsFromPartner } from "@/lib/preorder-terms";
import {
  campaignFromSnapshot,
  isOrderCustomerVisible,
  type AllocationResult,
  type PortalSubmission,
  type PreorderCampaign as CampaignView,
} from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/portal/preorder/campaigns/[id] — the partner's EFFECTIVE view of an open
// campaign (their market / country / customer rules applied server-side) plus their
// own draft/submission. Once submitted, `frozen` carries the agreed lines and prices
// (the snapshot) so later sheet changes never repaint their record. `allocation` (the
// live Metakocka order) is included ONLY after an admin published it. Partner from
// session — never from the client.
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

  // Invite boundary: the partner must have UNLOCKED this campaign (access grant) or
  // already have a submission on it. Otherwise it's invisible to them — no market,
  // country or customer rule ever changes that.
  const hasAccess =
    !!subDoc ||
    !!(await PreorderAccess.exists({ campaignId: campaignDoc._id, partnerMkId: partner.mkId }));
  if (!hasAccess) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // A partner may always review their own submission (even after the campaign closes),
  // but a campaign with no submission is only visible while it's open to fill.
  if (campaignDoc.status !== "open" && !subDoc) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Keep the customer directory warm (cheap, throttled inside).
  void upsertMkCustomer(partner, { throttleMs: 24 * 60 * 60 * 1000 }).catch(() => undefined);

  const effective = await loadEffectiveCampaignForPartner(campaignDoc, { mkId: partner.mkId, mk: partner });

  const submission: PortalSubmission = subDoc
    ? toPortalSubmissionView(subDoc)
    : {
        id: "",
        campaignId: String(campaignDoc._id),
        partnerMkId: partner.mkId,
        partnerName: partner.name,
        partnerEmail: partner.emails?.[0],
        status: "draft",
        terms: defaultTermsFromPartner(partner),
        lines: [],
        totals: { qty: 0, amount: 0 },
        submittedAt: null,
        updatedAt: null,
        registration: { state: "none", canRetry: false },
        published: false,
      };

  let frozen: CampaignView | null = null;
  let allocation: AllocationResult | undefined;
  if (subDoc && subDoc.status !== "draft") {
    const snap = snapshotView(subDoc.snapshot);
    if (snap) {
      frozen = campaignFromSnapshot(
        { id: String(campaignDoc._id), title: campaignDoc.title, season: campaignDoc.season, status: campaignDoc.status },
        snap,
      );
    }
    const visible = isOrderCustomerVisible({
      mkOrder: subDoc.mkOrder?.state ? { state: subDoc.mkOrder.state, buyerOrder: "", attempts: 0 } : null,
      mkSalesOrder: subDoc.mkSalesOrder?.mkId ? { mkId: subDoc.mkSalesOrder.mkId, countCode: subDoc.mkSalesOrder.countCode } : null,
      resultPublishedToCustomer: subDoc.resultPublishedToCustomer,
    });
    // Always the live Metakocka order — a reload after an edit there must show it.
    if (visible) allocation = await readSubmissionOrder(subDoc, { fresh: true });
  }

  return NextResponse.json({
    campaign: toPortalCampaignView(effective),
    submission,
    frozen,
    ...(allocation ? { allocation, orderMkId: subDoc?.mkSalesOrder?.mkId ?? null } : {}),
    partner: {
      mkId: partner.mkId,
      name: partner.name,
      email: partner.emails?.[0] ?? null,
    },
  });
}
