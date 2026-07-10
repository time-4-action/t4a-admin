import { NextResponse, type NextRequest } from "next/server";
import { getDocument, getDocumentPdf } from "@/lib/metakocka";
import { parseDocKind } from "@/types/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin document PDF. Gated to the `documents` section by middleware; admins may
// view any partner's document, so no per-partner ownership check.
export async function GET(req: NextRequest) {
  const kind = parseDocKind(req.nextUrl.searchParams.get("kind"));
  const mkId = req.nextUrl.searchParams.get("mkId");
  if (!kind || !mkId) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const pdf = await getDocumentPdf(kind, mkId);
  if (!pdf.ok) return NextResponse.json({ error: pdf.error }, { status: pdf.status });

  // Best-effort filename from the document number.
  const doc = await getDocument(kind, mkId);
  return new NextResponse(pdf.bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc?.countCode || mkId}.pdf"`,
    },
  });
}
