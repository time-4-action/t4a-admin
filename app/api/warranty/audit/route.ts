import { NextResponse } from "next/server";
import { callWarranty } from "@/lib/warranty-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/warranty/audit?entityType=claim|settings&entityId=<id>
// Proxies to the warranty service's audit endpoints — the service owns the
// history. Lives under /api/warranty/* so warranty-admins (not only
// super-admins) can read it.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: "entityType and entityId are required" },
      { status: 400 },
    );
  }

  let path: string;
  if (entityType === "claim") {
    path = `/api/admin/submissions/${encodeURIComponent(entityId)}/audit`;
  } else if (entityType === "settings") {
    path = `/api/admin/settings/audit`;
  } else {
    return NextResponse.json({ error: "unknown entityType" }, { status: 400 });
  }

  const result = await callWarranty(path);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  // Service returns { entries: AuditEntry[] }; pass it straight through.
  return NextResponse.json(result.data, { status: result.status });
}
