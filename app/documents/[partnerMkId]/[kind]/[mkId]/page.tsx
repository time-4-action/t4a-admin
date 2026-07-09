import { notFound } from "next/navigation";
import { getDocument, pdfSupported } from "@/lib/metakocka";
import { DocumentDetail } from "@/app/documents/documents-shared";
import { parseDocKind } from "@/types/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ partnerMkId: string; kind: string; mkId: string }>;
}) {
  const { partnerMkId: rawPartner, kind: rawKind, mkId: rawMkId } = await params;
  const kind = parseDocKind(rawKind);
  if (!kind) notFound();

  const partnerMkId = decodeURIComponent(rawPartner);
  const mkId = decodeURIComponent(rawMkId);
  const detail = await getDocument(kind, mkId);
  if (!detail) notFound();

  const pdfHref = pdfSupported(kind)
    ? `/api/admin/documents/pdf?kind=${kind}&mkId=${encodeURIComponent(mkId)}`
    : undefined;

  return (
    <div className="h-full">
      <DocumentDetail
        detail={detail}
        pdfHref={pdfHref}
        backHref={`/documents/${encodeURIComponent(partnerMkId)}`}
        showPartner
      />
    </div>
  );
}
