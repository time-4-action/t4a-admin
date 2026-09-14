"use client";

// app/preorder/[campaignId]/campaign-nav.tsx
//
// The campaign-scoped navigation shared by every campaign page:
// Overview · Sheet · Markets & Customers · Preorders · Preview. Same pill look as the
// sheet's TabBar (lime active state). Admin-only — lives here, not in
// preorder-shared.tsx (which the portal imports).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type CampaignNavKey = "overview" | "sheet" | "markets" | "preorders" | "preview";

const ITEMS: { key: CampaignNavKey; label: string; path: (id: string) => string; exact?: boolean }[] = [
  { key: "overview", label: "Overview", path: (id) => `/preorder/${id}`, exact: true },
  { key: "sheet", label: "Sheet", path: (id) => `/preorder/${id}/edit` },
  { key: "markets", label: "Markets & Customers", path: (id) => `/preorder/${id}/markets` },
  { key: "preorders", label: "Preorders", path: (id) => `/preorder/${id}/submissions` },
  { key: "preview", label: "Preview", path: (id) => `/preorder/${id}/preview` },
];

export function CampaignNav({
  campaignId,
  active,
  className,
  compact,
}: {
  campaignId: string;
  active?: CampaignNavKey;
  className?: string;
  compact?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex items-center gap-1 overflow-x-auto", className)} aria-label="Campaign">
      {ITEMS.map((item) => {
        const href = item.path(campaignId);
        const isActive = active
          ? active === item.key
          : item.exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={item.key}
            href={href}
            className={cn(
              "rounded-full border px-3 text-[12px] font-medium whitespace-nowrap transition-colors",
              compact ? "h-7 leading-7" : "h-8 leading-8",
              isActive
                ? "border-lime-600 bg-lime-600 text-white"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
