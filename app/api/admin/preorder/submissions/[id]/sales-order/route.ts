import { NextResponse } from "next/server";
import type { Types } from "mongoose";
import { auth0 } from "@/lib/auth";
import { connectDB, PreorderSubmission, toSubmissionView, toObjectId } from "@/lib/preorder";
import { readSubmissionOrder, registerSalesOrder } from "@/lib/preorder-mk";
import { repriceSubmission } from "@/lib/preorder-submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/preorder/submissions/[id]/sales-order — register (or retry) the
// submission's Metakocka sales order. The order is built from the FROZEN snapshot
// (exactly what the customer submitted); the service looks the order up by its
// idempotency key before creating, so calling this twice never creates two orders.
// 409 when a registration is already in flight or the order already exists.
export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();

  const doc = await PreorderSubmission.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (doc.status !== "submitted") {
    return NextResponse.json({ error: "Only a submitted preorder can be registered in Metakocka." }, { status: 409 });
  }
  if (doc.mkSalesOrder?.mkId && (!doc.mkOrder || doc.mkOrder.state === "created")) {
    return NextResponse.json(
      { error: "A sales order already exists for this submission.", submission: toSubmissionView(doc) },
      { status: 409 },
    );
  }

  // A preorder without a pricing snapshot (submitted before VAT support), or one the
  // admin asks to re-price, is re-priced from the campaign as it is now before the
  // order is built.
  const body = (await _req.json().catch(() => ({}))) as { reprice?: boolean };
  if (body.reprice || !doc.snapshot?.pricing) {
    const rp = await repriceSubmission(doc);
    if (!rp.ok) return NextResponse.json({ error: rp.message, submission: toSubmissionView(doc) }, { status: rp.status });
  }

  const session = await auth0.getSession();
  const result = await registerSalesOrder(doc._id as Types.ObjectId, {
    source: "admin",
    email: session?.user?.email ?? null,
  });
  const fresh = (await PreorderSubmission.findById(id).exec()) ?? doc;
  const allocation = result.state === "created" ? await readSubmissionOrder(fresh, { fresh: true }) : null;
  const status = result.state === "created" ? 200 : result.state === "pending" ? 409 : 502;
  return NextResponse.json({ submission: toSubmissionView(fresh), result, allocation }, { status });
}
