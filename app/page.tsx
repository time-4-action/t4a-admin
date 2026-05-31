import Link from "next/link";
import { auth0 } from "@/lib/auth";
import { rolesFromIdToken, canSee, type SectionKey } from "@/lib/access";
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
  Folder,
  Sparkles,
  KeyRound,
  Cog,
} from "lucide-react";

const sections: {
  label: string;
  section: SectionKey;
  icon: React.ElementType;
  color: string;
  bg: string;
  cards: { href: string; icon: React.ElementType; title: string; desc: string }[];
}[] = [
  {
    label: "General",
    section: "general",
    icon: Folder,
    color: "text-sky-500",
    bg: "bg-sky-500/10",
    cards: [
      { href: "/users", icon: Users, title: "Users", desc: "Manage accounts and profiles" },
    ],
  },
  {
    label: "Access",
    section: "access",
    icon: KeyRound,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    cards: [
      { href: "/roles",        icon: ShieldCheck, title: "Access Types",  desc: "Configure permission roles" },
      { href: "/roles/assign", icon: UserCog,     title: "Assign Access", desc: "Grant access to users" },
    ],
  },
  {
    label: "AI",
    section: "ai",
    icon: Sparkles,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    cards: [
      { href: "/ai/dashboard", icon: LayoutDashboard, title: "AI Dashboard", desc: "Usage overview and KPIs" },
      { href: "/ai/usage",     icon: BarChart3,       title: "AI Usage",     desc: "Detailed logs and costs" },
      { href: "/ai/access",    icon: Bot,             title: "AI Access",    desc: "Manage AI access for users" },
    ],
  },
  {
    label: "Warranty",
    section: "warranty",
    icon: Wrench,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    cards: [
      { href: "/warranty",          icon: Wrench, title: "Warranty Claims", desc: "Review, triage and resolve" },
      { href: "/warranty/settings", icon: Mail,   title: "Email Settings",  desc: "Customize warranty emails" },
    ],
  },
  {
    label: "System",
    section: "system",
    icon: Cog,
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    cards: [
      { href: "/settings", icon: Settings, title: "Settings", desc: "App preferences" },
    ],
  },
];

export default async function WelcomePage() {
  const session = await auth0.getSession();
  const roles = rolesFromIdToken(session?.tokenSet?.idToken);
  const visibleSections = sections.filter((s) => canSee(roles, s.section));

  let cardIndex = 0;
  return (
    <div className="flex flex-col h-full">
      {/* Hero header */}
      <div className="shrink-0 border-b border-border">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-5 md:py-6">
          <h1 className="text-xl md:text-2xl font-semibold text-foreground tracking-tight leading-none reveal">
            Welcome
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1.5 reveal" style={{ animationDelay: "40ms" }}>
            Select a section to get started.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-5 md:py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {visibleSections.map(({ label, icon: SectionIcon, color, bg, cards }) => (
            <section key={label}>
              {/* Section header: colored chip + label + hairline rule */}
              <div className="flex items-center gap-2.5 mb-2.5">
                <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${bg}`}>
                  <SectionIcon className={`w-3.5 h-3.5 ${color}`} />
                </span>
                <h2 className="text-[13px] font-semibold text-foreground tracking-tight">{label}</h2>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                {cards.map(({ href, icon: Icon, title, desc }) => {
                  const i = cardIndex++;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className="group relative bg-surface border border-border rounded-xl p-3.5 flex items-center gap-3 hover:border-foreground/30 hover:shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background reveal"
                      style={{ animationDelay: `${100 + i * 30}ms` }}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${bg}`}>
                        <Icon className={`w-[18px] h-[18px] transition-colors ${color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground leading-tight truncate">{title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug truncate">{desc}</p>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-150 shrink-0" aria-hidden />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
