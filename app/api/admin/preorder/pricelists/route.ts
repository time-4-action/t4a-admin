import { NextResponse } from "next/server";
import { listSalesPricelists } from "@/lib/metakocka";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/preorder/pricelists — the Metakocka sales price lists, for the
// campaign builder's RRP / partner-price selectors. Derived + cached in the MK
// client (MK has no dedicated list-pricelists endpoint). `?refresh=1` re-scans now
// (a list just created in MK otherwise shows up within 30 minutes).
export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh");
  const pricelists = await listSalesPricelists({ force: refresh === "1" || refresh === "true" });
  return NextResponse.json({ pricelists });
}
