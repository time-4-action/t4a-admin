import { Building2, Mail, Phone, User } from "lucide-react";
import type { MkContact, MkPartner } from "@/types/documents";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { AddressList, ContactList } from "./profile-lists";

// Full customer profile — a shared, presentational card view used by both the
// admin Documents "Customer" page and the customer's own portal "Account" page.
// No client hooks, so it renders in either a server or client component. Built to
// stay balanced for customers with many contacts/addresses (dense rows, count
// badges, scroll-capped lists, masonry columns).

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function CustomerProfile({ customer }: { customer: MkPartner }) {
  const c = customer;

  // Dedupe contacts, drop empty ones.
  const seen = new Set<string>();
  const source: MkContact[] = c.contacts?.length
    ? c.contacts
    : c.emails.map((e) => ({ email: e, phone: c.phone }));
  const contacts = source.filter((ct) => {
    if (!ct.email && !ct.phone) return false;
    const k = `${ct.email ?? ""}|${ct.phone ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const primaryEmail = contacts.find((ct) => ct.email)?.email ?? c.emails[0];
  const primaryPhone = contacts.find((ct) => ct.phone)?.phone ?? c.phone;
  const addresses = c.addresses ?? [];
  const business = !!c.businessEntity || !!c.taxId;

  const details: { label: string; value?: string | null }[] = [
    { label: "Customer code", value: c.countCode },
    { label: "VAT / tax number", value: c.taxId },
    { label: "Payment terms", value: c.paymentDueDays ? `${c.paymentDueDays} days` : undefined },
    { label: "Currency", value: c.currency },
    { label: "Language", value: c.language },
  ].filter((d) => !!d.value);

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* Identity band */}
      <div className="relative px-5 py-6 md:px-8 md:py-8 bg-gradient-to-br from-muted/70 via-surface to-surface">
        <div className="flex items-start gap-5">
          <span className="flex h-16 w-16 md:h-20 md:w-20 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background font-display text-2xl md:text-3xl font-semibold tracking-tight shadow-sm">
            {initials(c.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-foreground tracking-tight leading-tight break-words">{c.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                {business ? <Building2 className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                {business ? "Company" : "Individual"}
                {c.countCode && <span className="font-mono text-[11px] text-muted-foreground/70">· {c.countCode}</span>}
              </span>
              {primaryEmail && (
                <a href={`mailto:${primaryEmail}`} className="inline-flex items-center gap-1.5 text-foreground hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {primaryEmail}
                </a>
              )}
              {primaryPhone && (
                <a href={`tel:${primaryPhone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-foreground hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {primaryPhone}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Three quiet columns: details · addresses · people */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/60 border-t border-border/60">
        <section className="p-5">
          <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">Account</h3>
          {details.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No further details on file.</p>
          ) : (
            <dl className="space-y-2.5">
              {details.map((d) => (
                <div key={d.label}>
                  <dt className="text-[11px] text-muted-foreground">{d.label}</dt>
                  <dd className="text-[13px] font-medium text-foreground break-words">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="p-5">
          <AddressList addresses={addresses} />
        </section>

        <section className="p-5">
          <ContactList contacts={contacts} />
        </section>
      </div>

      <div className="px-5 py-2.5 border-t border-border/60 bg-muted/20 text-[11px] text-muted-foreground">
        These details come from our records. If something is wrong or has changed, contact us and we will update them.
      </div>
    </div>
  );
}

// Twin of the profile above: identity band, then the three columns.
export function CustomerProfileSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-6 md:px-8 md:py-8 bg-gradient-to-br from-muted/70 via-surface to-surface flex items-start gap-5">
        <Skeleton className="h-16 w-16 md:h-20 md:w-20 rounded-2xl shrink-0" />
        <div className="min-w-0 flex-1">
          <SkeletonLine lh="h-[30px] md:h-[36px]" h="h-6 md:h-7" w="w-64" delay={20} />
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <SkeletonLine lh="h-[20px]" w="w-24" delay={40} />
            <SkeletonLine lh="h-[20px]" w="w-44" delay={60} />
            <SkeletonLine lh="h-[20px]" w="w-28" delay={80} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/60 border-t border-border/60">
        {/* Account: label / value pairs */}
        <section className="p-5">
          <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">Account</h3>
          <div className="space-y-2.5">
            {["w-36", "w-28", "w-16", "w-12"].map((w, i) => (
              <div key={i}>
                <SkeletonLine lh="h-[16px]" h="h-2.5" w="w-20" delay={stagger(i, 50)} />
                <SkeletonLine lh="h-[19.5px]" h="h-3.5" w={w} delay={stagger(i, 50, 20)} />
              </div>
            ))}
          </div>
        </section>
        {/* Addresses: pin + kind + three lines */}
        <section className="p-5">
          <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">Addresses</h3>
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Skeleton className="h-3.5 w-3.5 mt-[3px] rounded-full shrink-0" delay={stagger(i, 60, 200)} />
                <div className="min-w-0 flex-1">
                  <SkeletonLine lh="h-[16px]" h="h-2.5" w="w-12" delay={stagger(i, 60, 200)} />
                  <SkeletonLine lh="h-[18px]" h="h-3.5" w="w-44" delay={stagger(i, 60, 220)} />
                  <SkeletonLine lh="h-[18px]" h="h-3.5" w="w-28" delay={stagger(i, 60, 240)} />
                  <SkeletonLine lh="h-[18px]" h="h-3.5" w="w-20" delay={stagger(i, 60, 260)} />
                </div>
              </div>
            ))}
          </div>
        </section>
        {/* Contacts: email + phone */}
        <section className="p-5">
          <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">Contacts</h3>
          <div className="space-y-2.5">
            {["w-48", "w-40", "w-52"].map((w, i) => (
              <div key={i}>
                <SkeletonLine lh="h-[19.5px]" h="h-3.5" w={w} delay={stagger(i, 60, 400)} />
                <SkeletonLine lh="h-[18px]" h="h-3" w="w-28" delay={stagger(i, 60, 420)} />
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="px-5 py-2.5 border-t border-border/60 bg-muted/20">
        <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-96 max-w-full" delay={600} />
      </div>
    </div>
  );
}
