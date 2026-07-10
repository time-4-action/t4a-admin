import { NextResponse } from "next/server";
import { callPartnerPortal } from "@/lib/partner-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Catalogue Sync status: proxies the portal's unified scheduler status. Token stays server-side.
export async function GET() {
  const result = await callPartnerPortal("/api/admin/system/sync");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
