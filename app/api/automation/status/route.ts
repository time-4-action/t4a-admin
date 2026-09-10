import { NextResponse } from "next/server";
import { callMkAutomation } from "@/lib/mk-api";
import type { MkStatus, MkRun } from "@/types/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Combined automation status: live schedule/last-run state + recent run history per type.
export async function GET() {
  const [status, whRuns, prRuns, custRuns, plRuns] = await Promise.all([
    callMkAutomation("/api/v1/status"),
    callMkAutomation("/api/v1/runs?type=warehouse&limit=20"),
    callMkAutomation("/api/v1/runs?type=products&limit=20"),
    callMkAutomation("/api/v1/runs?type=customers&limit=20"),
    callMkAutomation("/api/v1/runs?type=pricelists&limit=20"),
  ]);

  if (!status.ok) {
    return NextResponse.json(
      { reachable: false, error: status.error },
      { status: status.status === 502 ? 200 : status.status },
    );
  }

  const s = status.data as MkStatus;
  return NextResponse.json({
    ...s,
    runs: {
      warehouse: (whRuns.ok ? (whRuns.data as MkRun[]) : []) ?? [],
      products: (prRuns.ok ? (prRuns.data as MkRun[]) : []) ?? [],
      customers: (custRuns.ok ? (custRuns.data as MkRun[]) : []) ?? [],
      pricelists: (plRuns.ok ? (plRuns.data as MkRun[]) : []) ?? [],
    },
    reachable: true,
  });
}
