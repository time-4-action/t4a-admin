import { NextResponse } from "next/server";
import { connectDB, PreorderCampaign, ensureShareToken, toObjectId } from "@/lib/preorder";
import { portalUrl } from "@/lib/portal-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/preorder/campaigns/[id]/invite — the campaign's magic-link token
// (creating one if missing), its relative path and the absolute customer-facing
// URL on the portal domain (PORTAL_BASE_URL) — never the admin's browser origin.
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const token = await ensureShareToken(doc);
  const path = `/portal/preorders/join/${token}`;
  return NextResponse.json({ token, path, url: portalUrl(path) });
}
