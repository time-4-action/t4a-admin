import { NextResponse } from "next/server";
import { callPartnerPortal } from "@/lib/partner-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Run now" for the PNV catalogue refresh — triggers the full pipeline (PNV → AI → Shopify),
// identical to the cron. Returns 202 (started) or 409 (a run is already in progress).
export async function POST() {
  const result = await callPartnerPortal("/api/admin/system/sync/pnv/run", {
    method: "POST",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
