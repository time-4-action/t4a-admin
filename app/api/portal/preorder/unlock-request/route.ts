import { NextResponse } from "next/server";
import { getSessionPartner } from "@/lib/portal";
import {
  connectDB,
  PreorderSubmission,
  toSubmissionView,
  toObjectId,
} from "@/lib/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/portal/preorder/unlock-request — a customer asks an admin to unlock their
// submitted preorder so they can edit it, with an optional note explaining why.
// Body: { campaignId, note }.
export async function POST(request: Request) {
  const partner = await getSessionPartner();
  if (!partner) return NextResponse.json({ error: "no-account" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { campaignId?: string; note?: string };
  const campaignId = (body.campaignId || "").trim();
  if (!toObjectId(campaignId)) return NextResponse.json({ error: "invalid campaign" }, { status: 400 });

  await connectDB();
  const doc = await PreorderSubmission.findOne({
    campaignId,
    partnerMkId: partner.mkId,
  }).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Only a locked (submitted/confirmed) preorder can be requested to unlock.
  if (doc.status !== "submitted" && doc.status !== "confirmed") {
    return NextResponse.json({ error: "not locked" }, { status: 400 });
  }

  doc.unlockRequestNote = (body.note || "").trim().slice(0, 2000) || null;
  doc.unlockRequestedAt = new Date();
  await doc.save();

  return NextResponse.json({ submission: toSubmissionView(doc) });
}
