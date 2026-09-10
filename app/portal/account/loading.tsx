import { SkeletonRegion } from "@/components/ui/skeleton";
import { CustomerProfileSkeleton } from "@/app/documents/customer-profile";

// Twin of app/portal/account/page.tsx: same header + padding around the profile.
export default function Loading() {
  return (
    <SkeletonRegion label="Loading account" className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <h1 className="font-display text-lg font-medium tracking-tight text-foreground truncate">My Account</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto py-6">
        <div className="px-4 md:px-8">
          <CustomerProfileSkeleton />
        </div>
      </div>
    </SkeletonRegion>
  );
}
