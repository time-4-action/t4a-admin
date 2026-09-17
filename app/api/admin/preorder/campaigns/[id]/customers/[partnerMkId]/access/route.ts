import { NextResponse } from "next/server";
import { connectDB, PreorderCampaign, PreorderAccess, PreorderSubmission, toObjectId } from "@/lib/preorder";
import { getMkCustomer } from "@/lib/mk-customers";
import { getPartnerById } from "@/lib/metakocka";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string; partnerMkId: string }> };

// Admin-side campaign access for ONE customer — the same grant the invite link
// creates (models/preorder-access.ts), given by hand.

// POST — unlock the campaign for this customer (idempotent).
export async function POST(_req: Request, { params }: RouteParams) {
  const { id, partnerMkId: raw } = await params;
  const partnerMkId = decodeURIComponent(raw);
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const campaign = await PreorderCampaign.findById(oid).exec();
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  const directory = await getMkCustomer(partnerMkId);
  const partner = directory ? { name: directory.name, email: directory.emails?.[0] } : await getPartnerById(partnerMkId).then((p) => (p ? { name: p.name, email: p.emails?.[0] } : null));
  if (!partner) return NextResponse.json({ error: "Partner not found in Metakocka" }, { status: 404 });
  await PreorderAccess.updateOne(
    { campaignId: campaign._id, partnerMkId },
    { $setOnInsert: { grantedAt: new Date() }, $set: { partnerName: partner.name, partnerEmail: partner.email } },
    { upsert: true },
  ).exec();
  return NextResponse.json({ ok: true, access: true });
}

// DELETE — take the access away again. Refused once the customer has a preorder
// (a submission carries access by itself; unlock / delete the preorder first).
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id, partnerMkId: raw } = await params;
  const partnerMkId = decodeURIComponent(raw);
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const sub = await PreorderSubmission.exists({ campaignId: oid, partnerMkId });
  if (sub) return NextResponse.json({ error: "This customer already has a preorder in this campaign — access cannot be removed." }, { status: 409 });
  await PreorderAccess.deleteOne({ campaignId: oid, partnerMkId }).exec();
  return NextResponse.json({ ok: true, access: false });
}
