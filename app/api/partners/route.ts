import { NextResponse } from "next/server";
import { loadPartnerList } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Partners list. A "partner" is an Auth0 user holding PARTNER_ROLE_NAME; we
 * left-join the portal's per-sub activity rollup onto that identity list so
 * dormant partners still appear (with zeros). See lib/partners.ts.
 */
export async function GET() {
  return NextResponse.json(await loadPartnerList());
}
