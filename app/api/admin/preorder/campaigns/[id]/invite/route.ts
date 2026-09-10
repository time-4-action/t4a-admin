import { NextResponse } from "next/server";
import { connectDB, PreorderCampaign, ensureShareToken, toObjectId } from "@/lib/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/preorder/campaigns/[id]/invite — the campaign's magic-link token
// (creating one if missing) and its relative path. The admin builds the absolute URL
// client-side from the browser origin.
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const token = await ensureShareToken(doc);
  return NextResponse.json({ token, path: `/portal/preorders/join/${token}` });
}
