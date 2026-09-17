"use client";

import { useMemo, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import type { MkAddress, MkContact } from "@/types/documents";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// A customer can carry dozens of addresses / contacts (every delivery point they
// ever used). The profile column shows the first few; the rest open in a
// searchable modal instead of stretching the page.
const PREVIEW = 5;

function addrLine(a: MkAddress): string {
  return [a.street, [a.postNumber, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ");
}

// MK address types come as Slovene register labels; show them as what they are.
export function addressKind(t?: string | null): string {
  const k = (t ?? "").trim().toLowerCase();
  if (!k) return "Address";
  if (k.startsWith("rač") || k.startsWith("rac") || k.includes("bill") || k.includes("invoice")) return "Billing";
  if (k.startsWith("dob") || k.includes("deliv") || k.includes("ship")) return "Delivery";
  return t!;
}

function AddressItem({ a }: { a: MkAddress }) {
  return (
    <li className="flex items-start gap-2.5">
      <MapPin className="h-3.5 w-3.5 mt-[3px] text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{addressKind(a.type)}</div>
        <div className="text-[13px] text-foreground leading-snug">
          {a.street && <div>{a.street}</div>}
          <div>{[a.postNumber, a.city].filter(Boolean).join(" ")}</div>
          {a.country && <div>{a.country}</div>}
          {!addrLine(a) && <div>—</div>}
        </div>
      </div>
    </li>
  );
}

function ContactItem({ ct }: { ct: MkContact }) {
  return (
    <li className="min-w-0">
      {ct.email && (
        <a href={`mailto:${ct.email}`} className="block text-[13px] text-foreground truncate hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
          {ct.email}
        </a>
      )}
      {ct.phone && (
        <a href={`tel:${ct.phone.replace(/\s/g, "")}`} className="block text-[12px] text-muted-foreground hover:text-foreground transition-colors">
          {ct.phone}
        </a>
      )}
    </li>
  );
}

function OverflowList<T>({
  title,
  items,
  empty,
  render,
  searchText,
  spacing,
}: {
  title: string;
  items: T[];
  empty: string;
  render: (item: T, i: number) => React.ReactNode;
  searchText: (item: T) => string;
  spacing: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () => (needle ? items.filter((it) => searchText(it).toLowerCase().includes(needle)) : items),
    [items, needle, searchText],
  );
  const overflow = items.length > PREVIEW;
  const shown = overflow ? items.slice(0, PREVIEW) : items;

  return (
    <>
      <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">
        {title}
        {items.length > 1 && <span className="ml-1.5 font-normal tabular-nums text-muted-foreground/70">{items.length}</span>}
      </h3>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className={spacing}>{shown.map(render)}</ul>
      )}
      {overflow && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 text-[12px] font-medium text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground transition-colors"
        >
          Show all {items.length}
        </button>
      )}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-[15px]">{title} <span className="font-normal text-muted-foreground tabular-nums">{items.length}</span></DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${title.toLowerCase()}…`}
                className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-[13px] focus:border-ring focus:outline-none"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto border-t border-border/60 px-5 py-4">
            {filtered.length === 0 ? (
              <p className="text-[12px] text-muted-foreground py-6 text-center">Nothing matches your search.</p>
            ) : (
              <ul className={spacing}>{filtered.map(render)}</ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AddressList({ addresses }: { addresses: MkAddress[] }) {
  return (
    <OverflowList
      title="Addresses"
      items={addresses}
      empty="No address on file."
      spacing="space-y-3"
      render={(a, i) => <AddressItem key={i} a={a} />}
      searchText={(a) => `${addressKind(a.type)} ${addrLine(a)}`}
    />
  );
}

export function ContactList({ contacts }: { contacts: MkContact[] }) {
  return (
    <OverflowList
      title="Contacts"
      items={contacts}
      empty="No contact on file."
      spacing="space-y-2.5"
      render={(ct, i) => <ContactItem key={i} ct={ct} />}
      searchText={(ct) => `${ct.email ?? ""} ${ct.phone ?? ""}`}
    />
  );
}
