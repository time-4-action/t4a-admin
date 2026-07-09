"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, FileText, Building2 } from "lucide-react";
import type { MkPartner } from "@/types/documents";

// Admin "Documents" landing: search for a customer (Metakocka partner) to browse
// their offers / orders / invoices.
export default function DocumentsPickerPage() {
  const [q, setQ] = useState("");
  const [partners, setPartners] = useState<MkPartner[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const query = q.trim();
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(
      () => {
        fetch(`/api/admin/documents/partners?q=${encodeURIComponent(query)}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((body) => {
            if (cancelled) return;
            setPartners(Array.isArray(body.partners) ? body.partners : []);
            setSearched(query.length > 0);
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
  }, [q]);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border bg-gradient-to-b from-muted/30 to-transparent">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10">
              <FileText className="h-4.5 w-4.5 text-teal-500" />
            </span>
            <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight leading-none">
              Customer Documents
            </h1>
          </div>
          <p className="text-[13px] text-muted-foreground mt-2">
            Search a customer to view their offers, orders and invoices.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email or tax number…"
              className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="mt-4">
            {loading && (
              <div className="divide-y divide-border/50 rounded-2xl border border-border bg-surface overflow-hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3.5" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="skeleton h-8 w-8 rounded-lg" />
                    <div className="skeleton h-4 w-40 rounded" />
                  </div>
                ))}
              </div>
            )}

            {!loading && searched && partners.length === 0 && (
              <p className="text-center text-[13px] text-muted-foreground py-10">No customers found.</p>
            )}

            {!loading && partners.length > 0 && (
              <div className="divide-y divide-border/50 rounded-2xl border border-border bg-surface overflow-hidden">
                {partners.map((p) => (
                  <Link
                    key={p.mkId}
                    href={`/documents/${encodeURIComponent(p.mkId)}`}
                    className="group flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground truncate group-hover:underline">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {[p.emails[0], p.taxId, p.city].filter(Boolean).join(" · ") || p.countCode}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
