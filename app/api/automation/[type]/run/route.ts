import { NextResponse } from "next/server";
import { isMkRunType, runMkAutomation } from "@/lib/mk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ type: string }> };

// POST — trigger a sync now. The service responds 202 (started) or 409 (already running).
// `?dryRun=true` is forwarded to the service (customer + pricelist syncs) to preview
// without writing.
export async function POST(request: Request, { params }: RouteParams) {
  const { type } = await params;
  if (!isMkRunType(type)) return NextResponse.json({ error: "Unknown sync type" }, { status: 400 });

  const dryRun = new URL(request.url).searchParams.get("dryRun");
  const result = await runMkAutomation(type, { dryRun: dryRun === "true" || dryRun === "1" });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
