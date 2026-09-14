import { DetailCrumbBar } from "@/components/detail-crumb-bar";
import { Skeleton, SkeletonLine, SkeletonRegion } from "@/components/ui/skeleton";
import {
  UserDetailStatsSkeleton,
  UserUsageTableSkeleton,
  UserConversationsSkeleton,
  UserDetailSidebarSkeleton,
} from "./user-detail-client";

// Structural twin of page.tsx — same shell, hero, sections and sidebar, with
// the user's data swapped for shimmer. Shown while the six server-side
// Auth0 + Mongo calls resolve.
export default function UserDetailLoading() {
  return (
    <SkeletonRegion label="Loading user" className="flex flex-col h-full bg-background">
      <DetailCrumbBar
        backHref="/users"
        backLabel="Users"
        className="bg-background/90"
        current={<SkeletonLine lh="h-[18px]" w="w-32" />}
      />

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto min-w-0">
          {/* Hero */}
          <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-6 md:pb-7 border-b border-border/50 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-muted/40 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-muted/20 to-transparent rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div className="relative flex items-start gap-5">
              <Skeleton className="w-[60px] h-[60px] rounded-2xl shrink-0" />
              <div className="flex-1 min-w-0 pt-0.5">
                {/* text-2xl md:text-3xl leading-none */}
                <Skeleton className="h-6 md:h-[30px] w-56 rounded-md" delay={40} />
                <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-44" className="mt-0.5" delay={80} />
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Skeleton className="h-[22px] w-20 rounded-md" delay={120} />
                  <Skeleton className="h-[22px] w-16 rounded-md" delay={160} />
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="px-4 md:px-8 py-6 border-b border-border/50">
            <UserDetailStatsSkeleton />
          </div>

          {/* Usage */}
          <div className="px-4 md:px-8 py-6 md:py-7 border-b border-border/50">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[13px] font-semibold text-foreground">Usage by model</h2>
              <Skeleton className="h-[19px] w-7 rounded-full" />
            </div>
            <UserUsageTableSkeleton />
          </div>

          {/* Conversations */}
          <div className="px-4 md:px-8 py-6 md:py-7">
            <h2 className="text-[13px] font-semibold text-foreground mb-4">Conversations</h2>
            <UserConversationsSkeleton />
          </div>
        </div>

        <aside className="w-full md:w-[310px] shrink-0 border-t md:border-t-0 md:border-l border-border/60 bg-muted/10 overflow-y-auto">
          <UserDetailSidebarSkeleton />
        </aside>
      </div>
    </SkeletonRegion>
  );
}
