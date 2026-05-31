"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { canSee, type SectionKey } from "@/lib/access";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCog,
  UserPlus,
  LogOut,
  KeyRound,
  Bot,
  Menu,
  X,
  Wrench,
  Mail,
} from "lucide-react";

const sections: { label: string; section: SectionKey; links: { href: string; label: string; icon: React.ElementType; matchPrefix?: boolean }[] }[] = [
  {
    label: "General",
    section: "general",
    links: [
      { href: "/users", label: "Users", icon: Users, matchPrefix: true },
    ],
  },
  {
    label: "Access",
    section: "access",
    links: [
      { href: "/roles",         label: "Access Types",  icon: ShieldCheck },
      { href: "/roles/assign",  label: "Assign Access", icon: UserCog },
      { href: "/roles/scopes",  label: "Scopes",        icon: KeyRound },
      { href: "/roles/new",     label: "New Access Type", icon: UserPlus },
    ],
  },
  {
    label: "AI",
    section: "ai",
    links: [
      { href: "/ai/dashboard", label: "Dashboard",  icon: LayoutDashboard },
      { href: "/ai/usage",     label: "Usage",      icon: BarChart3 },
      { href: "/ai/access",    label: "AI Access",  icon: Bot, matchPrefix: true },
    ],
  },
  {
    label: "Warranty",
    section: "warranty",
    links: [
      { href: "/warranty",          label: "Claims",         icon: Wrench, matchPrefix: true },
      { href: "/warranty/settings", label: "Email Settings", icon: Mail },
    ],
  },
];

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

function NavLink({ href, label, icon: Icon, active, open }: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  open: boolean;
  matchPrefix?: boolean;
}) {
  return (
    <Link
      href={href}
      title={!open ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl py-2 text-[13px] transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        open ? "px-3" : "justify-center px-2",
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

type NavUser = { name?: string | null; email?: string | null; picture?: string | null };

export default function Nav({ user, roles = [] }: { user?: NavUser; roles?: string[] }) {
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const visibleSections = sections.filter((s) => canSee(roles, s.section));
  const canSeeSettings = canSee(roles, "system");

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
                {process.env.NEXT_PUBLIC_APP_NAME ?? "Admin"}
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
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {visibleSections.map((section) => (
            <div key={section.label}>
              {isOpen && (
                <p className="px-3 pt-1 pb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground select-none">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.links.map((link) => {
                  const exact = pathname === link.href;
                  const prefixHit =
                    !!link.matchPrefix && pathname.startsWith(link.href + "/");
                  const siblingTakesIt = section.links.some(
                    (s) =>
                      s.href !== link.href &&
                      (pathname === s.href || pathname.startsWith(s.href + "/")) &&
                      s.href.length > link.href.length,
                  );
                  return (
                    <NavLink
                      key={link.href}
                      {...link}
                      active={(exact || prefixHit) && !siblingTakesIt}
                      open={isOpen}
                    />
                  );
                })}
              </div>
            </div>
          ))}
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
                  <UserAvatar user={user} size={26} />
                  <div className="flex-1 min-w-0">
                    {user.name && (
                      <p className="text-[12px] font-medium text-foreground truncate leading-tight">{user.name}</p>
                    )}
                    {user.email && (
                      <p className="text-[10px] text-muted-foreground truncate leading-tight">{user.email}</p>
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
            {process.env.NEXT_PUBLIC_APP_NAME ?? "Admin"}
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
