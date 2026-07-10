import { NextResponse } from "next/server";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  toCampaignView,
  toSubmissionView,
  toObjectId,
} from "@/lib/preorder";
import { computeConfirmedTotals } from "@/types/preorder";
import type { LineStatus, SubmissionStatus } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const LINE_STATUSES: LineStatus[] = ["pending", "confirmed", "backorder", "cancelled"];
const SUB_STATUSES: SubmissionStatus[] = ["draft", "submitted", "confirmed", "closed"];

// GET /api/admin/preorder/submissions/[id] — one partner's submission (review view).
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderSubmission.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ submission: toSubmissionView(doc) });
}

// PATCH /api/admin/preorder/submissions/[id] — admin sets per-line fulfilment
// (confirmedQty / lineStatus) and/or the submission status ("how they are filled").
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as {
    status?: SubmissionStatus;
    lines?: { rowId: string; confirmedQty?: number | null; lineStatus?: LineStatus }[];
    dismissUnlockRequest?: boolean;
  };
  await connectDB();
  const doc = await PreorderSubmission.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.status && SUB_STATUSES.includes(body.status)) doc.status = body.status;

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
  }

  // Recompute the confirmed value/qty from the campaign's prices + current fulfilment.
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

  await doc.save();
  return NextResponse.json({ submission: toSubmissionView(doc) });
}
