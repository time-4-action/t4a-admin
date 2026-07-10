import { NextResponse, type NextRequest } from "next/server";
import { listDocuments } from "@/lib/metakocka";
import { parseDocKind } from "@/types/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin browse: list any partner's documents for one family. Gated to the
// `documents` section by middleware (lib/proxy.ts); the admin passes the partner
// mk_id they picked.
export async function GET(req: NextRequest) {
  const kind = parseDocKind(req.nextUrl.searchParams.get("type"));
  const partner = req.nextUrl.searchParams.get("partner");
  if (!kind) return NextResponse.json({ error: "invalid type" }, { status: 400 });
  if (!partner) return NextResponse.json({ error: "missing partner" }, { status: 400 });

  const { items, total } = await listDocuments(kind, partner);
  return NextResponse.json({ items, total });
}
