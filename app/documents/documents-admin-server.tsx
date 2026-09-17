import { notFound } from "next/navigation";
import { getDocument, pdfSupported } from "@/lib/metakocka";
import { DocumentDetail } from "./documents-shared";
import { DOC_KIND_SLUGS, type DocKind } from "@/types/documents";

// Server builder for the admin document detail pages. Admins may view any
// document (gated to the `documents` section), so no per-customer check here.

function slug(kind: DocKind): string {
  return DOC_KIND_SLUGS[kind];
}

export async function AdminDetailPage({ kind, mkId }: { kind: DocKind; mkId: string }) {
  const detail = await getDocument(kind, mkId);
  if (!detail) notFound();
  const pdfHref = pdfSupported(kind)
    ? `/api/admin/documents/pdf?kind=${kind}&mkId=${encodeURIComponent(mkId)}`
    : undefined;
  return (
    <div className="h-full">
      <DocumentDetail detail={detail} pdfHref={pdfHref} backHref={`/documents/${slug(kind)}`} showPartner wide />
    </div>
  );
}
