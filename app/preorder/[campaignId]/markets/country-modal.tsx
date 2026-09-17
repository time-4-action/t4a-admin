"use client";

// One country, opened big like a market or a customer: its market (assign / move),
// the customer counts, and a searchable, filterable list of its customers that loads
// more as you scroll — click one to open the customer editor.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Check, Search, X, Building2, User, Users, Unlock, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditorModal, EditorModalBody, EditorModalHeader } from "@/components/ui/editor-modal";
import { SkeletonLine, stagger } from "@/components/ui/skeleton";
import { MarketChip, SubmissionStageBadge } from "@/app/preorder/preorder-badges";
import { Flag } from "@/components/flag";
import { cn } from "@/lib/utils";
import type { CustomerRow, CountryGeo } from "@/lib/preorder-customers";
import type { CustomerKind } from "@/lib/mk-customers";
import type { PreorderMarket } from "@/types/preorder";
import { CustomerKindBadge } from "./tables";

const PAGE = 100;

export function CountryModal({
  open,
  onOpenChange,
  campaignId,
  iso,
  name,
  markets,
  stat,
  onAssign,
  onOpenCustomer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaignId: string;
  iso: string | null;
  name: string;
  markets: PreorderMarket[];
  stat: CountryGeo | undefined;
  onAssign: (marketId: string | null) => Promise<void>;
  onOpenCustomer: (partnerMkId: string) => void;
}) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<CustomerKind | "all">("all");
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const market = markets.find((m) => iso && m.countries.includes(iso)) ?? null;
  // Only the newest request may write the list (typing fast, switching filters).
  const reqSeq = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    async (page: number) => {
      if (!iso) return null;
      const sp = new URLSearchParams({ country: iso, page: String(page), pageSize: String(PAGE) });
      if (q.trim()) sp.set("q", q.trim());
      if (kind !== "all") sp.set("kind", kind);
      const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}/customers?${sp}`, { cache: "no-store" });
      const j = (await r.json()) as { items?: CustomerRow[]; total?: number };
      return { items: j.items ?? [], total: j.total ?? 0 };
    },
    [campaignId, iso, q, kind],
  );

  // First page whenever the country / search / kind changes.
  useEffect(() => {
    if (!open || !iso) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    fetchPage(1)
      .then((res) => {
        if (!res || seq !== reqSeq.current) return;
        setRows(res.items);
        setTotal(res.total);
      })
      .finally(() => seq === reqSeq.current && setLoading(false));
  }, [open, iso, fetchPage]);

  useEffect(() => {
    setQ("");
    setKind("all");
  }, [iso]);

  // Load the next page when the end of the list scrolls into view.
  const hasMore = rows.length < total;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      const seq = reqSeq.current;
      const next = Math.floor(rows.length / PAGE) + 1;
      setLoading(true);
      fetchPage(next)
        .then((res) => {
          if (!res || seq !== reqSeq.current) return;
          setRows((prev) => {
            const seen = new Set(prev.map((c) => c.partnerMkId));
            return [...prev, ...res.items.filter((c) => !seen.has(c.partnerMkId))];
          });
          setTotal(res.total);
        })
        .finally(() => seq === reqSeq.current && setLoading(false));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, rows.length, fetchPage]);

  return (
    <EditorModal open={open} onOpenChange={onOpenChange} sizeClassName="w-[min(1000px,calc(100vw-2rem))] h-[min(800px,calc(100vh-2rem))]">
      <EditorModalHeader
        leading={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Flag iso={iso} className="text-[22px]" />
          </span>
        }
        title={name}
        description={
          stat ? (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {stat.customers} customers</span>
              <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" /> {stat.business} companies</span>
              <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {stat.person} individuals</span>
              <span className="inline-flex items-center gap-1"><Unlock className="w-3 h-3" /> {stat.unlocked} unlocked</span>
              <span className="inline-flex items-center gap-1"><Send className="w-3 h-3" /> {stat.submitted} submitted</span>
            </span>
          ) : (
            "No customers in the directory"
          )
        }
        right={
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hidden sm:inline">Market</span>
            <Select
              value={market?.id ?? "__none__"}
              onValueChange={async (v) => {
                setAssigning(true);
                await onAssign(v === "__none__" ? null : v);
                setAssigning(false);
              }}
            >
              <SelectTrigger size="sm" className="h-8 text-[12px] w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-[12px]">No market (campaign defaults)</SelectItem>
                {markets.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-[12px]">{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assigning ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : market ? <Check className="w-4 h-4 text-lime-600" /> : null}
          </div>
        }
      >
        {market && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            In market <MarketChip name={market.name} color={market.color} />
            <span>— every customer here inherits its prices, terms, discounts and assortment unless their own rule says otherwise.</span>
          </div>
        )}
      </EditorModalHeader>

      <EditorModalBody className="flex flex-col overflow-hidden">
        <div className="shrink-0 flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border/60 bg-muted/30">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, city, VAT id…" className="h-8 pl-8 text-[12px]" />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center rounded-lg bg-muted p-0.5 gap-0.5">
            {(
              [
                ["all", `All${stat ? ` (${stat.customers})` : ""}`],
                ["business", `Companies${stat ? ` (${stat.business})` : ""}`],
                ["person", `Individuals${stat ? ` (${stat.person})` : ""}`],
              ] as [CustomerKind | "all", string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors",
                  kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {total} customer{total === 1 ? "" : "s"}
          </span>
        </div>

        <div className="hidden md:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_120px_110px_140px] gap-3 px-6 py-2 border-b border-border/60 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          <span>Customer</span>
          <span>Contact</span>
          <span>Type</span>
          <span>Config</span>
          <span>Preorder</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/50">
          {loading && rows.length === 0 ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_120px_110px_140px] gap-3 items-center px-6 py-2.5">
                <SkeletonLine lh="h-[18px]" w="w-40" delay={stagger(i, 50)} />
                <SkeletonLine lh="h-[18px]" w="w-48" delay={stagger(i, 50, 20)} />
                <SkeletonLine lh="h-[18px]" w="w-20" delay={stagger(i, 50, 40)} />
                <SkeletonLine lh="h-[18px]" w="w-14" delay={stagger(i, 50, 60)} />
                <SkeletonLine lh="h-[18px]" w="w-20" delay={stagger(i, 50, 80)} />
              </div>
            ))
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-[12px] text-muted-foreground">
              {q || kind !== "all" ? "No customer matches." : "No customers in the directory for this country."}
            </div>
          ) : (
            rows.map((c) => (
              <button
                key={c.partnerMkId}
                type="button"
                onClick={() => onOpenCustomer(c.partnerMkId)}
                className="w-full text-left grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_120px_110px_140px] gap-x-3 gap-y-1 items-center px-6 py-2 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground truncate">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{[c.city, c.countCode].filter(Boolean).join(" · ") || c.partnerMkId}</div>
                </div>
                <div className="text-[12px] text-muted-foreground truncate">{c.email ?? (c.taxId ? `VAT ${c.taxId}` : "—")}</div>
                <div><CustomerKindBadge kind={c.kind} compact /></div>
                <div>
                  {c.hasRule ? (
                    <span className="rounded-full bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300 px-1.5 py-px text-[10px] font-medium">override</span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">inherits</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {c.stage ? <SubmissionStageBadge stage={c.stage} dot={false} /> : c.access ? <span className="text-[11px] text-muted-foreground">unlocked</span> : <span className="text-[11px] text-muted-foreground/60">—</span>}
                </div>
              </button>
            ))
          )}
          {rows.length > 0 && (
            <div ref={sentinelRef} className="px-6 py-3 text-center text-[11px] text-muted-foreground">
              {loading ? (
                <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading more…</span>
              ) : hasMore ? (
                `Showing ${rows.length} of ${total} — scroll for more`
              ) : (
                `All ${total} shown`
              )}
            </div>
          )}
        </div>
      </EditorModalBody>
    </EditorModal>
  );
}
