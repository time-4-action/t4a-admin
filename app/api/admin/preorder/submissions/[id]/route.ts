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
import { readSubmissionOrder } from "@/lib/preorder-mk";
import { patchSubmission, type SubmissionPatch } from "@/lib/preorder-admin";
import { campaignFromSnapshot, type AllocationResult } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

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

// PATCH /api/admin/preorder/submissions/[id] — admin actions on a submission
// (status / unlock with detachOrder / dismissUnlockRequest / legacy per-line
// fulfilment). The logic lives in patchSubmission (lib/preorder-admin.ts), shared
// with the agent API.
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as SubmissionPatch;
  const session = await auth0.getSession();
  const res = await patchSubmission(id, body, { source: "admin", email: session?.user?.email ?? null });
  if (!res.ok) return NextResponse.json(res.body, { status: res.status });
  return NextResponse.json({ submission: toSubmissionView(res.doc) });
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
