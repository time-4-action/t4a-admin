import { Building2, Mail, Phone, MapPin, ReceiptText, User } from "lucide-react";
import type { MkAddress, MkContact, MkPartner } from "@/types/documents";

// Full customer profile — a shared, presentational card view used by both the
// admin Documents "Customer" page and the customer's own portal "Account" page.
// No client hooks, so it renders in either a server or client component. Built to
// stay balanced for customers with many contacts/addresses (dense rows, count
// badges, scroll-capped lists, masonry columns).

function addrLine(a: MkAddress): string {
  return [a.street, [a.postNumber, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ");
}

function Card({
  title,
  icon: Icon,
  count,
  bodyClass = "p-4",
  children,
}: {
  title: string;
  icon: React.ElementType;
  count?: number;
  bodyClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60 bg-muted/25">
        <Icon className="h-3.5 w-3.5 text-teal-500" />
        <span className="text-[12px] font-semibold text-foreground">{title}</span>
        {count != null && count > 0 && (
          <span className="ml-auto text-[11px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-[12px] text-muted-foreground shrink-0">{label}</span>
      <span className="text-[13px] font-medium text-foreground text-right break-words">{value}</span>
    </div>
  );
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

  const addresses = c.addresses ?? [];

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-2xl border border-border bg-surface px-5 py-4 flex items-start gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10 shrink-0">
          <Building2 className="h-6 w-6 text-teal-500" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl md:text-2xl font-semibold text-foreground tracking-tight leading-tight break-words">
            {c.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {c.businessEntity ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
              {c.businessEntity ? "Business" : "Individual"}
            </span>
            {c.taxId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <ReceiptText className="h-3 w-3" /> {c.taxId}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Masonry columns keep things balanced when one list is much longer. */}
      <div className="columns-1 md:columns-2 gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {/* Details */}
        <Card title="Details" icon={ReceiptText}>
          <Field label="Customer code" value={c.countCode} />
          <Field label="Tax number" value={c.taxId} />
          <Field label="Type" value={c.businessEntity ? "Business entity" : "Individual"} />
          <Field label="Payment terms" value={c.paymentDueDays ? `${c.paymentDueDays} days` : undefined} />
          <Field label="Currency" value={c.currency} />
          <Field label="Language" value={c.language} />
        </Card>

        {/* Contact */}
        {contacts.length > 0 && (
          <Card
            title="Contact"
            icon={Mail}
            count={contacts.length}
            bodyClass="max-h-[380px] overflow-y-auto divide-y divide-border/40"
          >
            {contacts.map((ct, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2">
                {ct.email ? (
                  <a
                    href={`mailto:${ct.email}`}
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-[12px] text-foreground hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                  >
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{ct.email}</span>
                  </a>
                ) : (
                  <span className="flex-1" />
                )}
                {ct.phone && (
                  <a
                    href={`tel:${ct.phone.replace(/\s/g, "")}`}
                    className="flex items-center gap-1.5 text-[12px] text-muted-foreground shrink-0 hover:text-foreground transition-colors"
                  >
                    <Phone className="h-3 w-3 shrink-0" />
                    {ct.phone}
                  </a>
                )}
              </div>
            ))}
          </Card>
        )}

        {/* Addresses */}
        {addresses.length > 0 && (
          <Card
            title="Addresses"
            icon={MapPin}
            count={addresses.length}
            bodyClass="max-h-[380px] overflow-y-auto divide-y divide-border/40"
          >
            {addresses.map((a, i) => (
              <div key={i} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  {a.type && (
                    <span className="inline-flex items-center rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0">
                      {a.type}
                    </span>
                  )}
                  <span className="text-[13px] text-foreground min-w-0">{addrLine(a) || "—"}</span>
                </div>
                {(a.paymentDueDays || a.currency || a.language) && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {a.paymentDueDays && <span>{a.paymentDueDays}-day terms</span>}
                    {a.currency && <span>{a.currency}</span>}
                    {a.language && <span>{a.language}</span>}
                  </div>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
