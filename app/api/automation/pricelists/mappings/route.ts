import { NextResponse } from "next/server";
import { callMkAutomation } from "@/lib/mk-api";
import type { PricelistMapping } from "@/types/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The source→target price-list pairs that a pricelist sync is allowed to write.
//
// This is the safety mechanism of the whole pricelist sync: a list's count_code is a
// per-company counter and does NOT identify the same list in the other company (live data
// has T4A 7 = "PP GOLD 2026" against CREAGLOBE 7 = "PP BRONZE 2026"), so only pairs that a
// human explicitly saved here are ever synced.

export async function GET() {
  const result = await callMkAutomation("/api/v1/pricelists/mappings");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

// PUT { mappings } — replaces the whole set in one transaction. The editor saves the table
// as a unit; a partial write could leave prices pointing at the wrong list.
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { mappings?: PricelistMapping[] };
  if (!Array.isArray(body?.mappings)) {
    return NextResponse.json({ error: "mappings (array) is required" }, { status: 400 });
  }

  const result = await callMkAutomation("/api/v1/pricelists/mappings", {
    method: "PUT",
    body: { mappings: body.mappings },
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
