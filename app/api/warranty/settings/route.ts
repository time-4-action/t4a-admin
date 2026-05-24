import { NextResponse } from "next/server";
import { callWarranty } from "@/lib/warranty-api";

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
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const result = await callWarranty("/api/admin/settings", {
    method: "PUT",
    body,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
