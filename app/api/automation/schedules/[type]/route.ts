import { NextResponse } from "next/server";
import { callMkAutomation } from "@/lib/mk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ type: string }> };

// Maps our type to the mk-automation schedule endpoint + its body key.
const MAP: Record<string, { path: string; key: string }> = {
  warehouse: { path: "/api/v1/schedules/warehouse-sync", key: "warehouseSync" },
  products: { path: "/api/v1/schedules/product-sync", key: "productSync" },
};

// PUT { cron } — update a sync's cron schedule.
export async function PUT(request: Request, { params }: RouteParams) {
  const { type } = await params;
  const m = MAP[type];
  if (!m) return NextResponse.json({ error: "Unknown sync type" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { cron?: string };
  const cron = body?.cron?.trim();
  if (!cron) return NextResponse.json({ error: "cron is required" }, { status: 400 });

  const result = await callMkAutomation(m.path, { method: "PUT", body: { [m.key]: cron } });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
