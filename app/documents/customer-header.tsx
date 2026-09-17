"use client";
import { Building2, Mail, Phone, ReceiptText, MapPin, User } from "lucide-react";
import CustomerSelect from "./customer-select";
import { ViewAsCustomerButton } from "@/components/view-as-customer-button";
import type { MkPartner } from "@/types/documents";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";

// Standard admin page header (compact bar, title top-left, no icon — matching
// Catalogue Sync / Section Builder) with the customer selector as the top-right
// action.
export default function CustomerHeader({
  title,
  customer,
  onSelect,
}: {
  title: string;
  customer: MkPartner | null;
  onSelect: (partner: MkPartner) => void;
}) {
  return (
    <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="h-14 flex items-center justify-between gap-3 px-4 md:px-8">
        <h1 className="font-display text-lg font-medium tracking-tight text-foreground truncate">{title}</h1>
        <div className="shrink-0 flex items-center gap-2">
          {customer && <ViewAsCustomerButton partnerMkId={customer.mkId} to="/portal/invoices" />}
          <CustomerSelect
            current={customer ? { mkId: customer.mkId, name: customer.name } : null}
            onSelect={onSelect}
          />
        </div>
      </div>
    </header>
  );
}

// Compact customer summary shown at the top of the list content — the selected
// customer's name and key contact details.
export function CustomerInfoStrip({ customer }: { customer: MkPartner }) {
  const addressLine = customer.address
    ? [
        customer.address.street,
        [customer.address.postNumber, customer.address.city].filter(Boolean).join(" "),
        customer.address.country,
      ]
        .filter(Boolean)
        .join(", ")
    : customer.city || "";

  const business = !!customer.businessEntity || !!customer.taxId;
  const initials = (() => {
    const parts = customer.name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
  })();
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3 flex items-start gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background font-display text-[13px] font-semibold tracking-tight shrink-0">
        {initials}
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-foreground truncate">
          {customer.name}
          <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground align-middle">
            {business ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {business ? "Company" : "Individual"}
            {customer.countCode && <span className="font-mono text-[10px] text-muted-foreground/70">· {customer.countCode}</span>}
          </span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          {customer.emails?.[0] && (
            <a
              href={`mailto:${customer.emails[0]}`}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" /> {customer.emails[0]}
            </a>
          )}
          {customer.phone && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 shrink-0" /> {customer.phone}
            </span>
          )}
          {customer.taxId && (
            <span className="inline-flex items-center gap-1.5">
              <ReceiptText className="h-3.5 w-3.5 shrink-0" /> {customer.taxId}
            </span>
          )}
          {addressLine && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" /> {addressLine}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Twin of CustomerInfoStrip: icon tile + name + a row of contact details. */
export function CustomerInfoStripSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3 flex items-start gap-3">
      <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
      <div className="min-w-0">
        {/* text-[14px] → 21px; details row text-[12px] → 18px */}
        <SkeletonLine lh="h-[21px]" h="h-3.5" w="w-48" />
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          {[
            { icon: Mail, w: "w-36" },
            { icon: Phone, w: "w-24" },
            { icon: ReceiptText, w: "w-20" },
            { icon: MapPin, w: "w-44" },
          ].map(({ icon: Icon, w }, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SkeletonLine lh="h-[18px]" w={w} delay={stagger(i, 40, 40)} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
