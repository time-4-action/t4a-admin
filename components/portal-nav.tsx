"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { viewingAsName, type ViewingAs } from "@/components/viewing-as";
import { ReceiptText, FileMinus, ClipboardList, Building2, LogOut, Menu, X, ShoppingCart } from "lucide-react";
import { PLATFORM_NAME } from "@/lib/brand";
import { PortalAccountSwitcher } from "@/components/portal-account-switcher";

// The B2B customer portal shell. Shown to any authenticated non-admin (they hold
// no role; their documents are matched by email inside the portal). Deliberately
// stripped down: brand + document links, no admin sections. Offers are
// deliberately not exposed to customers (see PORTAL_DOC_KINDS in lib/portal.ts).

type PortalUser = { name?: string | null; email?: string | null; picture?: string | null };

const links = [
  { href: "/portal/preorders", label: "Preorders", icon: ShoppingCart },
  { href: "/portal/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/portal/orders", label: "Sales orders", icon: ClipboardList },
  { href: "/portal/credit-notes", label: "Credit notes", icon: FileMinus },
  { href: "/portal/account", label: "My Account", icon: Building2 },
];

const BRAND = PLATFORM_NAME;

function initials(user?: PortalUser): string {
  const base = (user?.name || user?.email || "?").trim();
  const parts = base.split(/[\s@]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

function Avatar({ user }: { user?: PortalUser }) {
  if (user?.picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.picture} alt="" className="h-[26px] w-[26px] rounded-full object-cover shrink-0" />;
  }
  return (
    <span className="h-[26px] w-[26px] rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-400 text-[11px] font-semibold flex items-center justify-center shrink-0">
      {initials(user)}
    </span>
  );
}

export default function PortalNav({ user, viewingAs }: { user?: PortalUser; viewingAs?: ViewingAs | null }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const content = (isMobile: boolean) => (
    <>
      {/* Brand header */}
      <div className="flex items-center h-[57px] shrink-0 px-3 border-b border-border justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.ico" alt="logo" className="h-6 w-6 object-contain rounded-lg shrink-0" />
          <span className="text-[13px] font-semibold text-foreground truncate">{BRAND}</span>
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Agents only: which account(s) the portal shows */}
      <PortalAccountSwitcher />

      {/* Links */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-[13px] transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className={cn("h-[17px] w-[17px] shrink-0", active ? "text-teal-500" : "text-muted-foreground/70")} />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>

      {/* Theme + user */}
      <div className="px-2 pb-2 pt-1 border-t border-border shrink-0 space-y-1.5">
        <div className="px-1">
          <ThemeToggle />
        </div>
        {user && (
          <div className="flex items-center rounded-xl px-3 py-2 gap-2.5">
            <Avatar user={viewingAs ? { name: viewingAsName(viewingAs) } : user} />
            <div className="flex-1 min-w-0">
              {viewingAs ? (
                <>
                  <p className="text-[12px] font-medium text-foreground truncate leading-tight">{viewingAsName(viewingAs)}</p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate leading-tight">viewed by {user.email ?? user.name}</p>
                </>
              ) : (
                <>
                  {user.name && (
                    <p className="text-[12px] font-medium text-foreground truncate leading-tight">{user.name}</p>
                  )}
                  {user.email && (
                    <p className="text-[10px] text-muted-foreground truncate leading-tight">{user.email}</p>
                  )}
                </>
              )}
            </div>
            <a
              href="/auth/logout"
              title="Logout"
              aria-label="Logout"
              className="p-1 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-12 bg-sidebar border-b border-border flex items-center px-3 z-40">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 ml-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.ico" alt="logo" className="h-5 w-5 object-contain rounded-md" />
          <span className="text-[13px] font-semibold text-foreground">{BRAND}</span>
        </div>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Mobile slide-out nav */}
      <nav
        aria-label="Primary"
        className={cn(
          "md:hidden fixed top-0 left-0 bottom-0 w-[260px] bg-sidebar border-r border-border z-50 flex flex-col transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {content(true)}
      </nav>

      {/* Desktop sidebar */}
      <nav
        aria-label="Primary"
        className="hidden md:flex h-screen flex-col shrink-0 bg-sidebar border-r border-border w-[220px]"
      >
        {content(false)}
      </nav>
    </>
  );
}
