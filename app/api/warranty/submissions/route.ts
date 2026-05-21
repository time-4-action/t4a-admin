import { NextResponse } from "next/server";
import { callWarranty } from "@/lib/warranty-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  const result = await callWarranty(
    `/api/admin/submissions${qs ? `?${qs}` : ""}`,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
