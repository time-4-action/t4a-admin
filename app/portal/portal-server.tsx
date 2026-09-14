import { redirect, notFound } from "next/navigation";
import { getSessionPartner, isPortalDocKind } from "@/lib/portal";
import { getDocument, pdfSupported } from "@/lib/metakocka";
import { customerMayViewDocument } from "@/lib/preorder-visibility";
import { DocumentList, DocumentDetail } from "@/app/documents/documents-shared";
import { CustomerInfoStrip } from "@/app/documents/customer-header";
import { DOC_KIND_LABELS, type DocKind } from "@/types/documents";

// Server building blocks for the customer portal so each route file is a one-liner.
// Both resolve the partner from the session email and redirect unmatched users to
// the no-account page. Design mirrors the admin document pages 1:1 (compact header,
// full-width content, same list/detail components).

function slugFor(kind: DocKind): string {
  return DOC_KIND_LABELS[kind].plural.toLowerCase(); // invoices | orders
}

export async function PortalListPage({ kind }: { kind: DocKind }) {
  if (!isPortalDocKind(kind)) notFound();
  const partner = await getSessionPartner();
  if (!partner) redirect("/portal/no-account");

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <h1 className="font-display text-lg font-medium tracking-tight text-foreground truncate">
            {DOC_KIND_LABELS[kind].plural}
          </h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto py-6">
        <div className="px-4 md:px-8 space-y-4">
          <CustomerInfoStrip customer={partner} />
          <DocumentList kind={kind} listUrl="/api/portal/documents" hrefBase={`/portal/${slugFor(kind)}`} />
        </div>
      </div>
    </div>
  );
}

export async function PortalDetailPage({ kind, mkId }: { kind: DocKind; mkId: string }) {
  if (!isPortalDocKind(kind)) notFound();
  const partner = await getSessionPartner();
  if (!partner) redirect("/portal/no-account");

  const detail = await getDocument(kind, mkId);
  // Ownership check (the document must belong to this customer's partner) plus preorder
  // visibility: a sales order of an unpublished preorder is not shown yet.
  if (!detail || !(await customerMayViewDocument(partner, detail))) notFound();

  const pdfHref = pdfSupported(kind)
    ? `/api/portal/documents/pdf?kind=${kind}&mkId=${encodeURIComponent(mkId)}`
    : undefined;

  // Related documents are internal (offers, delivery notes, …) — hidden from customers.
  return (
    <div className="h-full">
      <DocumentDetail detail={detail} pdfHref={pdfHref} backHref={`/portal/${slugFor(kind)}`} showLinks={false} wide />
    </div>
  );
}
