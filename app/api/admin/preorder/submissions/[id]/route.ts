import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  toCampaignView,
  toSubmissionView,
  toObjectId,
  snapshotView,
} from "@/lib/preorder";
import { detachSalesOrder, readSubmissionOrder } from "@/lib/preorder-mk";
import { campaignFromSnapshot, computeConfirmedTotals, type AllocationResult } from "@/types/preorder";
import type { LineStatus, SubmissionStatus } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const LINE_STATUSES: LineStatus[] = ["pending", "confirmed", "backorder", "cancelled"];
const SUB_STATUSES: SubmissionStatus[] = ["draft", "submitted", "confirmed", "closed"];

// GET /api/admin/preorder/submissions/[id] — one partner's submission (review view):
// the record, its frozen sheet (snapshot) and the LIVE Metakocka order compared to the
// request. `?refresh=1` bypasses the 30 s order cache.
export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderSubmission.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const campaignDoc = await PreorderCampaign.findById(doc.campaignId).exec();
  const fresh = new URL(req.url).searchParams.get("refresh") === "1";

  const snap = snapshotView(doc.snapshot);
  const frozen =
    snap && campaignDoc
      ? campaignFromSnapshot({ id: String(campaignDoc._id), title: campaignDoc.title, season: campaignDoc.season, status: campaignDoc.status }, snap)
      : null;
  const allocation: AllocationResult = await readSubmissionOrder(doc, { fresh });

  return NextResponse.json({
    submission: toSubmissionView(doc),
    frozen,
    allocation,
    campaign: campaignDoc ? toCampaignView(campaignDoc) : null,
  });
}

// PATCH /api/admin/preorder/submissions/[id] — admin actions on a submission:
//   • status changes ("draft" = unlock for the customer). Unlocking a submission that
//     carries a Metakocka order requires `detachOrder` (the order is moved to history,
//     optionally deleted in MK) and is refused while a registration is in flight.
//   • dismissUnlockRequest
//   • legacy per-line fulfilment (confirmedQty / lineStatus) for old submissions.
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as {
    status?: SubmissionStatus;
    lines?: { rowId: string; confirmedQty?: number | null; lineStatus?: LineStatus }[];
    dismissUnlockRequest?: boolean;
    detachOrder?: { deleteInMk?: boolean; reason?: string | null };
  };
  await connectDB();
  let doc = await PreorderSubmission.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const session = await auth0.getSession();
  const actor = { source: "admin" as const, email: session?.user?.email ?? null };

  if (body.status && SUB_STATUSES.includes(body.status)) {
    if (body.status === "draft" && doc.status !== "draft") {
      const hasOrder = !!doc.mkSalesOrder?.mkId;
      const pending = doc.mkOrder?.state === "pending";
      if (hasOrder && !body.detachOrder) {
        return NextResponse.json(
          { error: "order-attached", message: "This preorder has a Metakocka order. Detach it to unlock.", countCode: doc.mkSalesOrder?.countCode },
          { status: 409 },
        );
      }
      if (hasOrder || pending) {
        // Moves the order to history (refuses while a registration is genuinely in flight).
        const res = await detachSalesOrder(doc, {
          deleteInMk: !!body.detachOrder?.deleteInMk,
          actor,
          reason: body.detachOrder?.reason ?? "unlocked for customer",
        });
        if (!res.ok) return NextResponse.json({ error: "registering", message: res.error }, { status: res.status });
      } else if (doc.mkOrder) {
        // A failed registration with no order: just clear the sync state.
        await PreorderSubmission.updateOne({ _id: doc._id }, { $set: { mkOrder: null } }).exec();
      }
      const reloaded = await PreorderSubmission.findById(id).exec();
      if (!reloaded) return NextResponse.json({ error: "not found" }, { status: 404 });
      doc = reloaded;
    }
    doc.status = body.status;
  }

  // Unlocking (→ draft) fulfils the customer's request; dismissing clears it too.
  if (body.dismissUnlockRequest || doc.status === "draft") {
    doc.unlockRequestNote = null;
    doc.unlockRequestedAt = null;
  }

  if (Array.isArray(body.lines)) {
    const patchByRow = new Map(body.lines.map((l) => [l.rowId, l]));
    for (const line of doc.lines) {
      const p = patchByRow.get(line.rowId);
      if (!p) continue;
      if ("confirmedQty" in p) {
        line.confirmedQty =
          p.confirmedQty === null || p.confirmedQty === undefined
            ? null
            : Math.max(0, Number(p.confirmedQty) || 0);
      }
      if (p.lineStatus && LINE_STATUSES.includes(p.lineStatus)) {
        line.lineStatus = p.lineStatus;
      }
    }
    // Legacy confirmed totals from the campaign's prices + current fulfilment.
    const campaignDoc = await PreorderCampaign.findById(doc.campaignId).exec();
    if (campaignDoc) {
      const view = toCampaignView(campaignDoc);
      const quantities: Record<string, number> = {};
      const confirmed: Record<string, { confirmedQty: number | null; lineStatus: LineStatus }> = {};
      for (const l of doc.lines) {
        quantities[l.rowId] = l.qty;
        confirmed[l.rowId] = { confirmedQty: l.confirmedQty ?? null, lineStatus: l.lineStatus ?? "pending" };
      }
      doc.confirmedTotals = computeConfirmedTotals(view, quantities, confirmed);
    }
  }

  await doc.save();
  return NextResponse.json({ submission: toSubmissionView(doc) });
}

// DELETE /api/admin/preorder/submissions/[id] — remove a partner's submission
// entirely (admin action). Frees the (campaignId, partnerMkId) slot so the partner
// can start over. Does not touch any Metakocka sales order already created from it
// (it stays hidden from the customer through its buyer_order marker).
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderSubmission.findByIdAndDelete(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
