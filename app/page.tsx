"use client";
import Link from "next/link";
import {
  Users,
  ShieldCheck,
  UserCog,
  LayoutDashboard,
  BarChart3,
  Settings,
  ArrowUpRight,
  Bot,
} from "lucide-react";

const cards = [
  { href: "/users",        icon: Users,           title: "Users",        desc: "Manage accounts and profiles", accent: "text-violet-500", bg: "bg-violet-50" },
  { href: "/roles",        icon: ShieldCheck,     title: "Roles",        desc: "Configure permission roles",   accent: "text-sky-500",    bg: "bg-sky-50" },
  { href: "/roles/assign", icon: UserCog,         title: "Assign Roles", desc: "Grant roles to users",         accent: "text-indigo-500", bg: "bg-indigo-50" },
  { href: "/ai/dashboard", icon: LayoutDashboard, title: "Dashboard",    desc: "AI usage overview and KPIs",   accent: "text-emerald-500",bg: "bg-emerald-50" },
  { href: "/ai/usage",     icon: BarChart3,       title: "Usage",        desc: "Detailed logs and costs",      accent: "text-amber-500",  bg: "bg-amber-50" },
  { href: "/ai/access",    icon: Bot,             title: "AI Access",    desc: "Manage AI access for users",   accent: "text-blue-500",   bg: "bg-blue-50" },
  { href: "/settings",     icon: Settings,        title: "Settings",     desc: "App preferences",              accent: "text-slate-500",  bg: "bg-slate-100" },
];

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Admin";

export default function WelcomePage() {
  return (
    <div className="flex flex-col h-full">
      {/* Hero header */}
      <div className="shrink-0 px-4 md:px-8 pt-8 md:pt-10 pb-6 md:pb-8 border-b border-border">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Welcome back</p>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{appName}</h1>
        <p className="text-sm text-muted-foreground mt-1">Select a section below to get started.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
          {cards.map(({ href, icon: Icon, title, desc, accent, bg }) => (
            <Link
              key={href}
              href={href}
              className="group relative bg-background border border-border rounded-2xl p-5 flex flex-col gap-4 hover:border-slate-300 hover:shadow-sm transition-all duration-150"
            >
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${accent}`} />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-150 mt-0.5" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground leading-tight">{title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
