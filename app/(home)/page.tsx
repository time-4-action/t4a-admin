import Link from "next/link";
import { auth0 } from "@/lib/auth";
import { rolesFromIdToken, canSee } from "@/lib/access";
import { ChevronRight } from "lucide-react";
import { sections } from "./sections";

export default async function WelcomePage() {
  const session = await auth0.getSession();
  const roles = rolesFromIdToken(session?.tokenSet?.idToken);
  // A card may carry its own gate (General mixes user-admin and access-admin cards).
  const visibleSections = sections
    .map((s) => ({ ...s, cards: s.cards.filter((c) => canSee(roles, c.section ?? s.section)) }))
    .filter((s) => s.cards.length > 0);

  const firstName = (session?.user?.name || session?.user?.email || "")
    .toString()
    .split(/[\s@]+/)[0];

  return (
    <div className="flex flex-col h-full">
      {/* Hero header */}
      <div className="shrink-0 border-b border-border bg-gradient-to-b from-muted/30 to-transparent">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-foreground tracking-tight leading-none reveal">
            {firstName ? `Welcome back, ${firstName}` : "Welcome"}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-2 reveal" style={{ animationDelay: "40ms" }}>
            Jump into any of the tools you have access to.
          </p>
        </div>
      </div>

      {/* Section panels — a balanced grid so single-link sections don't leave
          big empty rows. */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {visibleSections.map(({ label, icon: SectionIcon, color, bg, cards }, si) => (
            <section
              key={label}
              className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden reveal"
              style={{ animationDelay: `${si * 50}ms` }}
            >
              {/* Panel header */}
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60 bg-muted/30">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
                  <SectionIcon className={`w-4 h-4 ${color}`} />
                </span>
                <h2 className="text-[13px] font-semibold text-foreground tracking-tight flex-1">{label}</h2>
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
                  {cards.length}
                </span>
              </div>

              {/* Links */}
              <div className="divide-y divide-border/50">
                {cards.map(({ href, icon: Icon, title, desc }) => (
                  <Link
                    key={href}
                    href={href}
                    className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:bg-muted/40"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
                      <Icon className={`w-[18px] h-[18px] ${color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground leading-tight truncate group-hover:underline">
                        {title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug truncate">{desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all duration-150 shrink-0" aria-hidden />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
