import { NextResponse, type NextRequest } from "next/server";
import { getSessionPartner, isPortalDocKind } from "@/lib/portal";
import { listDocuments } from "@/lib/metakocka";
import { parseDocKind } from "@/types/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List the logged-in customer's documents for one family. The partner is derived
// from the session email — any partner id in the request is ignored.
export async function GET(req: NextRequest) {
  const kind = parseDocKind(req.nextUrl.searchParams.get("type"));
  if (!isPortalDocKind(kind)) return NextResponse.json({ error: "invalid type" }, { status: 400 });

  const partner = await getSessionPartner();
  if (!partner) return NextResponse.json({ error: "no-account", items: [], total: 0 }, { status: 404 });

  const { items, total } = await listDocuments(kind, partner.mkId);
  return NextResponse.json({ items, total });
}
