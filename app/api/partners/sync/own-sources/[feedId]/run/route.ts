import { NextResponse } from "next/server";
import { callPartnerPortal } from "@/lib/partner-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ feedId: string }> };

// "Run now" for a single Own Source feed import. 202 (started) or 409 (already running).
export async function POST(_request: Request, { params }: RouteParams) {
  const { feedId } = await params;
  const result = await callPartnerPortal(
    `/api/admin/system/sync/own-sources/${encodeURIComponent(feedId)}/run`,
    { method: "POST" },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
