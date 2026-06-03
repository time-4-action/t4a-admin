import { NextResponse } from "next/server";
import { callWarranty } from "@/lib/warranty-api";
import { buildAuditEnvelope } from "@/lib/warranty-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await callWarranty("/api/admin/settings");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}

export async function PUT(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  // Swap the client's audit payload for a server-stamped envelope; the service
  // records the entry (and computes the field changes) itself.
  const { audit, ...settings } = body;
  const _audit = await buildAuditEnvelope(audit);

  const result = await callWarranty("/api/admin/settings", {
    method: "PUT",
    body: { ...settings, _audit },
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
