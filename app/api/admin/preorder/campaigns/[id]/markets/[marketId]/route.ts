import { NextResponse } from "next/server";
import { connectDB, PreorderCampaign, toCampaignAdminView, toObjectId } from "@/lib/preorder";
import { deleteMarket, upsertMarket } from "@/lib/preorder-markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string; marketId: string }> };

// PATCH /api/admin/preorder/campaigns/[id]/markets/[marketId] — partial update
// (name / color / countries / config; `config` replaces the whole layer).
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id, marketId } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const res = await upsertMarket(doc, body, marketId);
  if ("error" in res) return NextResponse.json(res, { status: res.status });
  return NextResponse.json({ market: res, markets: toCampaignAdminView(doc).markets });
}

// DELETE — removes the market; customer rules pointing at it fall back to their country.
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id, marketId } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const res = await deleteMarket(doc, marketId);
  if ("error" in res) return NextResponse.json(res, { status: res.status });
  return NextResponse.json({ ok: true, ...res, markets: toCampaignAdminView(doc).markets });
}
