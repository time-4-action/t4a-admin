import { NextResponse } from "next/server";
import { callWarranty } from "@/lib/warranty-api";
import { buildAuditEnvelope } from "@/lib/warranty-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ submissionId: string }> };

export async function GET(_: Request, { params }: RouteParams) {
  const { submissionId } = await params;
  const result = await callWarranty(
    `/api/admin/submissions/${encodeURIComponent(submissionId)}`,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { submissionId } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  // Replace the client's audit payload with a server-stamped envelope. The
  // warranty service records the entry itself (it computes the field changes);
  // we only supply who (from the session) and the optional message.
  const { audit, ...fields } = body;
  const _audit = await buildAuditEnvelope(audit);

  const result = await callWarranty(
    `/api/admin/submissions/${encodeURIComponent(submissionId)}`,
    { method: "PATCH", body: { ...fields, _audit } },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
