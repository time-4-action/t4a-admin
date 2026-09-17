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

// The public face of the B2B portal — what a logged-out visitor sees at /portal
// (and at the bare domain). Kept deliberately basic: what is inside, which email
// to sign in with, and how the first sign-in works. Nothing from the system and
// no mention of the admin side.

const BRAND = "Time 4 Action B2B";
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

export function PortalLanding({ returnTo }: { returnTo?: string }) {
  const target = sanitizeReturnTo(returnTo) ?? "/portal";
  const loginHref = `/auth/login?returnTo=${encodeURIComponent(target)}`;
  // Extra query params on /auth/login are forwarded to Auth0 as authorization
  // params; screen_hint=signup opens Universal Login on the sign-up tab.
  const signupHref = `${loginHref}&screen_hint=signup`;

  return (
    <div className="min-h-full flex items-center">
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 py-8 md:py-16">
        {/* Row 1: headline + actions beside the card, vertically centred on each other. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-x-16 gap-y-10 items-center">
          <div>
            {/* Brand: logo and name stacked into the same left edge as the headline. */}
            <div className="flex items-center gap-3 reveal">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/favicon.ico" alt="Patrik" className="h-14 w-14 md:h-16 md:w-16 object-contain shrink-0 -ml-1.5" />
              <div>
                <p className="text-[15px] font-semibold text-foreground leading-tight">{BRAND}</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">Customer portal for Patrik dealers and partners</p>
              </div>
            </div>
            <h1
              className="font-display text-[28px] md:text-[38px] font-semibold text-foreground tracking-tight leading-[1.1] mt-8 reveal"
              style={{ animationDelay: "40ms" }}
            >
              Your orders and invoices, in one place.
            </h1>
            <p
              className="text-[14px] md:text-[15px] text-muted-foreground mt-4 leading-relaxed max-w-md reveal"
              style={{ animationDelay: "80ms" }}
            >
              Everything between your company and Time 4 Action, read straight from our order system — no waiting
              for an email.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md reveal" style={{ animationDelay: "120ms" }}>
              <a
                href={loginHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-brand text-accent-brand-foreground h-12 px-6 text-[15px] font-semibold shadow-sm hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Log in
                <ArrowRight className="h-[18px] w-[18px]" />
              </a>
              <a
                href={signupHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground text-background h-12 px-6 text-[15px] font-semibold shadow-sm hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <UserPlus className="h-[18px] w-[18px]" />
                Create account
              </a>
            </div>
          </div>

          <section
            aria-labelledby="inside"
            className="rounded-2xl border border-border bg-surface shadow-sm reveal"
            style={{ animationDelay: "120ms" }}
          >
            <h2 id="inside" className="px-4 md:px-5 pt-4 pb-3 text-[13px] font-semibold text-foreground border-b border-border">
              What you&rsquo;ll find inside
            </h2>
            <ul className="divide-y divide-border">
              {items.map(({ icon: Icon, label, desc }) => (
                <li key={label} className="flex items-start gap-3 md:gap-3.5 px-4 md:px-5 py-3.5">
                  <span className="h-9 w-9 rounded-lg bg-accent-brand/10 text-accent-brand flex items-center justify-center shrink-0">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[13.5px] font-semibold text-foreground leading-tight">{label}</p>
                    <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Row 2: help, three equal columns under both. */}
        <dl
          className="mt-10 md:mt-14 pt-8 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-x-10 gap-y-5 text-[13px] reveal"
          style={{ animationDelay: "160ms" }}
        >
          {help.map(({ q, a }) => (
            <div key={q}>
              <dt className="font-semibold text-foreground">{q}</dt>
              <dd className="text-muted-foreground leading-relaxed mt-1.5">{a}</dd>
            </div>
          ))}
          <div>
            <dt className="font-semibold text-foreground">Problems?</dt>
            <dd className="mt-1.5 flex flex-col gap-1.5">
              {CONTACTS.map((email) => (
                <a
                  key={email}
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1.5 text-foreground hover:text-accent-brand transition-colors"
                >
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  {email}
                </a>
              ))}
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-foreground hover:text-accent-brand transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                WhatsApp {WHATSAPP}
              </a>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
