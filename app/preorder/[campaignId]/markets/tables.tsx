"use client";

// The Markets and Customers list views of the Markets & Customers page.

import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { Search, ChevronLeft, ChevronRight, Plus, Globe2, Pencil, RefreshCw, Loader2, AlertTriangle, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { MARKET_COLORS, MarketChip, SourceBadge, SubmissionStageBadge } from "@/app/preorder/preorder-badges";
import { flagEmoji } from "@/lib/countries-client";
import type { CustomerRow } from "@/lib/preorder-customers";
import { COMMERCIAL_CONFIG_KEYS, type PreorderMarket, type SubmissionStage } from "@/types/preorder";
import type { MapCountryStat } from "./country-map";

const th = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9";

function overrideSummary(config: PreorderMarket["config"]): string[] {
  const out: string[] = [];
  for (const k of COMMERCIAL_CONFIG_KEYS) {
    if (config[k] === undefined) continue;
    if (k === "partnerPricelist") out.push(`price list: ${config.partnerPricelist ?? "sheet"}`);
    else if (k === "currency") out.push(`currency ${config.currency}`);
    else if (k === "deadline") out.push("deadline");
    else if (k === "note") out.push("note");
    else if (k === "minOrderAmount") out.push(config.minOrderAmount ? `min. order ${config.minOrderAmount}` : "no minimum");
    else if (k === "hiddenIds") out.push(`${config.hiddenIds!.length} hidden`);
    else if (k === "exposedIds") out.push(`${config.exposedIds!.length} exposed`);
    else if (k === "tiersByTab") out.push(`tiers on ${config.tiersByTab!.length} tab${config.tiersByTab!.length === 1 ? "" : "s"}`);
  }
  return out;
}

export function MarketsTable({
  markets,
  stats,
  countryNames,
  onEdit,
  onCreate,
}: {
  markets: PreorderMarket[];
  stats: Record<string, MapCountryStat>;
  countryNames: Record<string, string>;
  onEdit: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <span className="text-[13px] font-semibold text-foreground">Markets</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{markets.length}</span>
        <div className="flex-1" />
        <Button size="sm" className="h-8" onClick={onCreate}><Plus className="w-3.5 h-3.5" /> New market</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead className={cn(th, "pl-5")}>Market</TableHead>
            <TableHead className={th}>Countries</TableHead>
            <TableHead className={cn(th, "text-right")}>Customers</TableHead>
            <TableHead className={cn(th, "text-right")}>Unlocked</TableHead>
            <TableHead className={th}>Overrides</TableHead>
            <TableHead className="h-9 w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {markets.map((m) => {
            const customers = m.countries.reduce((n, iso) => n + (stats[iso]?.customers ?? 0), 0);
            const unlocked = m.countries.reduce((n, iso) => n + (stats[iso]?.unlocked ?? 0), 0);
            const ov = overrideSummary(m.config);
            return (
              <TableRow key={m.id} className="border-b border-border/60 hover:bg-muted/30 cursor-pointer" onClick={() => onEdit(m.id)}>
                <TableCell className="pl-5 py-2.5"><MarketChip name={m.name} color={m.color} /></TableCell>
                <TableCell className="py-2.5">
                  <div className="flex flex-wrap gap-1 max-w-[28rem]">
                    {m.countries.length === 0 && <span className="text-[11px] text-muted-foreground">no countries yet</span>}
                    {m.countries.map((iso) => (
                      <span key={iso} className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-px text-[11px]" title={countryNames[iso] ?? iso}>
                        {flagEmoji(iso)} {iso}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-[12px]">{customers}</TableCell>
                <TableCell className="text-right tabular-nums text-[12px]">{unlocked}</TableCell>
                <TableCell className="text-[11px] text-muted-foreground">{ov.length ? ov.join(" · ") : <span className="italic">inherits campaign defaults</span>}</TableCell>
                <TableCell className="pr-4 text-right"><Pencil className="w-3.5 h-3.5 inline text-muted-foreground" /></TableCell>
              </TableRow>
            );
          })}
          {markets.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-[13px] text-muted-foreground py-14">
                <Globe2 className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
                No markets yet — every customer gets the campaign defaults. Select countries on the map to create one.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

type Filters = { q: string; country: string; market: string; access: "all" | "unlocked" | "not-unlocked"; stage: "all" | "any" | SubmissionStage; override: "all" | "yes" | "no" };

export function CustomersTable({
  campaignId,
  markets,
  countryNames,
  syncing,
  syncInfo,
  onSync,
  onOpen,
  reloadKey,
}: {
  campaignId: string;
  markets: PreorderMarket[];
  countryNames: Record<string, string>;
  syncing: boolean;
  syncInfo: string | null;
  onSync: () => void;
  onOpen: (partnerMkId: string) => void;
  reloadKey: number;
}) {
  const [filters, setFilters] = useState<Filters>({ q: "", country: "", market: "all", access: "all", stage: "all", override: "all" });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 250);
    return () => clearTimeout(t);
  }, [filters.q]);
  useEffect(() => setPage(1), [debouncedQ, filters.country, filters.market, filters.access, filters.stage, filters.override]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (debouncedQ) sp.set("q", debouncedQ);
    if (filters.country) sp.set("country", filters.country);
    if (filters.market !== "all") sp.set("market", filters.market);
    if (filters.access !== "all") sp.set("access", filters.access);
    if (filters.stage !== "all") sp.set("stage", filters.stage);
    if (filters.override !== "all") sp.set("override", filters.override);
    fetch(`/api/admin/preorder/campaigns/${campaignId}/customers?${sp}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setRows(j.items ?? []);
        setTotal(j.total ?? 0);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [campaignId, page, debouncedQ, filters.country, filters.market, filters.access, filters.stage, filters.override, reloadKey]);

  const pages = Math.max(1, Math.ceil(total / 50));
  const countryOptions = useMemo(() => Object.entries(countryNames).sort((a, b) => a[1].localeCompare(b[1])), [countryNames]);

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-foreground">Customers</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{total}</span>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Name, email, city…" className="h-8 w-52 pl-8 text-[12px]" />
        </div>
        <Select value={filters.country || "__all__"} onValueChange={(v) => setFilters({ ...filters, country: v === "__all__" ? "" : v })}>
          <SelectTrigger size="sm" className="h-8 w-40 text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-[12px]">All countries</SelectItem>
            <SelectItem value="none" className="text-[12px]">Country unresolved</SelectItem>
            {countryOptions.map(([iso, name]) => (
              <SelectItem key={iso} value={iso} className="text-[12px]">{flagEmoji(iso)} {name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.market} onValueChange={(v) => setFilters({ ...filters, market: v })}>
          <SelectTrigger size="sm" className="h-8 w-36 text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[12px]">All markets</SelectItem>
            <SelectItem value="none" className="text-[12px]">No market</SelectItem>
            {markets.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-[12px]">{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.access} onValueChange={(v) => setFilters({ ...filters, access: v as Filters["access"] })}>
          <SelectTrigger size="sm" className="h-8 w-36 text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[12px]">Any access</SelectItem>
            <SelectItem value="unlocked" className="text-[12px]">Unlocked</SelectItem>
            <SelectItem value="not-unlocked" className="text-[12px]">Not unlocked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.stage} onValueChange={(v) => setFilters({ ...filters, stage: v as Filters["stage"] })}>
          <SelectTrigger size="sm" className="h-8 w-40 text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[12px]">Any preorder state</SelectItem>
            <SelectItem value="any" className="text-[12px]">Has a preorder</SelectItem>
            <SelectItem value="draft" className="text-[12px]">Draft</SelectItem>
            <SelectItem value="submitted" className="text-[12px]">Submitted</SelectItem>
            <SelectItem value="registered" className="text-[12px]">Registered</SelectItem>
            <SelectItem value="registration-failed" className="text-[12px]">Registration failed</SelectItem>
            <SelectItem value="published" className="text-[12px]">Published</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.override} onValueChange={(v) => setFilters({ ...filters, override: v as Filters["override"] })}>
          <SelectTrigger size="sm" className="h-8 w-36 text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[12px]">Any overrides</SelectItem>
            <SelectItem value="yes" className="text-[12px]">With overrides</SelectItem>
            <SelectItem value="no" className="text-[12px]">Without overrides</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {syncInfo && <span className="text-[11px] text-muted-foreground hidden lg:inline">{syncInfo}</span>}
        <Button size="sm" variant="outline" className="h-8" onClick={onSync} disabled={syncing}>
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sync from Metakocka
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead className={cn(th, "pl-5")}>Customer</TableHead>
            <TableHead className={th}>Country</TableHead>
            <TableHead className={th}>Market</TableHead>
            <TableHead className={th}>Access</TableHead>
            <TableHead className={th}>Overrides</TableHead>
            <TableHead className={th}>Preorder</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && rows.length === 0
            ? Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-b border-border/60">
                  <TableCell className="pl-5 py-2.5">
                    <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-40" delay={stagger(i, 50)} />
                    <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-48" delay={stagger(i, 50, 20)} />
                  </TableCell>
                  <TableCell><SkeletonLine lh="h-[18px]" w="w-20" delay={stagger(i, 50, 30)} /></TableCell>
                  <TableCell><Skeleton className="h-[20.5px] w-20 rounded-full" delay={stagger(i, 50, 40)} /></TableCell>
                  <TableCell><SkeletonLine lh="h-[18px]" w="w-16" delay={stagger(i, 50, 50)} /></TableCell>
                  <TableCell><SkeletonLine lh="h-[18px]" w="w-24" delay={stagger(i, 50, 60)} /></TableCell>
                  <TableCell><Skeleton className="h-[20.5px] w-20 rounded-full" delay={stagger(i, 50, 70)} /></TableCell>
                </TableRow>
              ))
            : rows.map((c) => (
                <TableRow key={c.partnerMkId} className="border-b border-border/60 hover:bg-muted/30 cursor-pointer" onClick={() => onOpen(c.partnerMkId)}>
                  <TableCell className="pl-5 py-2.5">
                    <div className="text-[13px] font-medium text-foreground truncate max-w-[22rem] flex items-center gap-1.5">
                      {c.name}
                      {c.manualGeo && <MapPin className="w-3 h-3 text-lime-600 shrink-0" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate max-w-[22rem]">{[c.city, c.email].filter(Boolean).join(" · ") || c.countCode || c.partnerMkId}</div>
                  </TableCell>
                  <TableCell className="text-[12px] whitespace-nowrap">
                    {c.countryIso ? (
                      <span>{flagEmoji(c.countryIso)} {c.countryName}{c.countrySource === "manual" ? <span className="text-[10px] text-muted-foreground"> · manual</span> : null}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="w-3 h-3" /> unresolved</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.market ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MarketChip name={c.market.name} color={c.market.color} />
                        {c.market.source === "manual" && <span className="text-[10px] text-muted-foreground">manual</span>}
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[12px]">{c.access ? <span className="text-lime-700 dark:text-lime-400 font-medium">Unlocked</span> : <span className="text-muted-foreground">Not unlocked</span>}</TableCell>
                  <TableCell className="text-[11px]">
                    {c.hasRule ? (
                      <span className="inline-flex flex-wrap gap-1">
                        {c.overrides.pricing && <SourceBadge source="customer" label="pricing" />}
                        {c.overrides.assortment && <SourceBadge source="customer" label="assortment" />}
                        {c.overrides.tiers && <SourceBadge source="customer" label="discounts" />}
                        {c.overrides.commercial && <SourceBadge source="customer" label="terms" />}
                        {!c.overrides.pricing && !c.overrides.assortment && !c.overrides.tiers && !c.overrides.commercial && <SourceBadge source="customer" label="placement" />}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">inherits</span>
                    )}
                  </TableCell>
                  <TableCell>{c.stage ? <SubmissionStageBadge stage={c.stage} /> : <span className="text-[12px] text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
          {!loading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-[13px] text-muted-foreground py-14">
                {total === 0 && !filters.q && !filters.country && filters.market === "all" ? (
                  <>
                    <RefreshCw className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
                    The customer directory is empty. Sync it from Metakocka to see every partner here and on the map.
                  </>
                ) : (
                  "No customers match these filters."
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {pages > 1 && (
        <div className="px-4 py-2 border-t border-border flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
          <Button size="icon-xs" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="w-3.5 h-3.5" /></Button>
          Page {page} of {pages}
          <Button size="icon-xs" variant="ghost" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}><ChevronRight className="w-3.5 h-3.5" /></Button>
        </div>
      )}
    </div>
  );
}

// Colour swatch legend used on the map.
export function MarketLegend({ markets, stats, onOpen, className }: { markets: PreorderMarket[]; stats: Record<string, MapCountryStat>; onOpen: (id: string) => void; className?: string }) {
  if (markets.length === 0) return null;
  return (
    <div className={cn("rounded-lg border border-border bg-background/90 backdrop-blur-sm shadow-sm p-2 space-y-1", className)}>
      {markets.map((m) => {
        const n = m.countries.reduce((a, iso) => a + (stats[iso]?.customers ?? 0), 0);
        return (
          <button key={m.id} type="button" onClick={() => onOpen(m.id)} className="w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] hover:bg-muted text-left">
            <span className="size-2.5 rounded-full shrink-0" style={{ background: MARKET_COLORS[m.color].hex }} />
            <span className="font-medium text-foreground truncate">{m.name}</span>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{m.countries.length} · {n}</span>
          </button>
        );
      })}
    </div>
  );
}
