import { NextResponse } from "next/server";
import { resolvePortalAccount } from "@/lib/portal";
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
  partnerSubmissions,
  defaultSubmission,
} from "@/lib/preorder";
import { readSubmissionOrder } from "@/lib/preorder-mk";
import { upsertMkCustomer } from "@/lib/mk-customers";
import { defaultTermsFromPartner } from "@/lib/preorder-terms";
import {
  campaignFromSnapshot,
  isOrderCustomerVisible,
  submissionStage,
  totalsNet,
  type AllocationResult,
  type PortalPreorderRef,
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
// session — never from the client; a portal agent's `?account=` only picks one of
// THEIR accounts (lib/portal.ts resolvePortalAccount).
//
// A partner may hold several preorders in one campaign (`allowMultiplePreorders`):
// `?submission=<id>` opens one of them, `?new=1` a fresh one (their open draft if they
// have one), neither = the open draft, else the latest. `preorders` lists them all.
export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const qs = new URL(req.url).searchParams;
  const resolved = await resolvePortalAccount(qs.get("account"));
  if (!resolved) return NextResponse.json({ error: "no-account" }, { status: 404 });
  const { partner } = resolved;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  await connectDB();
  const campaignDoc = await PreorderCampaign.findById(id).exec();
  if (!campaignDoc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const subs = await partnerSubmissions(campaignDoc._id, partner.mkId);
  const wanted = qs.get("submission");
  const startNew = qs.get("new") === "1" && campaignDoc.status === "open" && !!campaignDoc.allowMultiplePreorders;
  let subDoc = wanted ? subs.find((s) => String(s._id) === wanted) ?? null : defaultSubmission(subs);
  if (wanted && !subDoc) return NextResponse.json({ error: "not found" }, { status: 404 });
  // A new preorder: their open draft if there is one, else an empty sheet (the first
  // save creates it).
  if (startNew) subDoc = subs.find((s) => s.status === "draft") ?? null;

  // Invite boundary: the partner must have UNLOCKED this campaign (access grant) or
  // already have a submission on it. Otherwise it's invisible to them — no market,
  // country or customer rule ever changes that.
  const hasAccess =
    subs.length > 0 ||
    !!(await PreorderAccess.exists({ campaignId: campaignDoc._id, partnerMkId: partner.mkId }));
  if (!hasAccess) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // A partner may always review their own submission (even after the campaign closes),
  // but a campaign with no submission is only visible while it's open to fill.
  if (campaignDoc.status !== "open" && subs.length === 0) {
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
        seq: subs.length ? Math.max(...subs.map((s) => s.seq ?? 1)) + 1 : 1,
      };

  const preorders: PortalPreorderRef[] = subs.map((s) => ({
    id: String(s._id),
    seq: s.seq ?? 1,
    status: s.status,
    stage: submissionStage({
      status: s.status,
      mkOrder: s.mkOrder?.state ? { state: s.mkOrder.state, buyerOrder: "", attempts: 0 } : null,
      mkSalesOrder: s.mkSalesOrder?.mkId ? { mkId: s.mkSalesOrder.mkId, countCode: s.mkSalesOrder.countCode } : null,
      resultPublishedToCustomer: s.resultPublishedToCustomer,
    }),
    items: s.totals?.qty ?? 0,
    total: totalsNet({ qty: s.totals?.qty ?? 0, amount: s.totals?.amount ?? 0, discount: s.totals?.discount ?? 0 }),
    submittedAt: s.submittedAt ? new Date(s.submittedAt).toISOString() : null,
    updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
  }));

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
    preorders,
    frozen,
    ...(allocation ? { allocation, orderMkId: subDoc?.mkSalesOrder?.mkId ?? null } : {}),
    partner: {
      mkId: partner.mkId,
      name: partner.name,
      email: partner.emails?.[0] ?? null,
    },
  });
}
