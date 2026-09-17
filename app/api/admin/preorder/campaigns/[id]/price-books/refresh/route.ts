import { NextResponse } from "next/server";
import { connectDB, PreorderCampaign, toCampaignAdminView, toObjectId } from "@/lib/preorder";
import { refreshPriceBooks } from "@/lib/preorder-pricebooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/preorder/campaigns/[id]/price-books/refresh { pricelists?: string[] }
// Re-read the gross prices of the sheet's products in every non-default price list
// referenced by markets / customer rules (or the given ones). Also backfills row tax
// codes. Bounded MK fan-out (one call per product code, concurrency 10).
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { pricelists?: string[] };
  const result = await refreshPriceBooks(doc, Array.isArray(body.pricelists) ? body.pricelists.map(String) : undefined);
  return NextResponse.json({ result, priceBooks: toCampaignAdminView(doc).priceBooks });
}
