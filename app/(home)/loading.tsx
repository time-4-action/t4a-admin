import { ChevronRight } from "lucide-react";
import { Skeleton, SkeletonLine, SkeletonRegion } from "@/components/ui/skeleton";
import { sections } from "./sections";

// Structural twin of the welcome page. The section panels are static data
// (icons, labels, link icons), so they render for real; only the user's
// name and the link titles/descriptions shimmer. Every section is shown —
// admins see exactly the loaded layout, others see a few panels drop away.
export default function WelcomeLoading() {
  return (
    <SkeletonRegion label="Loading" className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border bg-gradient-to-b from-muted/30 to-transparent">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">
          {/* text-2xl md:text-3xl leading-none → 24px / 30px */}
          <Skeleton className="h-6 md:h-[30px] w-64 rounded-md" />
          <p className="text-[13px] text-muted-foreground mt-2">Jump into any of the tools you have access to.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {sections.map(({ label, icon: SectionIcon, color, bg, cards }, si) => (
            <section key={label} className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60 bg-muted/30">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
                  <SectionIcon className={`w-4 h-4 ${color}`} />
                </span>
                <h2 className="text-[13px] font-semibold text-foreground tracking-tight flex-1">{label}</h2>
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
                  {cards.length}
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {cards.map(({ href, icon: Icon }, ci) => (
                  <div key={href} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
                      <Icon className={`w-[18px] h-[18px] ${color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* leading-tight 13px → 16.25px; leading-snug 11px → 15.1px */}
                      <SkeletonLine lh="h-4" h="h-3.5" w={["w-24", "w-32", "w-28"][ci % 3]} delay={si * 50 + ci * 30} />
                      <SkeletonLine lh="h-[15px]" h="h-2.5" w={["w-44", "w-36", "w-52"][ci % 3]} className="mt-0.5" delay={si * 50 + ci * 30 + 20} />
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" aria-hidden />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
