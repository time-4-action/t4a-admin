import { NextResponse } from "next/server";
import { listSalesPricelists } from "@/lib/metakocka";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/preorder/pricelists — the Metakocka sales price lists, for the
// campaign builder's RRP / partner-price selectors. Derived + cached in the MK
// client (MK has no dedicated list-pricelists endpoint).
export async function GET() {
  const pricelists = await listSalesPricelists();
  return NextResponse.json({ pricelists });
}
