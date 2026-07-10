import { NextResponse } from "next/server";
import { callPartnerPortal } from "@/lib/partner-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ sub: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { sub: rawSub } = await params;
  const sub = decodeURIComponent(rawSub); // segment may arrive percent-encoded
  const result = await callPartnerPortal(
    `/api/admin/partners/${encodeURIComponent(sub)}`,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
