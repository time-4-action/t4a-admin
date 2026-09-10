import { SkeletonRegion } from "@/components/ui/skeleton";
import { DocumentDetailSkeleton } from "@/app/documents/documents-shared";

// Twin of documents-admin-server.tsx's AdminDetailPage shell.
export default function Loading() {
  return (
    <SkeletonRegion label="Loading order" className="h-full">
      <DocumentDetailSkeleton kind="order" showPartner wide />
    </SkeletonRegion>
  );
}
