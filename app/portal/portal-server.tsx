import { redirect, notFound } from "next/navigation";
import { getSessionPartner } from "@/lib/portal";
import { getDocument, pdfSupported } from "@/lib/metakocka";
import { DocumentList, DocumentDetail } from "@/app/documents/documents-shared";
import { DOC_KIND_LABELS, type DocKind } from "@/types/documents";

// Server building blocks for the customer portal so each route file is a one-liner.
// Both resolve the partner from the session email and redirect unmatched users to
// the no-account page.

function slugFor(kind: DocKind): string {
  return DOC_KIND_LABELS[kind].plural.toLowerCase(); // invoices | offers | orders
}

export async function PortalListPage({ kind }: { kind: DocKind }) {
  const partner = await getSessionPartner();
  if (!partner) redirect("/portal/no-account");

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border bg-gradient-to-b from-muted/30 to-transparent">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
          <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight leading-none">
            {DOC_KIND_LABELS[kind].plural}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-2">{partner.name}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-6">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <DocumentList kind={kind} listUrl="/api/portal/documents" hrefBase={`/portal/${slugFor(kind)}`} />
        </div>
      </div>
    </div>
  );
}

export async function PortalDetailPage({ kind, mkId }: { kind: DocKind; mkId: string }) {
  const partner = await getSessionPartner();
  if (!partner) redirect("/portal/no-account");

  const detail = await getDocument(kind, mkId);
  // Ownership check: the document must belong to this customer's partner.
  if (!detail || detail.partner?.mkId !== partner.mkId) notFound();

  const pdfHref = pdfSupported(kind)
    ? `/api/portal/documents/pdf?kind=${kind}&mkId=${encodeURIComponent(mkId)}`
    : undefined;

  return (
    <div className="h-full">
      <DocumentDetail detail={detail} pdfHref={pdfHref} backHref={`/portal/${slugFor(kind)}`} />
    </div>
  );
}
