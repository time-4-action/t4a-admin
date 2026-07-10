"use client";
import { useEffect, useRef, useState } from "react";
import { Search, ChevronsUpDown, Building2, Check } from "lucide-react";
import type { MkPartner } from "@/types/documents";

// Top-right customer switcher on the admin document pages. Shows the current
// customer and lets an admin search and switch to any other. Controlled: the
// parent owns the selected customer and its persistence (localStorage), so the
// choice sticks across the Invoices / Offers / Orders pages and reloads.
// Admin-only surface (these pages are gated to the `documents` section).
export default function CustomerSelect({
  current,
  onSelect,
}: {
  current: { mkId: string; name: string } | null;
  onSelect: (partner: MkPartner) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [partners, setPartners] = useState<MkPartner[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const query = q.trim();
    const t = setTimeout(
      () => {
        fetch(`/api/admin/documents/partners?q=${encodeURIComponent(query)}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((b) => {
            if (!cancelled) setPartners(Array.isArray(b.partners) ? b.partners : []);
          })
          .catch(() => {
            if (!cancelled) setPartners([]);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      query ? 300 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open]);

  const pick = (p: MkPartner) => {
    setOpen(false);
    if (p.mkId !== current?.mkId) onSelect(p);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 transition-colors max-w-[260px]"
      >
        <Building2 className="h-4 w-4 text-teal-500 shrink-0" />
        <span className="truncate">{current ? current.name : "Select customer"}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[85vw] rounded-2xl border border-border bg-surface shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-border/60">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search customer…"
                className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {loading && <p className="px-3 py-3 text-[12px] text-muted-foreground">Searching…</p>}
            {!loading && partners.length === 0 && (
              <p className="px-3 py-3 text-[12px] text-muted-foreground">No customers found.</p>
            )}
            {!loading &&
              partners.map((p) => (
                <button
                  key={p.mkId}
                  type="button"
                  onClick={() => pick(p)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted shrink-0">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[p.emails[0], p.taxId].filter(Boolean).join(" · ") || p.countCode}
                    </p>
                  </div>
                  {p.mkId === current?.mkId && <Check className="h-4 w-4 text-teal-500 shrink-0" />}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
