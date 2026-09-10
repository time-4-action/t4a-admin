import { NextResponse } from "next/server";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  PreorderAccess,
  toCampaignView,
  toObjectId,
  sanitizeTiers,
} from "@/lib/preorder";
import type { CampaignStatus, PreorderTab } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/preorder/campaigns/[id] — full campaign sheet (builder + preview).
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ campaign: toCampaignView(doc) });
}

// PATCH /api/admin/preorder/campaigns/[id] — the builder's save. Accepts any subset
// of the editable fields; `tabs` replaces the whole sheet structure.
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    season?: string | null;
    currency?: string;
    status?: CampaignStatus;
    deadline?: string | null;
    rrpPricelist?: string | null;
    partnerPricelist?: string | null;
    tabs?: PreorderTab[];
  };
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (typeof body.title === "string" && body.title.trim()) doc.title = body.title.trim();
  if ("season" in body) doc.season = body.season?.trim() || null;
  if (typeof body.currency === "string" && body.currency.trim()) {
    doc.currency = body.currency.trim();
  }
  if (body.status && ["draft", "open", "closed"].includes(body.status)) {
    doc.status = body.status;
  }
  if ("deadline" in body) doc.deadline = body.deadline ? new Date(body.deadline) : null;
  if ("rrpPricelist" in body) doc.rrpPricelist = body.rrpPricelist?.trim() || null;
  if ("partnerPricelist" in body) doc.partnerPricelist = body.partnerPricelist?.trim() || null;
  if (Array.isArray(body.tabs)) {
    // Trust the admin-authored structure; mongoose coerces/validates on save. The
    // volume-discount ladder is the one part that carries range-checked numbers, so
    // it is normalized rather than trusted.
    doc.tabs = body.tabs.map((t) => ({
      ...t,
      tiers: sanitizeTiers(t?.tiers),
    })) as unknown as typeof doc.tabs;
  }
  await doc.save();
  return NextResponse.json({ campaign: toCampaignView(doc) });
}

// DELETE /api/admin/preorder/campaigns/[id] — remove a campaign and its submissions.
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderCampaign.findByIdAndDelete(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  await Promise.all([
    PreorderSubmission.deleteMany({ campaignId: oid }).exec(),
    PreorderAccess.deleteMany({ campaignId: oid }).exec(),
  ]);
  return NextResponse.json({ ok: true });
}
