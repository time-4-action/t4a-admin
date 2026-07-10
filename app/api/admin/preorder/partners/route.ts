import { NextResponse, type NextRequest } from "next/server";
import { searchPartners } from "@/lib/metakocka";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Partner search for the admin "submit on behalf" picker (by name / email / tax number).
// Scoped under /api/admin/preorder/* so a preorder-admin (not a documents-admin) may call
// it. An empty query lists some partners so the picker isn't blank on load.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const partners = await searchPartners(q);
  return NextResponse.json({ partners });
}
