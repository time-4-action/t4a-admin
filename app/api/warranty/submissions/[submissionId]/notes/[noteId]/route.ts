import { NextResponse } from "next/server";
import { callWarranty } from "@/lib/warranty-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ submissionId: string; noteId: string }> };

export async function DELETE(_: Request, { params }: RouteParams) {
  const { submissionId, noteId } = await params;
  const result = await callWarranty(
    `/api/admin/submissions/${encodeURIComponent(submissionId)}/notes/${encodeURIComponent(noteId)}`,
    { method: "DELETE" },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
