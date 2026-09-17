"use client";

// The list views of the Markets & Customers page: the Customers table, the Markets
// panel, and the Countries table (assign countries to markets — the list-based
// replacement for the old map).

import { Fragment, useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HeaderFilter } from "@/components/ui/header-filter";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { Search, ChevronLeft, ChevronRight, ChevronDown, Plus, Globe2, Pencil, RefreshCw, Loader2, AlertTriangle, Building2, User, X, Layers, Users, GripVertical } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { MARKET_COLORS, MarketChip, SourceBadge, SubmissionStageBadge } from "@/app/preorder/preorder-badges";
import { Flag } from "@/components/flag";
import type { CountryGeo, CustomerRow } from "@/lib/preorder-customers";
import type { CustomerKind } from "@/lib/mk-customers";
import { COMMERCIAL_CONFIG_KEYS, marketMatches, type PreorderMarket, type SubmissionStage } from "@/types/preorder";

const th = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9";
const num = new Intl.NumberFormat("en-GB");

export function overrideSummary(config: PreorderMarket["config"]): string[] {
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

// ── customer kind ─────────────────────────────────────────────────────────────

export function CustomerKindBadge({ kind, taxId, compact }: { kind: CustomerKind; taxId?: string | null; compact?: boolean }) {
  const business = kind === "business";
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium shrink-0",
          business ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" : "bg-muted text-muted-foreground",
        )}
      >
        {business ? <Building2 className="w-3 h-3" /> : <User className="w-3 h-3" />}
        {business ? "Company" : "Individual"}
      </span>
      {!compact && business && taxId && <span className="font-mono text-[11px] text-muted-foreground truncate">{taxId}</span>}
    </span>
  );
}

// ── markets list: full width, drag to set priority ────────────────────────────
//
// One row per market in priority order (index 0 wins). Drag the handle to
// reorder; the parent persists the new order.

// The market a country lands in: the FIRST (highest-priority) market listing it.
export function firstMarketByCountry(markets: PreorderMarket[]): Map<string, PreorderMarket> {
  const m = new Map<string, PreorderMarket>();
  for (const mk of markets) for (const iso of mk.countries) if (!m.has(iso)) m.set(iso, mk);
  return m;
}

// How many directory customers each market actually catches, honouring
// priority and kinds: every (country, kind) bucket goes to the first market
// that matches it. Pinned customers are not included (they are counted apart).
export function marketCustomerCounts(markets: PreorderMarket[], stats: Record<string, CountryGeo>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [iso, s] of Object.entries(stats)) {
    for (const kind of ["business", "person"] as const) {
      const n = s[kind] ?? 0;
      if (!n) continue;
      const hit = markets.find((m) => marketMatches(m, iso, kind));
      if (hit) out[hit.id] = (out[hit.id] ?? 0) + n;
    }
  }
  return out;
}

export function MarketsPanel({
  markets,
  stats,
  pinned,
  onEdit,
  onCreate,
  onShowCustomers,
  onReorder,
}: {
  markets: PreorderMarket[];
  stats: Record<string, CountryGeo>;
  /** Customers pinned to a market by hand (customer rules with marketId), per market id. */
  pinned?: Record<string, number>;
  onEdit: (id: string) => void;
  onCreate: () => void;
  onShowCustomers: (id: string) => void;
  /** The full id list in its new priority order. */
  onReorder?: (ids: string[]) => void;
}) {
  const assigned = new Set(markets.flatMap((m) => m.countries));
  const unassigned = Object.entries(stats).filter(([iso, s]) => !assigned.has(iso) && s.customers > 0);
  const unassignedCustomers = unassigned.reduce((n, [, s]) => n + s.customers, 0);
  const counts = useMemo(() => marketCustomerCounts(markets, stats), [markets, stats]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex flex-wrap items-center gap-2">
        <Layers className="w-4 h-4 text-muted-foreground" />
        <span className="text-[13px] font-semibold text-foreground">Markets</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{markets.length}</span>
        {markets.length > 1 && (
          <span className="ml-2 text-[11px] text-muted-foreground" title="A customer who fits several markets lands in the one listed first.">
            Drag to set priority — the first market that matches a customer wins.
          </span>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={onCreate}><Plus className="w-3.5 h-3.5" /> New market</Button>
      </div>

      {markets.length > 0 && (
        <div className="hidden md:grid grid-cols-[28px_28px_minmax(0,1.4fr)_minmax(0,1.6fr)_120px_minmax(0,1.2fr)_150px] items-center gap-3 px-4 h-9 text-[11px] text-muted-foreground border-b border-border/60 bg-muted/20">
          <span />
          <span>#</span>
          <span>Market</span>
          <span>Countries</span>
          <span className="text-right">Customers</span>
          <span>Overrides</span>
          <span />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e: DragEndEvent) => {
          const { active, over } = e;
          if (!over || active.id === over.id || !onReorder) return;
          const ids = markets.map((m) => m.id);
          const from = ids.indexOf(String(active.id));
          const to = ids.indexOf(String(over.id));
          if (from < 0 || to < 0) return;
          onReorder(arrayMove(ids, from, to));
        }}
      >
        <SortableContext items={markets.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-border/60">
            {markets.map((m, i) => (
              <MarketRow
                key={m.id}
                market={m}
                index={i}
                customers={counts[m.id] ?? 0}
                pinned={pinned?.[m.id] ?? 0}
                onEdit={() => onEdit(m.id)}
                onShowCustomers={() => onShowCustomers(m.id)}
                draggable={!!onReorder && markets.length > 1}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {markets.length === 0 && (
        <div className="px-4 py-12 text-center">
          <Globe2 className="w-6 h-6 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-[13px] font-medium text-foreground">No markets yet</p>
          <p className="mt-1 text-[12px] text-muted-foreground">Every customer gets the campaign defaults. A market groups countries — or all companies, or all individuals — that share prices, terms and assortment.</p>
          <div className="mt-4">
            <Button size="sm" onClick={onCreate}><Plus className="w-3.5 h-3.5" /> Create the first market</Button>
          </div>
        </div>
      )}
      {unassigned.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border bg-muted/30 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{unassigned.length}</span> countr{unassigned.length === 1 ? "y" : "ies"} with customers ({num.format(unassignedCustomers)}) sit in no market → campaign defaults. Assign them under Countries.
        </div>
      )}
    </div>
  );
}

function MarketRow({
  market: m,
  index,
  customers,
  pinned,
  onEdit,
  onShowCustomers,
  draggable,
}: {
  market: PreorderMarket;
  index: number;
  customers: number;
  pinned: number;
  onEdit: () => void;
  onShowCustomers: () => void;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(transform), transition, ...(isDragging ? { zIndex: 10, position: "relative" as const } : {}) };
  const kinds = m.kinds ?? [];
  const kindLabel = kinds.length === 0 || kinds.length === 2 ? null : kinds[0] === "business" ? "companies only" : "individuals only";
  const ov = overrideSummary(m.config);
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group grid grid-cols-[28px_28px_minmax(0,1fr)] md:grid-cols-[28px_28px_minmax(0,1.4fr)_minmax(0,1.6fr)_120px_minmax(0,1.2fr)_150px] items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors",
        isDragging && "bg-surface shadow-lg ring-1 ring-border",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={!draggable}
        className="flex h-7 w-6 items-center justify-center rounded cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-foreground disabled:opacity-0"
        aria-label="Drag to change priority"
        title="Drag to change priority"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums">{index + 1}</span>

      <button type="button" onClick={onEdit} className="min-w-0 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <span className="size-2.5 rounded-full shrink-0" style={{ background: MARKET_COLORS[m.color].hex }} />
          <span className="text-[13px] font-semibold text-foreground truncate group-hover:underline decoration-border underline-offset-4">{m.name}</span>
          {kindLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground shrink-0">
              {kinds[0] === "business" ? <Building2 className="w-3 h-3" /> : <User className="w-3 h-3" />} {kindLabel}
            </span>
          )}
        </div>
        <div className="md:hidden mt-1 text-[11px] text-muted-foreground">{num.format(customers)} customers · {ov.length ? ov.join(" · ") : "inherits campaign defaults"}</div>
      </button>

      <div className="hidden md:flex flex-wrap items-center gap-1 min-w-0">
        {m.countries.slice(0, 12).map((iso) => (
          <Flag key={iso} iso={iso} className="text-[14px]" />
        ))}
        {m.countries.length > 12 && <span className="text-[11px] text-muted-foreground tabular-nums">+{m.countries.length - 12}</span>}
        {m.countries.length === 0 && kinds.length > 0 && <span className="text-[11px] text-muted-foreground">any country</span>}
        {m.countries.length === 0 && kinds.length === 0 && <span className="text-[11px] text-amber-600 dark:text-amber-400">no automatic match — pinned customers only</span>}
      </div>

      <div className="hidden md:block text-right tabular-nums">
        <span className="text-[13px] font-semibold text-foreground">{num.format(customers)}</span>
        {pinned > 0 && <span className="block text-[10px] text-muted-foreground">+{pinned} pinned</span>}
      </div>

      <div className="hidden md:block text-[11px] text-muted-foreground truncate">{ov.length ? ov.join(" · ") : <span className="italic">inherits campaign defaults</span>}</div>

      <div className="hidden md:flex items-center justify-end gap-1">
        <Button size="xs" variant="ghost" onClick={onShowCustomers} className="h-7 text-muted-foreground">
          <Users className="w-3.5 h-3.5" /> Customers
        </Button>
        <Button size="xs" variant="ghost" onClick={onEdit} className="h-7 text-muted-foreground">
          <Pencil className="w-3.5 h-3.5" /> Edit
        </Button>
      </div>
    </div>
  );
}

// ── countries table ───────────────────────────────────────────────────────────

type CountryFilter = "all" | "unassigned" | string; // string = market id

export function CountriesTable({
  campaignId,
  stats,
  markets,
  countryNames,
  onAssign,
  onOpenCountry,
  onOpenCustomer,
}: {
  campaignId: string;
  stats: Record<string, CountryGeo>;
  markets: PreorderMarket[];
  countryNames: Record<string, string>;
  onAssign: (marketId: string | null, isos: string[]) => Promise<void>;
  onOpenCountry: (iso: string) => void;
  onOpenCustomer: (partnerMkId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // countries showing their customers
  const [filter, setFilter] = useState<CountryFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null); // iso being assigned, or "bulk"
  const [bulkTarget, setBulkTarget] = useState<string>("");

  const marketOf = useMemo(() => firstMarketByCountry(markets), [markets]);
  // Countries listed by more than one market — the priority note on the row.
  const alsoIn = useMemo(() => {
    const m = new Map<string, PreorderMarket[]>();
    for (const mk of markets) for (const iso of mk.countries) m.set(iso, [...(m.get(iso) ?? []), mk]);
    return m;
  }, [markets]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.entries(stats)
      .map(([iso, s]) => ({ iso, name: countryNames[iso] ?? iso, s, market: marketOf.get(iso) ?? null }))
      .filter((r) => r.s.customers > 0 || r.market)
      .filter((r) => (filter === "all" ? true : filter === "unassigned" ? !r.market : r.market?.id === filter))
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.iso.toLowerCase() === needle)
      .sort((a, b) => b.s.customers - a.s.customers || a.name.localeCompare(b.name));
  }, [stats, countryNames, marketOf, filter, q]);

  const maxCustomers = useMemo(() => Math.max(1, ...Object.values(stats).map((s) => s.customers)), [stats]);
  const counts = useMemo(() => {
    const all = Object.entries(stats).filter(([iso, s]) => s.customers > 0 || marketOf.has(iso));
    return { all: all.length, unassigned: all.filter(([iso]) => !marketOf.has(iso)).length };
  }, [stats, marketOf]);

  const visibleIsos = rows.map((r) => r.iso);
  const allVisibleSelected = visibleIsos.length > 0 && visibleIsos.every((iso) => selected.has(iso));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visibleIsos));
  const toggle = (iso: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });

  const assignOne = async (iso: string, marketId: string | null) => {
    setBusy(iso);
    try {
      await onAssign(marketId, [iso]);
    } finally {
      setBusy(null);
    }
  };
  const assignBulk = async (marketId: string | null) => {
    if (selected.size === 0) return;
    setBusy("bulk");
    try {
      await onAssign(marketId, Array.from(selected));
      setSelected(new Set());
      setBulkTarget("");
    } finally {
      setBusy(null);
    }
  };

  const chip = (key: CountryFilter, label: string, n: number, color?: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[11px] font-medium transition-colors", filter === key ? "border-foreground/60 bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted")}
    >
      {color && <span className="size-1.5 rounded-full" style={{ background: color }} />}
      {label} <span className="tabular-nums opacity-70">{n}</span>
    </button>
  );

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex flex-wrap items-center gap-2">
        <Globe2 className="w-4 h-4 text-muted-foreground" />
        <span className="text-[13px] font-semibold text-foreground">Countries</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{rows.length}</span>
        <div className="relative ml-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a country…" className="h-8 w-48 pl-8 text-[12px]" />
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-muted-foreground hidden xl:inline">Pick a market per row, or tick several and assign at once.</span>
      </div>
      <div className="px-4 py-2 border-b border-border/60 flex flex-wrap items-center gap-1.5">
        {chip("all", "All", counts.all)}
        {chip("unassigned", "No market", counts.unassigned)}
        {markets.map((m) => chip(m.id, m.name, m.countries.length, MARKET_COLORS[m.color].hex))}
      </div>

      {selected.size > 0 && (
        <div className="px-4 py-2 border-b border-lime-300/60 bg-lime-50/70 dark:bg-lime-950/20 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium text-foreground tabular-nums">{selected.size} selected</span>
          <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground">{Array.from(selected).slice(0, 8).map((iso) => <Flag key={iso} iso={iso} className="text-[12px]" />)}{selected.size > 8 ? " …" : ""}</span>
          <span className="w-px h-5 bg-border mx-1" />
          <Select value={bulkTarget} onValueChange={setBulkTarget}>
            <SelectTrigger size="sm" className="h-8 w-48 text-[12px] bg-background"><SelectValue placeholder="Choose a market…" /></SelectTrigger>
            <SelectContent>
              {markets.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-[12px]">
                  <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: MARKET_COLORS[m.color].hex }} /> {m.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8" disabled={!bulkTarget || busy !== null} onClick={() => assignBulk(bulkTarget)}>
            {busy === "bulk" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />} Assign
          </Button>
          {Array.from(selected).some((iso) => marketOf.has(iso)) && (
            <Button size="sm" variant="ghost" className="h-8" disabled={busy !== null} onClick={() => assignBulk(null)}>Remove from market</Button>
          )}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Clear selection"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead className="h-9 w-8" />
            <TableHead className="h-9 w-10 pl-2">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all" className="accent-lime-600" />
            </TableHead>
            <TableHead className={th}>Country</TableHead>
            <TableHead className={cn(th, "w-[220px]")}>Customers</TableHead>
            <TableHead className={cn(th, "text-right w-[110px]")}>Companies</TableHead>
            <TableHead className={cn(th, "text-right w-[110px]")}>Individuals</TableHead>
            <TableHead className={cn(th, "text-right w-[100px]")}>Unlocked</TableHead>
            <TableHead className={cn(th, "w-[220px]")}>Market</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const isOpen = expanded.has(r.iso);
            const others = (alsoIn.get(r.iso) ?? []).filter((m) => m.id !== r.market?.id);
            return (
            <Fragment key={r.iso}>
            <TableRow className={cn("border-b border-border/60", selected.has(r.iso) && "bg-lime-50/40 dark:bg-lime-950/10", isOpen && "bg-muted/20")}>
              <TableCell className="pl-3 pr-0">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(r.iso)) n.delete(r.iso); else n.add(r.iso); return n; })}
                  className="flex h-7 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label={isOpen ? "Hide customers" : "Show customers"}
                  aria-expanded={isOpen}
                  title={isOpen ? "Hide customers" : `Show the ${r.s.customers} customer${r.s.customers === 1 ? "" : "s"} in ${r.name}`}
                >
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </TableCell>
              <TableCell className="pl-2">
                <input type="checkbox" checked={selected.has(r.iso)} onChange={() => toggle(r.iso)} aria-label={`Select ${r.name}`} className="accent-lime-600" />
              </TableCell>
              <TableCell className="py-2">
                <button type="button" onClick={() => onOpenCountry(r.iso)} className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground hover:text-lime-700 dark:hover:text-lime-400">
                  <Flag iso={r.iso} className="text-[15px]" />
                  {r.name}
                  <span className="font-mono text-[10px] text-muted-foreground">{r.iso}</span>
                </button>
                {others.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-0.5" title="Listed by more than one market — the one with higher priority wins.">
                    also in {others.map((m) => m.name).join(", ")} · priority decides
                  </div>
                )}
              </TableCell>
              <TableCell className="py-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-12 text-right tabular-nums text-[13px] font-semibold text-foreground">{num.format(r.s.customers)}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden" aria-hidden>
                    <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${Math.max(2, Math.round((r.s.customers / maxCustomers) * 100))}%` }} />
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums text-[12px] text-muted-foreground">{num.format(r.s.business)}</TableCell>
              <TableCell className="text-right tabular-nums text-[12px] text-muted-foreground">{num.format(r.s.person)}</TableCell>
              <TableCell className="text-right tabular-nums text-[12px]">{r.s.unlocked ? <span className="text-lime-700 dark:text-lime-400 font-medium">{r.s.unlocked}</span> : <span className="text-muted-foreground/50">—</span>}</TableCell>
              <TableCell className="py-1.5">
                <div className="flex items-center gap-2">
                  <Select value={r.market?.id ?? "__none__"} onValueChange={(v) => void assignOne(r.iso, v === "__none__" ? null : v)} disabled={busy !== null}>
                    <SelectTrigger size="sm" className={cn("h-8 w-full text-[12px]", !r.market && "text-muted-foreground")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-[12px] text-muted-foreground">No market</SelectItem>
                      {markets.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-[12px]">
                          <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: MARKET_COLORS[m.color].hex }} /> {m.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {busy === r.iso && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                </div>
              </TableCell>
            </TableRow>
            {isOpen && (
              <TableRow className="border-b border-border/60 hover:bg-transparent">
                <TableCell colSpan={8} className="p-0">
                  <CountryCustomers campaignId={campaignId} iso={r.iso} total={r.s.customers} onOpen={onOpenCustomer} />
                </TableCell>
              </TableRow>
            )}
            </Fragment>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-[13px] text-muted-foreground py-14">
                {counts.all === 0 ? "No countries yet — sync the customer directory from Metakocka first." : "No countries match."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// The customers of one country, shown inline under its row (first 50).
function CountryCustomers({ campaignId, iso, total, onOpen }: { campaignId: string; iso: string; total: number; onOpen: (partnerMkId: string) => void }) {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/preorder/campaigns/${campaignId}/customers?country=${encodeURIComponent(iso)}&pageSize=50`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setRows(j.items ?? []))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [campaignId, iso]);
  return (
    <div className="bg-muted/20 border-l-2 border-l-lime-500/50 ml-6 my-1.5 mr-4 rounded-r-lg overflow-hidden">
      {rows === null ? (
        <div className="px-4 py-3 space-y-2">
          {[0, 1, 2].map((i) => <SkeletonLine key={i} lh="h-[18px]" h="h-3" w={["w-56", "w-44", "w-64"][i]} delay={stagger(i, 60)} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-3 text-[12px] text-muted-foreground">No customers in this country.</div>
      ) : (
        <div className="divide-y divide-border/40">
          {rows.map((c) => (
            <button
              key={c.partnerMkId}
              type="button"
              onClick={() => onOpen(c.partnerMkId)}
              className="w-full grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_110px_120px] items-center gap-3 px-4 py-1.5 text-left hover:bg-muted/40"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className={cn("size-6 rounded-md flex items-center justify-center shrink-0", c.kind === "business" ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : "bg-muted text-muted-foreground")}>
                  {c.kind === "business" ? <Building2 className="w-3 h-3" /> : <User className="w-3 h-3" />}
                </span>
                <span className="text-[12.5px] font-medium text-foreground truncate">{c.name}</span>
              </span>
              <span className="text-[11px] text-muted-foreground truncate">{[c.city, c.email].filter(Boolean).join(" · ")}</span>
              <span className="min-w-0">
                {c.market ? (
                  <span className="inline-flex items-center gap-1.5"><MarketChip name={c.market.name} color={c.market.color} />{c.market.source === "manual" && <span className="text-[10px] text-muted-foreground">pinned</span>}</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">no market</span>
                )}
              </span>
              <span className="text-[11px]">{c.access ? <span className="text-lime-700 dark:text-lime-400 font-medium">Unlocked</span> : <span className="text-muted-foreground">Not unlocked</span>}</span>
              <span className="text-[11px]">{c.stage ? <SubmissionStageBadge stage={c.stage} /> : <span className="text-muted-foreground">—</span>}</span>
            </button>
          ))}
          {total > rows.length && <div className="px-4 py-1.5 text-[11px] text-muted-foreground">Showing {rows.length} of {total} — the Customers view has the rest.</div>}
        </div>
      )}
    </div>
  );
}

// ── customers table ───────────────────────────────────────────────────────────

export type CustomerFilters = {
  q: string;
  kind: CustomerKind | "all";
  country: string;
  market: string;
  access: "all" | "unlocked" | "not-unlocked";
  stage: "all" | "any" | SubmissionStage;
  override: "all" | "yes" | "no";
};
export const DEFAULT_CUSTOMER_FILTERS: CustomerFilters = { q: "", kind: "all", country: "", market: "all", access: "all", stage: "all", override: "all" };

export function CustomersTable({
  campaignId,
  markets,
  countryNames,
  stats,
  kinds,
  syncing,
  syncInfo,
  onSync,
  onOpen,
  reloadKey,
  preset,
  presetKey,
}: {
  campaignId: string;
  markets: PreorderMarket[];
  countryNames: Record<string, string>;
  stats: Record<string, CountryGeo>;
  kinds: { business: number; person: number };
  syncing: boolean;
  syncInfo: string | null;
  onSync: () => void;
  onOpen: (partnerMkId: string) => void;
  reloadKey: number;
  /** Filters pushed in from outside (a stat tile, a market's "Show customers"). */
  preset?: Partial<CustomerFilters>;
  presetKey?: number;
}) {
  const [filters, setFilters] = useState<CustomerFilters>({ ...DEFAULT_CUSTOMER_FILTERS, ...preset });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    if (presetKey !== undefined && presetKey > 0) setFilters({ ...DEFAULT_CUSTOMER_FILTERS, ...preset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 250);
    return () => clearTimeout(t);
  }, [filters.q]);
  useEffect(() => setPage(1), [debouncedQ, filters.kind, filters.country, filters.market, filters.access, filters.stage, filters.override]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (debouncedQ) sp.set("q", debouncedQ);
    if (filters.kind !== "all") sp.set("kind", filters.kind);
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
  }, [campaignId, page, debouncedQ, filters.kind, filters.country, filters.market, filters.access, filters.stage, filters.override, reloadKey]);

  const pages = Math.max(1, Math.ceil(total / 50));
  // Only countries that actually have customers make useful filter options.
  const countryOptions = useMemo(
    () =>
      Object.entries(stats)
        .filter(([, s]) => s.customers > 0)
        .map(([iso, s]) => [iso, countryNames[iso] ?? iso, s.customers] as const)
        .sort((a, b) => a[1].localeCompare(b[1])),
    [stats, countryNames],
  );
  const activeFilters = [filters.country, filters.market !== "all", filters.access !== "all", filters.stage !== "all", filters.override !== "all"].filter(Boolean).length;
  const reset = () => setFilters({ ...DEFAULT_CUSTOMER_FILTERS });


  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* row 1: identity, search, kind, sync */}
      <div className="px-4 py-2.5 border-b border-border flex flex-wrap items-center gap-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="text-[13px] font-semibold text-foreground">Customers</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{loading ? "…" : num.format(total)}</span>
        <div className="relative ml-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Name, email, VAT id, city…" className="h-8 w-64 pl-8 text-[12px]" />
        </div>
        {(activeFilters > 0 || filters.kind !== "all" || filters.q) && (
          <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground ml-1">
            <X className="w-3 h-3" /> Reset filters
          </button>
        )}
        <div className="flex-1" />
        {syncInfo && <span className="text-[11px] text-muted-foreground hidden xl:inline">{syncInfo}</span>}
        <Button size="sm" variant="outline" className="h-8" onClick={onSync} disabled={syncing}>
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sync from Metakocka
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead className={cn(th, "pl-5")}>Customer</TableHead>
            <TableHead className={th}>
              <HeaderFilter
                label="Type"
                value={filters.kind}
                onChange={(v) => setFilters({ ...filters, kind: v as CustomerFilters["kind"] })}
                options={[
                  { value: "business", label: <span className="inline-flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Company</span>, count: kinds.business },
                  { value: "person", label: <span className="inline-flex items-center gap-1.5"><User className="w-3 h-3" /> Individual</span>, count: kinds.person },
                ]}
              />
            </TableHead>
            <TableHead className={th}>
              <HeaderFilter
                label="Country"
                value={filters.country || "all"}
                onChange={(v) => setFilters({ ...filters, country: v === "all" ? "" : v })}
                options={[
                  { value: "none", label: <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><AlertTriangle className="w-3 h-3" /> Unresolved</span> },
                  ...countryOptions.map(([iso, name, n]) => ({ value: iso, label: <span className="inline-flex items-center gap-1.5"><Flag iso={iso} /> {name}</span>, count: n })),
                ]}
              />
            </TableHead>
            <TableHead className={th}>
              <HeaderFilter
                label="Market"
                value={filters.market}
                onChange={(v) => setFilters({ ...filters, market: v })}
                options={[
                  { value: "none", label: "No market" },
                  ...markets.map((m) => ({
                    value: m.id,
                    label: <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: MARKET_COLORS[m.color].hex }} /> {m.name}</span>,
                  })),
                ]}
              />
            </TableHead>
            <TableHead className={th}>
              <HeaderFilter
                label="Access"
                value={filters.access}
                onChange={(v) => setFilters({ ...filters, access: v as CustomerFilters["access"] })}
                options={[
                  { value: "unlocked", label: "Unlocked" },
                  { value: "not-unlocked", label: "Not unlocked" },
                ]}
              />
            </TableHead>
            <TableHead className={th}>
              <HeaderFilter
                label="Overrides"
                value={filters.override}
                onChange={(v) => setFilters({ ...filters, override: v as CustomerFilters["override"] })}
                options={[
                  { value: "yes", label: "With overrides" },
                  { value: "no", label: "Without overrides" },
                ]}
              />
            </TableHead>
            <TableHead className={th}>
              <HeaderFilter
                label="Preorder"
                value={filters.stage}
                onChange={(v) => setFilters({ ...filters, stage: v as CustomerFilters["stage"] })}
                options={[
                  { value: "any", label: "Has a preorder" },
                  { value: "draft", label: "Draft" },
                  { value: "submitted", label: "Submitted" },
                  { value: "registered", label: "Registered" },
                  { value: "registration-failed", label: "Registration failed" },
                  { value: "published", label: "Published" },
                ]}
              />
            </TableHead>
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
                  <TableCell><Skeleton className="h-[18px] w-24 rounded-full" delay={stagger(i, 50, 25)} /></TableCell>
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
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={cn("size-7 rounded-lg flex items-center justify-center shrink-0", c.kind === "business" ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : "bg-muted text-muted-foreground")}>
                        {c.kind === "business" ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-foreground truncate max-w-[22rem]">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-[22rem]">{[c.city, c.email].filter(Boolean).join(" · ") || c.countCode || c.partnerMkId}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap"><CustomerKindBadge kind={c.kind} taxId={c.taxId} /></TableCell>
                  <TableCell className="text-[12px] whitespace-nowrap">
                    {c.countryIso ? (
                      <span className="inline-flex items-center gap-1.5"><Flag iso={c.countryIso} /> {c.countryName}{c.countrySource === "manual" ? <span className="text-[10px] text-muted-foreground"> · manual</span> : null}</span>
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
              <TableCell colSpan={7} className="text-center text-[13px] text-muted-foreground py-14">
                {total === 0 && !filters.q && !filters.country && filters.market === "all" && filters.kind === "all" ? (
                  <>
                    <RefreshCw className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
                    The customer directory is empty. Sync it from Metakocka to see every partner here.
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
