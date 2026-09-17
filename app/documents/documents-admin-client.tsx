"use client";
import { FileText } from "lucide-react";
import CustomerHeader, { CustomerInfoStrip, CustomerInfoStripSkeleton } from "./customer-header";
import { useSelectedCustomer } from "./use-customer";
import { DocumentList, DocumentListSkeleton } from "./documents-shared";
import { DOC_KIND_LABELS, DOC_KIND_SLUGS, type DocKind } from "@/types/documents";

// Admin document list page (Invoices / Offers / Orders) for the selected customer.
function slug(kind: DocKind): string {
  return DOC_KIND_SLUGS[kind];
}

export default function DocumentsAdminClient({ kind }: { kind: DocKind }) {
  const { customer, ready, onSelect } = useSelectedCustomer();

  return (
    <div className="flex flex-col h-full">
      <CustomerHeader title={`Customer ${DOC_KIND_LABELS[kind].plural}`} customer={customer} onSelect={onSelect} />
      <div className="flex-1 overflow-y-auto py-6">
        <div className="px-4 md:px-8 space-y-4">
          {!ready ? (
            // Same two blocks DocumentList shows once a customer is known, so the
            // page keeps one continuous shape from "resolving customer" to "loaded".
            <>
              <CustomerInfoStripSkeleton />
              <DocumentListSkeleton kind={kind} />
            </>
          ) : customer ? (
            <>
              <CustomerInfoStrip customer={customer} />
              <DocumentList
                kind={kind}
                listUrl={`/api/admin/documents?partner=${encodeURIComponent(customer.mkId)}`}
                hrefBase={`/documents/${slug(kind)}`}
              />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-16 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-[13px] text-muted-foreground">Use the customer selector above to choose a customer.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
