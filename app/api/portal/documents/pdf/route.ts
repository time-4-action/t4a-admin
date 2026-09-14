import { NextResponse, type NextRequest } from "next/server";
import { getSessionPartner, isPortalDocKind } from "@/lib/portal";
import { getDocument, getDocumentPdf } from "@/lib/metakocka";
import { parseDocKind } from "@/types/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stream a document PDF to the logged-in customer. Re-verifies ownership
// (doc.partner.mkId === session partner) so a customer can't fetch another
// partner's document by guessing an mk_id.
export async function GET(req: NextRequest) {
  const kind = parseDocKind(req.nextUrl.searchParams.get("kind"));
  const mkId = req.nextUrl.searchParams.get("mkId");
  if (!isPortalDocKind(kind) || !mkId) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const partner = await getSessionPartner();
  if (!partner) return NextResponse.json({ error: "no-account" }, { status: 404 });

  const doc = await getDocument(kind, mkId);
  if (!doc || doc.partner?.mkId !== partner.mkId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const pdf = await getDocumentPdf(kind, mkId);
  if (!pdf.ok) return NextResponse.json({ error: pdf.error }, { status: pdf.status });

  return new NextResponse(pdf.bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.countCode || mkId}.pdf"`,
    },
  });
}
