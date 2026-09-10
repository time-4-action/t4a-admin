import { DetailCrumbBar } from "@/components/detail-crumb-bar";
import { Skeleton, SkeletonLine, SkeletonRegion } from "@/components/ui/skeleton";
import { ClaimDetailSkeleton } from "./warranty-detail-client";

// Structural twin of page.tsx: crumb bar, hero, then the client body's cards.
// Shown while the warranty service + session calls resolve.
export default function ClaimDetailLoading() {
  return (
    <SkeletonRegion label="Loading claim" className="flex flex-col h-full bg-background">
      <DetailCrumbBar
        backHref="/warranty"
        backLabel="Claims"
        current={<SkeletonLine lh="h-[18px]" w="w-20" />}
        right={<Skeleton className="h-7 w-7 sm:w-[150px] rounded-md" />}
      />

      {/* Hero */}
      <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-5 md:pb-6 border-b border-border/50 overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/40 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {/* text-xl md:text-2xl leading-none */}
            <Skeleton className="h-5 md:h-6 w-48 rounded-md" />
            <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-64" className="mt-1" delay={40} />
            <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-40" className="mt-2" delay={80} />
          </div>
          <Skeleton className="h-[26px] w-24 rounded-full" delay={120} />
        </div>
      </div>

      <ClaimDetailSkeleton />
    </SkeletonRegion>
  );
}
