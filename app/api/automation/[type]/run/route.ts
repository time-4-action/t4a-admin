import { NextResponse } from "next/server";
import { callMkAutomation } from "@/lib/mk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ type: string }> };

const RUN_PATH: Record<string, string> = {
  warehouse: "/api/v1/warehouse/sync",
  products: "/api/v1/products/sync",
};

// POST — trigger a sync now. The service responds 202 (started) or 409 (already running).
export async function POST(_request: Request, { params }: RouteParams) {
  const { type } = await params;
  const path = RUN_PATH[type];
  if (!path) return NextResponse.json({ error: "Unknown sync type" }, { status: 400 });

  const result = await callMkAutomation(path, { method: "POST" });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
