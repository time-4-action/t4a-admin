"use client";

// app/preorder/[campaignId]/campaign-nav.tsx
//
// The campaign page header shared by EVERY campaign page (Overview · Sheet ·
// Markets & Customers · Preorders · Preview). It is two fixed-height rows —
//
//   ┌ title row (h-14): back · title + meta line · … · actions ┐
//   └ nav row  (h-9):  underline tab strip        · navExtra   ┘
//
// — so the tab strip sits on the exact same pixels on every page. Page-specific
// toolbars (the sheet's season/price-list controls, the preview's sheet tabs) are
// NOT part of the header; they live below it in the page body. Deliberately not
// the sheet's pill TabBar look — that one switches content tabs, this one
// switches pages. Admin-only — lives here, not in preorder-shared.tsx (which
// the portal imports).

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, LayoutDashboard, Table2, Globe2, ClipboardList, Eye, Link2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CampaignNavKey = "overview" | "sheet" | "markets" | "preorders" | "preview";

const ITEMS: {
  key: CampaignNavKey;
  label: string;
  short?: string;
  icon: React.ElementType;
  path: (id: string) => string;
  exact?: boolean;
}[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, path: (id) => `/preorder/${id}`, exact: true },
  { key: "sheet", label: "Sheet", icon: Table2, path: (id) => `/preorder/${id}/edit` },
  { key: "markets", label: "Markets & Customers", short: "Markets", icon: Globe2, path: (id) => `/preorder/${id}/markets` },
  { key: "preorders", label: "Preorders", icon: ClipboardList, path: (id) => `/preorder/${id}/submissions` },
  { key: "preview", label: "Preview", icon: Eye, path: (id) => `/preorder/${id}/preview` },
];

// The campaign's magic invite link, copyable from EVERY campaign page (it sits in
// the header's action row). The token is ensured server-side; the absolute URL is
// built from the browser origin.
export function CopyInviteButton({ campaignId, className }: { campaignId: string; className?: string }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/preorder/campaigns/${campaignId}/invite`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.path) setInviteUrl(`${window.location.origin}${d.path}`);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [campaignId]);
  const copy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  };
  return (
    <Button variant="outline" size="sm" className={cn("h-8", className)} onClick={copy} disabled={!inviteUrl} title={inviteUrl ?? "Invite link"}>
      {copied ? <><Check className="w-3.5 h-3.5 text-lime-600" /> Copied</> : <><Link2 className="w-3.5 h-3.5" /> Copy invite link</>}
    </Button>
  );
}

/** The underline tab strip alone — always rendered through CampaignHeader. */
export function CampaignNav({
  campaignId,
  active,
  className,
  children,
}: {
  campaignId: string;
  active?: CampaignNavKey;
  className?: string;
  /** Right-aligned extras that share the row (view switchers etc.). */
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className={cn("flex items-stretch gap-3 px-4 md:px-6 h-9 -mb-px", className)}>
      <nav className="flex items-stretch gap-0.5 min-w-0 overflow-x-auto scrollbar-none" aria-label="Campaign">
        {ITEMS.map((item) => {
          const href = item.path(campaignId);
          const isActive = active
            ? active === item.key
            : item.exact
              ? pathname === href
              : pathname === href || pathname.startsWith(href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative isolate inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 text-[12.5px] font-medium transition-colors",
                "border-b-2",
                isActive
                  ? "border-lime-600 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("w-3.5 h-3.5 shrink-0 transition-colors", isActive ? "text-lime-600" : "text-muted-foreground/70 group-hover:text-foreground/70")} />
              {item.short ? (
                <>
                  <span className="hidden lg:inline">{item.label}</span>
                  <span className="lg:hidden">{item.short}</span>
                </>
              ) : (
                item.label
              )}
              {/* hover surface, kept clear of the underline */}
              <span className="pointer-events-none absolute inset-x-0.5 top-1 bottom-1.5 rounded-md transition-colors group-hover:bg-muted/60 -z-10" aria-hidden />
            </Link>
          );
        })}
      </nav>
      {children != null && <div className="ml-auto flex items-center gap-2 shrink-0 pb-px">{children}</div>}
    </div>
  );
}

/**
 * The full sticky header: fixed-height title row + the nav strip. Pass a string
 * `title` for the standard h1, or a node (the sheet passes its title input).
 * `meta` is the 11px line under the title (status badge + counters), `actions`
 * the right side of the title row, `navExtra` the right side of the nav row.
 */
export function CampaignHeader({
  campaignId,
  active,
  backHref = "/preorder",
  title,
  meta,
  beforeActions,
  actions,
  navExtra,
  hideNav = false,
  className,
}: {
  campaignId: string;
  active: CampaignNavKey;
  backHref?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Status text that sits before the invite button (the sheet's autosave state). */
  beforeActions?: React.ReactNode;
  actions?: React.ReactNode;
  navExtra?: React.ReactNode;
  /** Title row only — for detail pages that are one level below the campaign tabs. */
  hideNav?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-20", className)}>
      <div className="flex items-center gap-3 px-4 md:px-6 h-14">
        <Link href={backHref} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0 flex flex-col justify-center">
          {typeof title === "string" ? (
            <h1 className="text-[15px] font-semibold text-foreground truncate leading-tight">{title}</h1>
          ) : (
            title
          )}
          {meta != null && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground min-h-[16.5px] truncate">{meta}</div>
          )}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 shrink-0">
          {beforeActions}
          <CopyInviteButton campaignId={campaignId} />
          {actions}
        </div>
      </div>
      {!hideNav && (
        <CampaignNav campaignId={campaignId} active={active}>
          {navExtra}
        </CampaignNav>
      )}
    </header>
  );
}
