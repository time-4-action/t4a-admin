"use client";

// One country: its market (assign / move), counts, and a paged list of its customers.

import { useCallback, useEffect, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerBody, DrawerHeader } from "@/components/ui/drawer";
import { SkeletonLine, stagger } from "@/components/ui/skeleton";
import { MarketChip, SubmissionStageBadge } from "@/app/preorder/preorder-badges";
import { Flag } from "@/components/flag";
import type { CustomerRow } from "@/lib/preorder-customers";
import type { PreorderMarket } from "@/types/preorder";
import type { CountryGeo } from "@/lib/preorder-customers";
import { CustomerKindBadge } from "./tables";

export function CountryDrawer({
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
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const market = markets.find((m) => iso && m.countries.includes(iso)) ?? null;

  const load = useCallback(async () => {
    if (!iso) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}/customers?country=${iso}&page=${page}&pageSize=25`, { cache: "no-store" });
      const j = await r.json();
      setRows(j.items ?? []);
      setTotal(j.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [campaignId, iso, page]);

  useEffect(() => {
    setPage(1);
  }, [iso]);
  useEffect(() => {
    if (open && iso) void load();
  }, [open, iso, load]);

  const pages = Math.max(1, Math.ceil(total / 25));

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerHeader
        title={<span className="inline-flex items-center gap-2"><Flag iso={iso} className="text-[16px]" /> {name}</span>}
        description={stat ? `${stat.customers} customers (${stat.business} companies, ${stat.person} individuals) · ${stat.unlocked} unlocked · ${stat.submitted} submitted` : "No customers in the directory"}
      />
      <DrawerBody className="space-y-4">
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Market</div>
          <div className="flex items-center gap-2">
            <Select
              value={market?.id ?? "__none__"}
              onValueChange={async (v) => {
                setAssigning(true);
                await onAssign(v === "__none__" ? null : v);
                setAssigning(false);
              }}
            >
              <SelectTrigger size="sm" className="h-8 text-[12px] flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-[12px]">No market (campaign defaults)</SelectItem>
                {markets.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-[12px]">{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assigning ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : market ? <Check className="w-4 h-4 text-lime-600" /> : null}
          </div>
          {market && <div className="mt-1.5"><MarketChip name={market.name} color={market.color} /></div>}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Customers</div>
            <span className="text-[11px] text-muted-foreground tabular-nums">{total}</span>
            <div className="flex-1" />
            {pages > 1 && (
              <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Button size="icon-xs" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="w-3.5 h-3.5" /></Button>
                {page}/{pages}
                <Button size="icon-xs" variant="ghost" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}><ChevronRight className="w-3.5 h-3.5" /></Button>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
            {loading && rows.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="px-3 py-2">
                    <SkeletonLine lh="h-[18px]" w="w-40" delay={stagger(i, 50)} />
                    <SkeletonLine lh="h-[16px]" h="h-2.5" w="w-24" delay={stagger(i, 50, 20)} />
                  </div>
                ))
              : rows.map((c) => (
                  <button key={c.partnerMkId} type="button" onClick={() => onOpenCustomer(c.partnerMkId)} className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-foreground truncate">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{[c.city, c.email].filter(Boolean).join(" · ") || c.countCode || c.partnerMkId}</div>
                      </div>
                      <CustomerKindBadge kind={c.kind} compact />
                      {c.hasRule && <span className="rounded-full bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300 px-1.5 py-px text-[10px] font-medium">override</span>}
                      {c.stage ? <SubmissionStageBadge stage={c.stage} dot={false} /> : c.access ? <span className="text-[10px] text-muted-foreground">unlocked</span> : null}
                    </div>
                  </button>
                ))}
            {!loading && rows.length === 0 && <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">No customers in the directory for this country.</div>}
          </div>
        </div>
      </DrawerBody>
    </Drawer>
  );
}
