import { NextResponse, type NextRequest } from "next/server";
import { listDocuments } from "@/lib/metakocka";
import { annotatePreorderOrders } from "@/lib/preorder-visibility";
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
  // Admins see everything; preorder orders are annotated so the table can badge them.
  const preorder = kind === "order" ? await annotatePreorderOrders(items) : {};
  return NextResponse.json({ items, total, preorder });
}
