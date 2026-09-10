import { SkeletonRegion } from "@/components/ui/skeleton";
import { DocumentListSkeleton, DocumentDetailSkeleton } from "@/app/documents/documents-shared";
import { CustomerInfoStripSkeleton } from "@/app/documents/customer-header";
import { DOC_KIND_LABELS, type DocKind } from "@/types/documents";

// Route-level loading twins for the customer portal. Same shells as
// portal-server.tsx (header, padding, strip + list / detail) so the skeleton
// and the loaded page share one geometry.

export function PortalListLoading({ kind }: { kind: DocKind }) {
  return (
    <SkeletonRegion label={`Loading ${DOC_KIND_LABELS[kind].plural.toLowerCase()}`} className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <h1 className="font-display text-lg font-medium tracking-tight text-foreground truncate">
            {DOC_KIND_LABELS[kind].plural}
          </h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto py-6">
        <div className="px-4 md:px-8 space-y-4">
          <CustomerInfoStripSkeleton />
          <DocumentListSkeleton kind={kind} />
        </div>
      </div>
    </SkeletonRegion>
  );
}

export function PortalDetailLoading({ kind }: { kind: DocKind }) {
  return (
    <SkeletonRegion label={`Loading ${kind}`} className="h-full">
      <DocumentDetailSkeleton kind={kind} wide />
    </SkeletonRegion>
  );
}
