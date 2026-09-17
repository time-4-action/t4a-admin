import { NextResponse } from "next/server";
import type { Types } from "mongoose";
import { getSessionPartner } from "@/lib/portal";
import { connectDB, PreorderSubmission, toObjectId, toPortalSubmissionView } from "@/lib/preorder";
import { registerSalesOrder } from "@/lib/preorder-mk";
import { repriceSubmission } from "@/lib/preorder-submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/portal/preorder/submissions/[id]/register — the customer retries the
// Metakocka registration of THEIR submitted preorder after a failure. Safe to call
// repeatedly: the service looks the order up by its idempotency key before creating.
// Allowed even after the campaign closed (the request was made while open). The
// response carries no MK identifiers or error text.
export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const partner = await getSessionPartner();
  if (!partner) return NextResponse.json({ error: "no-account" }, { status: 404 });
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  await connectDB();
  const doc = await PreorderSubmission.findById(id).exec();
  if (!doc || doc.partnerMkId !== partner.mkId) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (doc.status !== "submitted") return NextResponse.json({ error: "not submitted" }, { status: 409 });
  const view = toPortalSubmissionView(doc);
  if (!view.registration.canRetry) {
    return NextResponse.json({ error: "not retryable", submission: view }, { status: 409 });
  }

  // A preorder without a pricing snapshot (submitted before VAT support) is re-priced
  // from the campaign as it is now before the order is built.
  if (!doc.snapshot?.pricing) {
    const rp = await repriceSubmission(doc);
    if (!rp.ok) return NextResponse.json({ error: rp.error, message: rp.message, submission: toPortalSubmissionView(doc) }, { status: rp.status });
  }
  await registerSalesOrder(doc._id as Types.ObjectId, { source: "customer" }, { partner });
  const fresh = await PreorderSubmission.findById(id).exec();
  return NextResponse.json({ submission: toPortalSubmissionView(fresh ?? doc) });
}
