import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The sticky h-12 breadcrumb bar at the top of every detail page
 * (`/users/[id]`, `/warranty/[id]`, `/partners/[sub]`): a back link, a
 * separator, and the current entity's name. Shared between the real page and
 * its `loading.tsx` twin so the skeleton header is byte-identical.
 *
 * With `right` set the bar becomes `justify-between` and the crumb is wrapped
 * so the right-hand action can sit flush against the edge.
 */
export function DetailCrumbBar({
  backHref,
  backLabel,
  current,
  right,
  className,
}: {
  backHref: string;
  backLabel: string;
  current: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  const crumb = (
    <>
      <Link
        href={backHref}
        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <ArrowLeft className="w-3 h-3" />
        {backLabel}
      </Link>
      <span className="mx-2 text-border/60 select-none text-xs">/</span>
      {current}
    </>
  );

  return (
    <header
      className={cn(
        "h-12 border-b border-border/60 flex items-center px-4 md:px-6 shrink-0 bg-background/95 backdrop-blur-sm sticky top-0 z-20",
        right && "justify-between",
        className,
      )}
    >
      {right ? <div className="flex items-center min-w-0">{crumb}</div> : crumb}
      {right}
    </header>
  );
}
