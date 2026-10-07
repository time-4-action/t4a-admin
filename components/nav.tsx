"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PLATFORM_NAME } from "@/lib/brand";
import { canSee, isSuperAdmin, type SectionKey } from "@/lib/access";
import { ThemeToggle } from "@/components/theme-toggle";
import { viewingAsName, type ViewingAs } from "@/components/viewing-as";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  Percent,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  UserCog,
  UserPlus,
  LogOut,
  KeyRound,
  Menu,
  X,
  Wrench,
  Mail,
  Handshake,
  RefreshCw,
  Warehouse,
  Folder,
  Sparkles,
  Zap,
  Cog,
  Crown,
  Blocks,
  Radar,
  SlidersHorizontal,
  LayoutGrid,
  Bookmark,
  Boxes,
  Tags,
  FileText,
  ReceiptText,
  FileMinus,
  ClipboardList,
  Building2,
  ShoppingCart,
} from "lucide-react";

type NavLinkDef = {
  href: string;
  label: string;
  icon: React.ElementType;
  matchPrefix?: boolean;
  superAdminOnly?: boolean;
  // Gate this link by another section than its group's (General holds both the
  // user-admin and the access-admin links).
  section?: SectionKey;
};
type NavSection = { label: string; section: SectionKey; links: NavLinkDef[] };

const sections: NavSection[] = [
  {
    // Users + access management in one group; each link keeps its own gate.
    label: "General",
    section: "general",
    links: [
      { href: "/users",              label: "Users",           icon: Users, matchPrefix: true },
      { href: "/roles",              label: "Access Types",    icon: ShieldCheck, section: "access" },
      { href: "/roles/assign",       label: "Assign Access",   icon: UserCog, section: "access" },
      { href: "/roles/scopes",       label: "Scopes",          icon: KeyRound, section: "access" },
      { href: "/roles/new",          label: "New Access Type", icon: UserPlus, section: "access" },
      { href: "/roles/super-admins", label: "Super Admins",    icon: Crown, section: "access", superAdminOnly: true },
    ],
  },
  {
    label: "AI",
    section: "ai",
    links: [
      { href: "/ai/dashboard", label: "Dashboard",  icon: LayoutDashboard },
      { href: "/ai/usage",     label: "Usage",      icon: BarChart3 },
      { href: "/ai/access",    label: "AI Access",  icon: ShieldCheck, matchPrefix: true, superAdminOnly: true },
    ],
  },
  {
    label: "Warranty",
    section: "warranty",
    links: [
      { href: "/warranty",          label: "Claims",          icon: Wrench, matchPrefix: true },
      { href: "/warranty/settings", label: "Email Settings",  icon: Mail },
      { href: "/warranty/access",   label: "Warranty Access", icon: ShieldCheck, superAdminOnly: true },
    ],
  },
  {
    label: "Partners",
    section: "partners",
    links: [
      { href: "/partners",        label: "Partners",        icon: Handshake, matchPrefix: true },
      { href: "/partners/sync",   label: "Catalogue Sync",  icon: RefreshCw },
      { href: "/partners/access", label: "Partners Access", icon: ShieldCheck, superAdminOnly: true },
    ],
  },
  {
    label: "Automation",
    section: "automation",
    links: [
      { href: "/automation",           label: "Overview",          icon: LayoutDashboard },
      { href: "/automation/warehouse", label: "Warehouse",         icon: Warehouse, matchPrefix: true },
      { href: "/automation/products",  label: "Products",          icon: Boxes, matchPrefix: true },
      { href: "/automation/customers", label: "Customers",         icon: Users, matchPrefix: true },
      { href: "/automation/pricelists", label: "Pricelists",       icon: Tags, matchPrefix: true },
      { href: "/automation/access",    label: "Automation Access", icon: ShieldCheck, superAdminOnly: true },
    ],
  },
  {
    label: "Builder",
    section: "builder",
    links: [
      { href: "/builder/saved",       label: "Saved Builds",    icon: Bookmark, matchPrefix: true },
      { href: "/builder",             label: "Section Builder", icon: Blocks },
      { href: "/builder/radar-chart", label: "Radar Chart",     icon: Radar },
      { href: "/builder/range-bars",  label: "Range Bars",      icon: SlidersHorizontal },
      { href: "/builder/layout",      label: "Section Layout",  icon: LayoutGrid },
      { href: "/builder/access",      label: "Builder Access",  icon: ShieldCheck, superAdminOnly: true },
    ],
  },
  {
    label: "Documents",
    section: "documents",
    links: [
      { href: "/documents/customer", label: "Customer", icon: Building2,     matchPrefix: true },
      { href: "/documents/invoices", label: "Invoices", icon: ReceiptText,   matchPrefix: true },
      { href: "/documents/credit-notes", label: "Credit notes", icon: FileMinus, matchPrefix: true },
      { href: "/documents/offers",   label: "Offers",   icon: FileText,      matchPrefix: true },
      { href: "/documents/orders",   label: "Orders",   icon: ClipboardList, matchPrefix: true },
      { href: "/documents/access",   label: "Documents Access", icon: ShieldCheck, superAdminOnly: true },
    ],
  },
  {
    label: "Preorder",
    section: "preorder",
    links: [
      { href: "/preorder",           label: "Campaigns",       icon: ClipboardList, matchPrefix: true },
      { href: "/preorder/vat-rates", label: "VAT rates",       icon: Percent },
      { href: "/preorder/access",    label: "Preorder Access", icon: ShieldCheck, superAdminOnly: true },
    ],
  },
  {
    label: "Customers",
    section: "customers",
    links: [
      { href: "/customers",        label: "All customers",    icon: Users, matchPrefix: true },
      { href: "/customers/access", label: "Customers Access", icon: ShieldCheck, superAdminOnly: true },
    ],
  },
];

// Per-section identity: a colored icon chip so each group reads at a glance and
// stays coherent with the home-page section palette.
const SECTION_STYLE: Record<SectionKey, { icon: React.ElementType; color: string; bg: string }> = {
  general:    { icon: Folder,    color: "text-sky-500",     bg: "bg-sky-500/10" },
  access:     { icon: KeyRound,  color: "text-violet-500",  bg: "bg-violet-500/10" },
  ai:         { icon: Sparkles,  color: "text-emerald-500", bg: "bg-emerald-500/10" },
  warranty:   { icon: Wrench,    color: "text-amber-500",   bg: "bg-amber-500/10" },
  partners:   { icon: Handshake, color: "text-indigo-500",  bg: "bg-indigo-500/10" },
  automation: { icon: Zap,       color: "text-rose-500",    bg: "bg-rose-500/10" },
  builder:    { icon: Blocks,    color: "text-blue-600 dark:text-blue-500", bg: "bg-blue-600/10" },
  documents:  { icon: FileText,  color: "text-teal-500",    bg: "bg-teal-500/10" },
  preorder:   { icon: ShoppingCart, color: "text-lime-600 dark:text-lime-500", bg: "bg-lime-600/10" },
  customers:  { icon: Users,     color: "text-cyan-600 dark:text-cyan-500", bg: "bg-cyan-600/10" },
  system:     { icon: Cog,       color: "text-slate-500",   bg: "bg-slate-500/10" },
};

const OPEN_SECTIONS_KEY = "t4a-nav-open-sections";

function UserAvatar({ user, size }: { user: NavUser; size: number }) {
  if (user.picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.picture}
        alt={user.name ?? "avatar"}
        width={size}
        height={size}
        className="rounded-full shrink-0 object-cover ring-1 ring-border"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = (user.name ?? user.email ?? "?")
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  return (
    <span
      className="rounded-full shrink-0 flex items-center justify-center bg-muted text-muted-foreground font-semibold select-none ring-1 ring-border"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

function NavLink({ href, label, icon: Icon, active, open, indent }: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  open: boolean;
  matchPrefix?: boolean;
  indent?: boolean;
}) {
  return (
    <Link
      href={href}
      title={!open ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl py-2 text-[13px] transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        open ? (indent ? "pl-3.5 pr-3" : "px-3") : "justify-center px-2",
        active
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent-brand rounded-r-full" />
      )}
      <Icon className={cn("w-[15px] h-[15px] shrink-0 transition-colors", active ? "text-foreground" : "text-muted-foreground/70 group-hover:text-foreground")} />
      {open && <span className="truncate">{label}</span>}
    </Link>
  );
}

// Compute whether a link is the active one (exact / prefix match), ceding to a
// more-specific sibling so e.g. /warranty isn't highlighted on /warranty/access.
function isLinkActive(link: NavLinkDef, links: NavLinkDef[], pathname: string): boolean {
  const exact = pathname === link.href;
  const prefixHit = !!link.matchPrefix && pathname.startsWith(link.href + "/");
  const siblingTakesIt = links.some(
    (s) =>
      s.href !== link.href &&
      (pathname === s.href || pathname.startsWith(s.href + "/")) &&
      s.href.length > link.href.length,
  );
  return (exact || prefixHit) && !siblingTakesIt;
}

type NavUser = { name?: string | null; email?: string | null; picture?: string | null };

// `roles` are the EFFECTIVE roles (app/layout.tsx): while a super-admin views the
// app as another user they are that user's, so the sections listed are exactly
// the ones that user can open; `viewingAs` then names them in the user block.
export default function Nav({ user, roles = [], viewingAs }: { user?: NavUser; roles?: string[]; viewingAs?: ViewingAs | null }) {
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const superAdmin = isSuperAdmin(roles);
  const visibleSections = sections
    .map((s) => ({
      ...s,
      links: s.links.filter((l) => canSee(roles, l.section ?? s.section) && (!l.superAdminOnly || superAdmin)),
    }))
    .filter((s) => s.links.length > 0);
  const canSeeSettings = canSee(roles, "system");

  // Which section contains the current route — used to auto-open it.
  const activeSectionKey = useMemo(() => {
    const hit = sections.find((s) =>
      s.links.some((l) => pathname === l.href || pathname.startsWith(l.href + "/")),
    );
    return hit?.section ?? null;
  }, [pathname]);

  // Accordion open/closed state, persisted. A section with no explicit entry
  // defaults to open iff it's the active section.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_SECTIONS_KEY);
      if (raw) setOpenSections(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify(openSections));
    } catch {
      /* ignore */
    }
  }, [openSections, hydrated]);

  // Navigating into a section opens it.
  useEffect(() => {
    if (activeSectionKey) {
      setOpenSections((prev) =>
        prev[activeSectionKey] ? prev : { ...prev, [activeSectionKey]: true },
      );
    }
  }, [activeSectionKey]);

  const isExpanded = (key: SectionKey) => openSections[key] ?? key === activeSectionKey;
  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => ({ ...prev, [key]: !(prev[key] ?? key === activeSectionKey) }));

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [mobileOpen]);

  const navContent = (isMobile: boolean) => {
    const isOpen = isMobile ? true : open;
    return (
      <>
        {/* Brand header */}
        <div className={cn(
          "flex items-center h-[57px] shrink-0 px-3 border-b border-border",
          isOpen ? "justify-between" : "justify-center",
        )}>
          {isOpen && (
            <div className="flex items-center gap-2.5 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/favicon.ico" alt="logo" className="h-6 w-6 object-contain rounded-lg shrink-0" />
              <span className="text-[13px] font-semibold text-foreground truncate">
                {PLATFORM_NAME}
              </span>
            </div>
          )}
          {isMobile ? (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {open ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* Nav sections */}
        <div className={cn("flex-1 overflow-y-auto px-2 py-3", isOpen ? "space-y-1" : "space-y-4")}>
          {visibleSections.map((section) => {
            const style = SECTION_STYLE[section.section];
            const SectionIcon = style.icon;

            // Collapsed rail: no headers, just the link icons (unchanged behaviour).
            if (!isOpen) {
              return (
                <div key={section.label} className="space-y-0.5">
                  {section.links.map((link) => (
                    <NavLink
                      key={link.href}
                      {...link}
                      active={isLinkActive(link, section.links, pathname)}
                      open={false}
                    />
                  ))}
                </div>
              );
            }

            // Expanded: collapsible accordion group with a colored section icon.
            const expanded = isExpanded(section.section);
            return (
              <div key={section.label}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.section)}
                  aria-expanded={expanded}
                  className="flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-[13px] font-medium text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={cn("w-[22px] h-[22px] rounded-md flex items-center justify-center shrink-0", style.bg)}>
                    <SectionIcon className={cn("w-3.5 h-3.5", style.color)} />
                  </span>
                  <span className="flex-1 text-left truncate">{section.label}</span>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-muted-foreground/60 transition-transform duration-150 shrink-0",
                      expanded ? "" : "-rotate-90",
                    )}
                    aria-hidden
                  />
                </button>
                {expanded && (
                  <div className="mt-0.5 mb-1 ml-[18px] pl-2 border-l border-border/60 space-y-0.5">
                    {section.links.map((link) => (
                      <NavLink
                        key={link.href}
                        {...link}
                        active={isLinkActive(link, section.links, pathname)}
                        open
                        indent
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Theme + Settings + user */}
        <div className="px-2 pb-2 pt-1 border-t border-border shrink-0 space-y-1.5">
          {/* Theme toggle row */}
          <div className={cn("px-1", !isOpen && "flex justify-center")}>
            {isOpen ? <ThemeToggle /> : <ThemeToggle collapsed />}
          </div>

          {canSeeSettings && (
            <Link
              href="/settings"
              title={!isOpen ? "Settings" : undefined}
              aria-current={pathname.startsWith("/settings") ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 w-full rounded-xl py-2 text-[13px] transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isOpen ? "px-3" : "justify-center px-2",
                pathname.startsWith("/settings")
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Settings className={cn("h-[15px] w-[15px] shrink-0", pathname.startsWith("/settings") ? "text-foreground" : "text-muted-foreground/70")} />
              {isOpen && <span>Settings</span>}
            </Link>
          )}

          {user && (
            <div className={cn(
              "flex items-center rounded-xl px-3 py-2 gap-2.5",
              !isOpen && "justify-center px-2",
            )}>
              {isOpen ? (
                <>
                  <UserAvatar user={viewingAs ? { name: viewingAsName(viewingAs) } : user} size={26} />
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
                </>
              ) : (
                <a href="/auth/logout" title="Logout" aria-label="Logout">
                  <UserAvatar user={user} size={26} />
                </a>
              )}
            </div>
          )}
        </div>
      </>
    );
  };

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
          <span className="text-[13px] font-semibold text-foreground">
            {PLATFORM_NAME}
          </span>
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
        {navContent(true)}
      </nav>

      {/* Desktop sidebar */}
      <nav
        aria-label="Primary"
        className={cn(
          "hidden md:flex h-screen flex-col shrink-0 bg-sidebar border-r border-border transition-all duration-200",
          open ? "w-[220px]" : "w-[60px]",
        )}
      >
        {navContent(false)}
      </nav>
    </>
  );
}
