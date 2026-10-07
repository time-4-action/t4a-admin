"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Compass, Home, Search } from "lucide-react";

// Root 404. Renders inside the shell (the sidebar stays), so it is reached both
// by unmatched URLs and by `notFound()` from a detail page whose record does not
// exist (a mistyped Metakocka id, a deleted campaign, …). The copy adapts to the
// section the URL points at so the way back is one click.

type SectionHint = { label: string; href: string; noun: string };

// First URL segment → where "back to the list" should land. `noun` is what the
// missing thing most likely was, used in the headline.
const SECTIONS: Record<string, SectionHint> = {
  users:      { label: "Users",        href: "/users",           noun: "user" },
  roles:      { label: "Access Types", href: "/roles",           noun: "access type" },
  ai:         { label: "AI",           href: "/ai/dashboard",    noun: "page" },
  warranty:   { label: "Claims",       href: "/warranty",        noun: "claim" },
  partners:   { label: "Partners",     href: "/partners",        noun: "partner" },
  automation: { label: "Automation",   href: "/automation",      noun: "page" },
  builder:    { label: "Saved Builds", href: "/builder/saved",   noun: "build" },
  documents:  { label: "Documents",    href: "/documents",       noun: "document" },
  preorder:   { label: "Campaigns",    href: "/preorder",        noun: "campaign" },
  customers:  { label: "Customers",    href: "/customers",       noun: "customer" },
  portal:     { label: "Portal",       href: "/portal/invoices", noun: "document" },
};

// Deeper nouns for the document families, where the id in the URL is the thing
// that was not found.
const DOC_NOUNS: Record<string, string> = {
  invoices: "invoice",
  "credit-notes": "credit note",
  offers: "offer",
  orders: "order",
  preorders: "preorder",
  submissions: "preorder",
};

export default function NotFound() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const segments = pathname.split("/").filter(Boolean);
  const [first, second] = segments;
  const isPortal = first === "portal";
  const section = first ? SECTIONS[first] : undefined;
  const noun = (second && DOC_NOUNS[second]) || section?.noun || "page";
  const hasId = segments.length >= 2 && !!second;
  const article = /^[aeiou]/i.test(noun) ? "an" : "a";
  const homeHref = isPortal ? "/portal/invoices" : "/";

  return (
    <div className="relative h-full overflow-hidden flex items-center justify-center px-6 bg-background">
      {/* Backdrop: a dot grid fading out from the centre + one soft brand glow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-40"
        style={{
          backgroundImage: "radial-gradient(color-mix(in oklch, var(--foreground) 22%, transparent) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, black 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, black 20%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[34rem] h-[34rem] rounded-full blur-3xl opacity-40 dark:opacity-30"
        style={{ background: "radial-gradient(closest-side, var(--accent-brand), transparent 70%)" }}
      />

      <div className="relative flex flex-col items-center text-center max-w-md w-full">
        {/* Eyebrow. Not the app's `.overline` class — Tailwind's `overline`
            utility wins and draws a text-decoration line over it. */}
        <span className="reveal inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-brand" />
          Error 404
        </span>

        {/* The number — huge, light, gradient-filled. */}
        <span
          className="font-display font-semibold leading-none tracking-[-0.06em] text-[9rem] md:text-[11rem] select-none bg-clip-text text-transparent -mt-2 reveal"
          style={{
            animationDelay: "30ms",
            backgroundImage:
              "linear-gradient(180deg, var(--foreground) 0%, color-mix(in oklch, var(--foreground) 55%, var(--background)) 100%)",
          }}
        >
          404
        </span>

        <h1
          className="font-display text-2xl md:text-[1.75rem] font-medium text-foreground tracking-tight mt-2 reveal"
          style={{ animationDelay: "60ms" }}
        >
          {hasId && noun !== "page"
            ? `We couldn’t find that ${noun}`
            : "This page doesn’t exist"}
        </h1>
        <p
          className="text-sm text-muted-foreground mt-2.5 leading-relaxed max-w-sm reveal"
          style={{ animationDelay: "100ms" }}
        >
          {hasId && noun !== "page"
            ? `It may have been removed, or the link points at ${article} ${noun} that never existed.`
            : "The address may be mistyped, or the page has moved somewhere else."}
        </p>

        {/* The path that missed, so a typo is visible at a glance. */}
        <code
          className="mt-4 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-2.5 py-1.5 font-mono text-[11.5px] text-muted-foreground reveal"
          style={{ animationDelay: "140ms" }}
          title={pathname}
        >
          <Search className="w-3 h-3 shrink-0 opacity-60" />
          <span className="truncate">{pathname}</span>
        </code>

        <div
          className="mt-7 flex flex-wrap items-center justify-center gap-2.5 reveal"
          style={{ animationDelay: "180ms" }}
        >
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push(homeHref))}
            className="inline-flex items-center gap-1.5 rounded-xl bg-foreground text-background px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Go back
          </button>
          {section && section.href !== pathname && (
            <Link
              href={section.href}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Compass className="w-3.5 h-3.5 text-accent-brand" />
              {section.label}
            </Link>
          )}
          {!(section && section.href === homeHref) && (
            <Link
              href={homeHref}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Home className="w-3.5 h-3.5" />
              {isPortal ? "Portal home" : "Home"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
