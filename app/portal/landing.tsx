import {
  ShoppingCart,
  ClipboardList,
  ReceiptText,
  FileMinus,
  Building2,
  ArrowRight,
  MessageCircle,
  Mail,
  UserPlus,
} from "lucide-react";
import { PLATFORM_NAME } from "@/lib/brand";

// The public face of the B2B portal — what a logged-out visitor sees at /portal
// (and at the bare domain). Kept deliberately basic: what is inside, which email
// to sign in with, and how the first sign-in works. Nothing from the system and
// no mention of the admin side.
//
// Sized for a real desktop: the container runs to ~1500px and every element
// steps up at lg / xl so a 1920×1080 screen is used instead of a small block
// floating in the middle. Phones and tablets keep the compact scale.

const BRAND = PLATFORM_NAME;
const CONTACTS = ["grega@time-4-action.com"];
const WHATSAPP = "+386 51 618 733";
const WHATSAPP_HREF = "https://wa.me/38651618733";

const items = [
  { icon: ShoppingCart, label: "Preorders", desc: "Fill in the campaigns you are invited to and follow the confirmed order." },
  { icon: ClipboardList, label: "Sales orders", desc: "Every order line by line, with what has already shipped." },
  { icon: ReceiptText, label: "Invoices", desc: "Due dates, payment status and a PDF for your bookkeeping." },
  { icon: FileMinus, label: "Credit notes", desc: "Credited and refunded amounts, linked to their invoice." },
  { icon: Building2, label: "Account details", desc: "Your company, addresses and contacts as we have them on file." },
];

const help = [
  {
    q: "Which email?",
    a: (
      <>
        The one your B2B account on <span className="text-foreground">patrikinternational.com</span> uses. That is
        how we match you to your company&rsquo;s documents.
      </>
    ),
  },
  {
    q: "First time?",
    a: (
      <>
        Create an account with that email, confirm it with the one-time code we send, then set a password. The
        password is for this portal only.
      </>
    ),
  },
];

function sanitizeReturnTo(v?: string): string | null {
  if (!v || !v.startsWith("/portal") || v.startsWith("//")) return null;
  return v;
}

const CTA_BASE =
  "inline-flex items-center justify-center gap-2.5 rounded-xl h-13 md:h-14 xl:h-[60px] px-7 xl:px-9 text-[15px] md:text-[16px] xl:text-[17px] font-semibold shadow-sm hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function PortalLanding({ returnTo }: { returnTo?: string }) {
  const target = sanitizeReturnTo(returnTo) ?? "/portal";
  const loginHref = `/auth/login?returnTo=${encodeURIComponent(target)}`;
  // Extra query params on /auth/login are forwarded to Auth0 as authorization
  // params; screen_hint=signup opens Universal Login on the sign-up tab.
  const signupHref = `${loginHref}&screen_hint=signup`;

  return (
    <div className="min-h-full flex flex-col justify-center">
      <div className="w-full max-w-[1500px] mx-auto px-5 md:px-10 xl:px-14 py-8 md:py-10">
        {/* Row 1: headline + actions beside the card, vertically centred on each other. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-x-16 xl:gap-x-24 2xl:gap-x-28 gap-y-10 items-center">
          <div>
            {/* Brand: logo and name stacked into the same left edge as the headline. */}
            <div className="flex items-center gap-3.5 md:gap-4 reveal">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/favicon.ico"
                alt="Patrik"
                className="h-14 w-14 md:h-[72px] md:w-[72px] xl:h-20 xl:w-20 object-contain shrink-0 -ml-1.5"
              />
              <div>
                <p className="text-[15px] md:text-[17px] xl:text-[18px] font-semibold text-foreground leading-tight">{BRAND}</p>
                <p className="text-[12px] md:text-[13.5px] xl:text-[14px] text-muted-foreground mt-1">
                  Customer portal for Patrik dealers and partners
                </p>
              </div>
            </div>
            <h1
              className="font-display text-[30px] md:text-[44px] xl:text-[56px] font-semibold text-foreground tracking-tight leading-[1.08] mt-8 md:mt-10 max-w-[15ch] reveal"
              style={{ animationDelay: "40ms" }}
            >
              Your orders and invoices, in one place.
            </h1>
            <p
              className="text-[15px] md:text-[17px] xl:text-[18px] text-muted-foreground mt-5 leading-relaxed max-w-xl reveal"
              style={{ animationDelay: "80ms" }}
            >
              Everything between your company and PATRIK, read straight from our order system — no waiting
              for an email.
            </p>

            <div
              className="mt-9 xl:mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3.5 md:gap-4 max-w-xl reveal"
              style={{ animationDelay: "120ms" }}
            >
              <a href={loginHref} className={`${CTA_BASE} bg-accent-brand text-accent-brand-foreground`}>
                Log in
                <ArrowRight className="h-5 w-5" />
              </a>
              <a href={signupHref} className={`${CTA_BASE} bg-foreground text-background`}>
                <UserPlus className="h-5 w-5" />
                Create account
              </a>
            </div>
          </div>

          <section
            aria-labelledby="inside"
            className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden reveal"
            style={{ animationDelay: "120ms" }}
          >
            {/* Eyebrow header: a small tracked label reads as a card title, not a list heading. */}
            <div className="flex items-center justify-between gap-4 px-5 md:px-6 xl:px-7 pt-5 pb-4 border-b border-border">
              <h2 id="inside" className="text-[12px] xl:text-[12.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                What you&rsquo;ll find inside
              </h2>
              <span className="text-[12px] xl:text-[12.5px] text-muted-foreground tabular-nums">{items.length} sections</span>
            </div>
            <ul className="divide-y divide-border">
              {items.map(({ icon: Icon, label, desc }) => (
                <li
                  key={label}
                  className="group flex items-center gap-4 xl:gap-5 px-5 md:px-6 xl:px-7 py-4 md:py-[18px] transition-colors hover:bg-muted/40"
                >
                  <span className="h-11 w-11 xl:h-12 xl:w-12 rounded-xl border border-accent-brand/25 bg-accent-brand/10 text-accent-brand flex items-center justify-center shrink-0 transition-colors group-hover:border-accent-brand/45">
                    <Icon className="h-5 w-5 xl:h-[22px] xl:w-[22px]" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] md:text-[15.5px] xl:text-[16.5px] font-semibold text-foreground leading-tight">{label}</p>
                    <p className="text-[13px] md:text-[13.5px] xl:text-[14.5px] text-muted-foreground mt-1 leading-snug">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Row 2: help, three equal columns under both. */}
        <dl
          className="mt-12 md:mt-14 pt-8 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-x-10 xl:gap-x-16 gap-y-6 text-[13.5px] md:text-[14px] xl:text-[15px] reveal"
          style={{ animationDelay: "160ms" }}
        >
          {help.map(({ q, a }) => (
            <div key={q}>
              <dt className="font-semibold text-foreground">{q}</dt>
              <dd className="text-muted-foreground leading-relaxed mt-2">{a}</dd>
            </div>
          ))}
          <div>
            <dt className="font-semibold text-foreground">Problems?</dt>
            <dd className="mt-2 flex flex-col gap-2">
              {CONTACTS.map((email) => (
                <a
                  key={email}
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-2 text-foreground hover:text-accent-brand transition-colors"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {email}
                </a>
              ))}
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-foreground hover:text-accent-brand transition-colors"
              >
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                WhatsApp {WHATSAPP}
              </a>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
