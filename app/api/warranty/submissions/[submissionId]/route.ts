import { NextResponse } from "next/server";
import { callWarranty } from "@/lib/warranty-api";

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
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const result = await callWarranty(
    `/api/admin/submissions/${encodeURIComponent(submissionId)}`,
    { method: "PATCH", body },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
