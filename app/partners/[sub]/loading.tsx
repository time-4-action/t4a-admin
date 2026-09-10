import { DetailCrumbBar } from "@/components/detail-crumb-bar";
import { SkeletonLine, SkeletonRegion } from "@/components/ui/skeleton";
import { PartnerDetailSkeleton } from "./partner-detail-client";

// Structural twin of page.tsx, shown while the portal + Auth0 calls resolve.
export default function PartnerDetailLoading() {
  return (
    <SkeletonRegion label="Loading partner" className="flex flex-col h-full bg-background">
      <DetailCrumbBar
        backHref="/partners"
        backLabel="Partners"
        current={<SkeletonLine lh="h-[18px]" w="w-32" />}
      />
      <PartnerDetailSkeleton />
    </SkeletonRegion>
  );
}
