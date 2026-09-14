import { NextResponse } from "next/server";
import { connectDB, PreorderCampaign, toObjectId } from "@/lib/preorder";
import { campaignGeo } from "@/lib/preorder-customers";
import { getSyncState, countMkCustomers } from "@/lib/mk-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/preorder/campaigns/[id]/customers/geo — per-country customer counts
// (directory + campaign-scoped), manual pins, and the directory sync status.
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [geo, sync, total] = await Promise.all([campaignGeo(doc), getSyncState(), countMkCustomers()]);
  return NextResponse.json({ ...geo, sync, totalCustomers: total });
}
