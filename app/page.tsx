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
  Wrench,
  Mail,
} from "lucide-react";

const cards = [
  { href: "/users",             icon: Users,           title: "Users",            desc: "Manage accounts and profiles" },
  { href: "/roles",             icon: ShieldCheck,     title: "Access Types",     desc: "Configure permission roles" },
  { href: "/roles/assign",      icon: UserCog,         title: "Assign Access",    desc: "Grant access to users" },
  { href: "/ai/dashboard",      icon: LayoutDashboard, title: "AI Dashboard",     desc: "Usage overview and KPIs" },
  { href: "/ai/usage",          icon: BarChart3,       title: "AI Usage",         desc: "Detailed logs and costs" },
  { href: "/ai/access",         icon: Bot,             title: "AI Access",        desc: "Manage AI access for users" },
  { href: "/warranty",          icon: Wrench,          title: "Warranty Claims",  desc: "Review, triage and resolve" },
  { href: "/warranty/settings", icon: Mail,            title: "Email Settings",   desc: "Customize warranty emails" },
  { href: "/settings",          icon: Settings,        title: "Settings",         desc: "App preferences" },
];

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Admin";

export default function WelcomePage() {
  return (
    <div className="flex flex-col h-full">
      {/* Hero header */}
      <div className="shrink-0 px-4 md:px-8 pt-10 md:pt-14 pb-8 md:pb-10 border-b border-border">
        <p className="overline text-muted-foreground mb-3 reveal">Welcome back</p>
        <h1 className="font-display text-4xl md:text-5xl font-medium text-foreground tracking-tight leading-none reveal" style={{ animationDelay: "40ms" }}>
          {appName}
        </h1>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-md reveal" style={{ animationDelay: "80ms" }}>
          Select a section below to get started.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
          {cards.map(({ href, icon: Icon, title, desc }, i) => (
            <Link
              key={href}
              href={href}
              className="group relative bg-surface border border-border rounded-2xl p-5 flex flex-col gap-4 hover:border-foreground/30 hover:shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background reveal"
              style={{ animationDelay: `${120 + i * 35}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover:bg-accent-brand/10 transition-colors">
                  <Icon className="w-5 h-5 text-muted-foreground group-hover:text-accent-brand transition-colors" />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-accent-brand group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-150 mt-0.5" aria-hidden />
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
