"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

const sections = [
  {
    label: "General",
    links: [
      { href: "/users", label: "Users", icon: Users },
    ],
  },
  {
    label: "Roles",
    links: [
      { href: "/roles",        label: "All Roles",    icon: ShieldCheck },
      { href: "/roles/assign", label: "Assign Roles", icon: UserCog },
      { href: "/roles/new",    label: "Add Role",     icon: UserPlus },
    ],
  },
  {
    label: "AI",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/usage",     label: "Usage",     icon: BarChart3 },
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
        className="rounded-full shrink-0 object-cover ring-1 ring-slate-200"
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
      className="rounded-full shrink-0 flex items-center justify-center bg-slate-100 text-slate-600 font-semibold select-none ring-1 ring-slate-200"
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
}) {
  return (
    <Link
      href={href}
      title={!open ? label : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl py-2 text-[13px] transition-all duration-150",
        open ? "px-3" : "justify-center px-2",
        active
          ? "bg-slate-100 text-slate-900 font-medium"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-slate-700 rounded-r-full" />
      )}
      <Icon className={cn("w-[15px] h-[15px] shrink-0 transition-colors", active ? "text-slate-700" : "text-slate-400 group-hover:text-slate-600")} />
      {open && <span className="truncate">{label}</span>}
    </Link>
  );
}

type NavUser = { name?: string | null; email?: string | null; picture?: string | null };

export default function Nav({ user }: { user?: NavUser }) {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();

  return (
    <nav className={cn(
      "h-screen flex flex-col shrink-0 bg-white border-r border-slate-100 transition-all duration-200",
      open ? "w-[220px]" : "w-[60px]"
    )}>
      {/* Brand header */}
      <div className={cn(
        "flex items-center h-[57px] shrink-0 px-3 border-b border-slate-100",
        open ? "justify-between" : "justify-center"
      )}>
        {open && (
          <div className="flex items-center gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="logo" className="h-6 w-6 object-contain rounded-lg shrink-0" />
            <span className="text-[13px] font-semibold text-slate-800 truncate">
              {process.env.NEXT_PUBLIC_APP_NAME ?? "Admin"}
            </span>
          </div>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
        >
          {open ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {sections.map((section) => (
          <div key={section.label}>
            {open && (
              <p className="px-3 pt-1 pb-1 text-[9px] font-bold uppercase tracking-widest text-slate-400 select-none">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.links.map((link) => (
                <NavLink
                  key={link.href}
                  {...link}
                  active={pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))}
                  open={open}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Settings + user */}
      <div className="px-2 pb-2 pt-1 border-t border-slate-100 shrink-0 space-y-0.5">
        <Link
          href="/settings"
          title={!open ? "Settings" : undefined}
          className={cn(
            "flex items-center gap-2.5 w-full rounded-xl py-2 text-[13px] transition-all duration-150",
            open ? "px-3" : "justify-center px-2",
            pathname.startsWith("/settings")
              ? "bg-slate-100 text-slate-900 font-medium"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          )}
        >
          <Settings className={cn("h-[15px] w-[15px] shrink-0", pathname.startsWith("/settings") ? "text-slate-700" : "text-slate-400")} />
          {open && <span>Settings</span>}
        </Link>

        {user && (
          <div className={cn(
            "flex items-center rounded-xl px-3 py-2 gap-2.5",
            !open && "justify-center px-2"
          )}>
            {open ? (
              <>
                <UserAvatar user={user} size={26} />
                <div className="flex-1 min-w-0">
                  {user.name && (
                    <p className="text-[12px] font-medium text-slate-800 truncate leading-tight">{user.name}</p>
                  )}
                  {user.email && (
                    <p className="text-[10px] text-slate-400 truncate leading-tight">{user.email}</p>
                  )}
                </div>
                <a
                  href="/auth/logout"
                  title="Logout"
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </a>
              </>
            ) : (
              <a href="/auth/logout" title="Logout">
                <UserAvatar user={user} size={26} />
              </a>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
