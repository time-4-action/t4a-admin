import { NextResponse } from "next/server";
import { getSyncState, startMkCustomerSync, countMkCustomers } from "@/lib/mk-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/preorder/customers/sync — status of the directory sync.
export async function GET() {
  const [sync, total] = await Promise.all([getSyncState(), countMkCustomers()]);
  return NextResponse.json({ sync, totalCustomers: total });
}

// POST — start a full pull of every Metakocka partner into the directory (runs in the
// background; poll GET). 202 when started, 409 when one is already running.
export async function POST() {
  const started = await startMkCustomerSync();
  const sync = await getSyncState();
  return NextResponse.json({ started, sync }, { status: started ? 202 : 409 });
}
