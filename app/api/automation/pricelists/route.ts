import { NextResponse } from "next/server";
import { callMkAutomation } from "@/lib/mk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/automation/pricelists — the price lists visible in each Metakocka company,
// plus title-matched suggestions and the mappings already saved.
//
// Metakocka has no endpoint that lists price lists, so the service derives them by scanning
// the whole catalogue (json/product_list with return_pricelist). That is expensive, so the
// service caches for 5 minutes; `?refresh=true` forces a fresh scan.
export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh");
  const path =
    refresh === "true" || refresh === "1" ? "/api/v1/pricelists?refresh=true" : "/api/v1/pricelists";

  const result = await callMkAutomation(path);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
