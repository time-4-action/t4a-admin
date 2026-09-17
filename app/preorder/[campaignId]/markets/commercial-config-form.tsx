"use client";

// app/preorder/[campaignId]/markets/commercial-config-form.tsx
//
// The inheritance-aware editor for ONE configuration layer (a market's or a
// customer's). Every field shows the value the layer would INHERIT (with its source
// badge) and either an "Override" affordance or the layer's own value with "Reset to
// inherited". `value` holds only the layer's overrides — an absent key means inherit —
// so it maps 1:1 onto CommercialConfig on the wire.

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, RotateCcw, Trash2, Eye, EyeOff, Search, PenLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/app/preorder/preorder-shared";
import { SourceBadge } from "@/app/preorder/preorder-badges";
import { activeTiers, flattenRows, rowUnitPrice, type CommercialConfig, type ConfigSource, type EffectiveCampaign, type PreorderCampaign, type PreorderGroup, type PreorderRow, type PreorderTab, type PreorderTier } from "@/types/preorder";
import type { MkPricelist } from "@/types/documents";

// What the layer inherits if it sets nothing: the effective campaign WITHOUT this layer.
export type InheritedView = EffectiveCampaign;

export type ConfigFormProps = {
  value: CommercialConfig;
  onChange: (next: CommercialConfig) => void;
  inherited: InheritedView;
  campaign: PreorderCampaign; // the full sheet (for the assortment tree + tier tabs)
  pricelists: MkPricelist[];
  /** The label of this layer, e.g. "Market override" / "Customer override". */
  layer: Extract<ConfigSource, "market" | "customer">;
  compact?: boolean;
  /** Render only one part of the form (no section headings). Default: everything. */
  section?: ConfigSection;
};

export type ConfigSection = "commercial" | "tiers" | "assortment";

// How many of a layer's overrides fall into each section — for tab badges.
export function configSectionCounts(value: CommercialConfig): Record<ConfigSection, number> {
  return {
    commercial: (["partnerPricelist", "currency", "deadline", "minOrderAmount", "note"] as const).filter((k) => value[k] !== undefined).length,
    tiers: value.tiersByTab?.length ?? 0,
    assortment: (value.hiddenIds?.length ?? 0) + (value.exposedIds?.length ?? 0),
  };
}

const CURRENCIES = ["EUR", "CHF", "GBP", "USD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "TRY"];

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

export function CommercialConfigForm({ value, onChange, inherited, campaign, pricelists, layer, section }: ConfigFormProps) {
  const set = <K extends keyof CommercialConfig>(key: K, v: CommercialConfig[K]) => onChange({ ...value, [key]: v });
  const reset = (key: keyof CommercialConfig) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  const has = (key: keyof CommercialConfig) => value[key] !== undefined;
  const src = inherited.effective.sources;
  const only = (s: ConfigSection) => !section || section === s;

  return (
    <div className="space-y-5">
      {/* ── Pricing ── */}
      {only("commercial") && (
      <Section title="Pricing" bare={!!section}>
        <FieldRow
          label="Partner price list"
          overridden={has("partnerPricelist")}
          inheritedValue={inherited.partnerPricelist ?? "sheet prices"}
          inheritedSource={src.pricelist}
          onOverride={() => set("partnerPricelist", inherited.partnerPricelist ?? null)}
          onReset={() => reset("partnerPricelist")}
        >
          <Select value={value.partnerPricelist ?? "__none__"} onValueChange={(v) => set("partnerPricelist", v === "__none__" ? null : v)}>
            <SelectTrigger size="sm" className="h-8 text-[12px] w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-[12px]">Sheet prices (campaign list)</SelectItem>
              {pricelists.map((p) => (
                <SelectItem key={p.code} value={p.title} className="text-[12px]">
                  {p.title}{p.currency ? ` · ${p.currency}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {value.partnerPricelist && value.partnerPricelist !== campaign.partnerPricelist && (
            <p className="text-[10px] text-muted-foreground mt-1">Prices come from this list&rsquo;s price book — refresh price books after changing lists.</p>
          )}
        </FieldRow>
        <FieldRow
          label="Currency"
          overridden={has("currency")}
          inheritedValue={inherited.currency}
          inheritedSource={src.currency}
          onOverride={() => set("currency", inherited.currency)}
          onReset={() => reset("currency")}
        >
          <Select value={value.currency ?? inherited.currency} onValueChange={(v) => set("currency", v)}>
            <SelectTrigger size="sm" className="h-8 text-[12px] w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from(new Set([inherited.currency, ...CURRENCIES])).map((c) => (
                <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      </Section>
      )}

      {/* ── Commercial ── */}
      {only("commercial") && (
      <Section title="Terms" bare={false}>
        <FieldRow
          label="Deadline"
          overridden={has("deadline")}
          inheritedValue={inherited.deadline ? fmtDate(inherited.deadline) : "none"}
          inheritedSource={src.deadline}
          onOverride={() => set("deadline", inherited.deadline ?? null)}
          onReset={() => reset("deadline")}
        >
          <DatePicker value={value.deadline ?? null} onChange={(iso) => set("deadline", iso)} withTime placeholder="No deadline" />
        </FieldRow>
        <FieldRow
          label="Minimum order (net)"
          overridden={has("minOrderAmount")}
          inheritedValue={inherited.effective.minOrderAmount ? fmtMoney(inherited.effective.minOrderAmount, inherited.currency) : "none"}
          inheritedSource={src.minOrderAmount}
          onOverride={() => set("minOrderAmount", inherited.effective.minOrderAmount ?? null)}
          onReset={() => reset("minOrderAmount")}
        >
          <Input
            type="number"
            min={0}
            step="0.01"
            value={value.minOrderAmount ?? ""}
            placeholder="none"
            onChange={(e) => set("minOrderAmount", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
            className="h-8 text-[12px] w-40"
          />
        </FieldRow>
        <FieldRow
          label="Customer note"
          overridden={has("note")}
          inheritedValue={inherited.effective.note ?? "none"}
          inheritedSource={src.note}
          onOverride={() => set("note", inherited.effective.note ?? "")}
          onReset={() => reset("note")}
        >
          <textarea
            value={value.note ?? ""}
            onChange={(e) => set("note", e.target.value)}
            rows={3}
            placeholder="Shown to the customer on their preorder page (delivery terms, payment, …)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] focus:border-ring focus:outline-none"
          />
        </FieldRow>
      </Section>
      )}

      {/* ── Volume discounts ── */}
      {only("tiers") && (
      <Section title="Volume discounts" bare={!!section}>
        <TiersEditor value={value} onChange={onChange} inherited={inherited} campaign={campaign} layer={layer} />
      </Section>
      )}

      {/* ── Assortment ── */}
      {only("assortment") && (
      <Section title="Assortment" bare={!!section}>
        <AssortmentEditor value={value} onChange={onChange} inherited={inherited} campaign={campaign} />
      </Section>
      )}
    </div>
  );
}

function Section({ title, bare, children }: { title: string; bare?: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      {!bare && <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</h3>}
      {children}
    </section>
  );
}

// The Override / Reset pair every inheritable field carries. Real buttons — the
// whole point of an override editor is finding these.
function OverrideToggle({ overridden, onOverride, onReset }: { overridden: boolean; onOverride: () => void; onReset: () => void }) {
  return overridden ? (
    <Button type="button" size="sm" variant="ghost" onClick={onReset} className="h-8 text-[12px] text-muted-foreground">
      <RotateCcw className="w-3.5 h-3.5" /> Reset to inherited
    </Button>
  ) : (
    <Button type="button" size="sm" variant="outline" onClick={onOverride} className="h-8 text-[12px] border-lime-500/50 text-lime-700 dark:text-lime-400 hover:bg-lime-50 dark:hover:bg-lime-950/30">
      <PenLine className="w-3.5 h-3.5" /> Override
    </Button>
  );
}

function FieldRow({
  label,
  overridden,
  inheritedValue,
  inheritedSource,
  onOverride,
  onReset,
  children,
}: {
  label: string;
  overridden: boolean;
  inheritedValue: string;
  inheritedSource: ConfigSource;
  onOverride: () => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border p-4", overridden ? "border-lime-300/70 bg-lime-50/40 dark:border-lime-800/50 dark:bg-lime-950/20" : "border-border bg-surface")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-foreground">{label}</div>
          {overridden ? (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Inherited: {inheritedValue} <SourceBadge source={inheritedSource} className="ml-1" />
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-foreground break-words">{inheritedValue}</span>
              <SourceBadge source={inheritedSource} />
            </div>
          )}
        </div>
        <OverrideToggle overridden={overridden} onOverride={onOverride} onReset={onReset} />
      </div>
      {overridden && <div className="mt-3">{children}</div>}
    </div>
  );
}

// ── tiers ──────────────────────────────────────────────────────────────────────

function TiersEditor({
  value,
  onChange,
  inherited,
  campaign,
  layer,
}: Pick<ConfigFormProps, "value" | "onChange" | "inherited" | "campaign" | "layer">) {
  const byTab = new Map((value.tiersByTab ?? []).map((t) => [t.tabId, t.tiers]));
  const setTab = (tabId: string, tiers: PreorderTier[] | undefined) => {
    const next = (value.tiersByTab ?? []).filter((t) => t.tabId !== tabId);
    if (tiers !== undefined) next.push({ tabId, tiers });
    const out = { ...value };
    if (next.length === 0 && tiers === undefined) delete out.tiersByTab;
    else out.tiersByTab = next;
    onChange(out);
  };
  return (
    <div className="space-y-2">
      {campaign.tabs.map((tab) => {
        const own = byTab.get(tab.id);
        const overridden = own !== undefined;
        const inhTab = inherited.tabs.find((t) => t.id === tab.id);
        const inhTiers = activeTiers(inhTab?.tiers ?? tab.tiers);
        const source = inherited.effective.sources.tiers[tab.id] ?? "campaign";
        return (
          <div key={tab.id} className={cn("rounded-xl border p-4", overridden ? "border-lime-300/70 bg-lime-50/40 dark:border-lime-800/50 dark:bg-lime-950/20" : "border-border bg-surface")}>
            <div className="flex items-center gap-3">
              <div className="text-[13px] font-semibold text-foreground">{tab.name}</div>
              <div className="flex-1" />
              <OverrideToggle overridden={overridden} onOverride={() => setTab(tab.id, inhTiers.map((t) => ({ ...t, id: uid() })))} onReset={() => setTab(tab.id, undefined)} />
            </div>
            {!overridden ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                {inhTiers.length ? (
                  inhTiers.map((t) => (
                    <span key={t.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      {t.name || "Tier"} −{t.discountPct}% <span className="text-muted-foreground tabular-nums">{fmtMoney(t.minAmount, inherited.currency)}+</span>
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground">No volume discounts</span>
                )}
                <SourceBadge source={source} />
              </div>
            ) : (
              <TierLadder tiers={own} currency={value.currency ?? inherited.currency} onChange={(tiers) => setTab(tab.id, tiers)} />
            )}
            {overridden && own.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">Empty ladder = no volume discounts on this tab for this {layer}.</p>
            )}
          </div>
        );
      })}
      {campaign.tabs.length === 0 && <p className="text-[12px] text-muted-foreground">The sheet has no tabs yet.</p>}
    </div>
  );
}

function TierLadder({ tiers, currency, onChange }: { tiers: PreorderTier[]; currency: string; onChange: (t: PreorderTier[]) => void }) {
  const sorted = useMemo(() => [...tiers].sort((a, b) => a.minAmount - b.minAmount), [tiers]);
  const update = (id: string, patch: Partial<PreorderTier>) => onChange(tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  return (
    <div className="mt-2 space-y-1.5">
      {sorted.map((t) => (
        <div key={t.id} className="grid grid-cols-[1fr_96px_72px_28px] gap-1.5 items-center">
          <Input value={t.name} placeholder="Tier name" onChange={(e) => update(t.id, { name: e.target.value })} className="h-7 text-[12px]" />
          <div className="relative">
            <Input type="number" min={0} value={t.minAmount} onChange={(e) => update(t.id, { minAmount: Math.max(0, Number(e.target.value) || 0) })} className="h-7 text-[12px] pr-9 tabular-nums" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{currency}</span>
          </div>
          <div className="relative">
            <Input type="number" min={0} max={100} value={t.discountPct} onChange={(e) => update(t.id, { discountPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} className="h-7 text-[12px] pr-6 tabular-nums" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
          </div>
          <button type="button" onClick={() => onChange(tiers.filter((x) => x.id !== t.id))} className="p-1 text-muted-foreground hover:text-destructive" aria-label="Remove tier">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={() => {
          const last = sorted[sorted.length - 1];
          onChange([...tiers, { id: uid(), name: `Tier ${tiers.length + 1}`, minAmount: last ? last.minAmount * 2 : 10000, discountPct: last ? Math.min(100, last.discountPct + 5) : 5 }]);
        }}
      >
        <Plus className="w-3 h-3" /> Add tier
      </Button>
    </div>
  );
}

// ── assortment ─────────────────────────────────────────────────────────────────
//
// A product-first editor: every row shows what the customer will see (a Visible /
// Hidden switch reflecting the EFFECTIVE state) and flipping it writes the
// smallest override that gets there. Bulk actions on a tab or group write
// row-level ids too, so single rows stay independently flippable — a tab-level
// `exposedIds` entry would otherwise out-rank any row-level hide (exposed beats
// hidden within a layer). Legacy tab/group-level ids are still honoured and are
// dissolved into row-level ones the first time a row beneath them is touched.

type Flat = { tab: PreorderTab; group: PreorderGroup; row: PreorderRow };
type AssortmentFilter = "all" | "visible" | "hidden" | "changed";

function AssortmentEditor({ value, onChange, inherited, campaign }: Pick<ConfigFormProps, "value" | "onChange" | "inherited" | "campaign">) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<AssortmentFilter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const hidden = useMemo(() => new Set(value.hiddenIds ?? []), [value.hiddenIds]);
  const exposed = useMemo(() => new Set(value.exposedIds ?? []), [value.exposedIds]);
  const inheritedVisible = useMemo(() => new Set(flattenRows(inherited).map((r) => r.row.id)), [inherited]);
  const all = useMemo(() => flattenRows(campaign) as Flat[], [campaign]);
  const currency = value.currency ?? inherited.currency;

  const idsOf = (r: Flat) => [r.tab.id, r.group.id, r.row.id];
  const inh = (r: Flat) => inheritedVisible.has(r.row.id);
  // Effective visibility for this layer, mirroring lib/preorder-effective.
  const eff = (r: Flat) => (idsOf(r).some((id) => exposed.has(id)) ? true : idsOf(r).some((id) => hidden.has(id)) ? false : inh(r));
  const changed = (r: Flat) => idsOf(r).some((id) => hidden.has(id) || exposed.has(id));

  const commit = (h: Set<string>, e: Set<string>) => {
    const next = { ...value };
    if (h.size) next.hiddenIds = Array.from(h);
    else delete next.hiddenIds;
    if (e.size) next.exposedIds = Array.from(e);
    else delete next.exposedIds;
    onChange(next);
  };

  // Set the target visibility on a set of rows. Ancestor (tab/group) overrides
  // touching any of them are first dissolved into row-level ones so the result
  // is exactly what was asked for.
  const setRowsVisible = (rows: Flat[], visible: boolean) => {
    const h = new Set(hidden);
    const e = new Set(exposed);
    const ancestors = new Set<string>();
    for (const r of rows) for (const id of [r.tab.id, r.group.id]) if (hidden.has(id) || exposed.has(id)) ancestors.add(id);
    if (ancestors.size) {
      const affected = all.filter((r) => ancestors.has(r.tab.id) || ancestors.has(r.group.id));
      for (const r of affected) {
        const cur = eff(r); // with the ancestor override still in force
        h.delete(r.row.id);
        e.delete(r.row.id);
        if (cur !== inh(r)) (cur ? e : h).add(r.row.id);
      }
      for (const id of ancestors) {
        h.delete(id);
        e.delete(id);
      }
    }
    for (const r of rows) {
      h.delete(r.row.id);
      e.delete(r.row.id);
      if (visible !== inh(r)) (visible ? e : h).add(r.row.id);
    }
    commit(h, e);
  };
  const resetRows = (rows: Flat[], ancestorIds: string[] = []) => {
    const h = new Set(hidden);
    const e = new Set(exposed);
    for (const id of ancestorIds) {
      h.delete(id);
      e.delete(id);
    }
    for (const r of rows) {
      h.delete(r.row.id);
      e.delete(r.row.id);
    }
    commit(h, e);
  };

  const needle = q.trim().toLowerCase();
  const match = (r: Flat) =>
    !needle || [r.row.name, r.row.code, r.row.variantLabel, r.group.name, r.tab.name].some((s) => (s ?? "").toLowerCase().includes(needle));
  const passes = (r: Flat) => {
    if (!match(r)) return false;
    if (filter === "visible") return eff(r);
    if (filter === "hidden") return !eff(r);
    if (filter === "changed") return changed(r);
    return true;
  };

  const total = all.length;
  const visibleCount = all.filter(eff).length;
  const changedCount = all.filter(changed).length;
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      {/* summary + tools */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-[18px] font-semibold text-foreground tabular-nums leading-none">
              {visibleCount} <span className="text-[13px] font-normal text-muted-foreground">of {total} products orderable</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {changedCount === 0 ? "Everything follows the inherited assortment." : `${changedCount} product${changedCount === 1 ? "" : "s"} changed for this layer.`}
            </div>
          </div>
          <div className="flex-1" />
          {changedCount > 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={() => commit(new Set(), new Set())} className="h-8 text-[12px] text-muted-foreground">
              <RotateCcw className="w-3.5 h-3.5" /> Reset everything
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product, SKU, group or tab…" className="h-9 pl-8 text-[13px]" />
          </div>
          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
            {(
              [
                ["all", "All", total],
                ["visible", "Visible", visibleCount],
                ["hidden", "Hidden", total - visibleCount],
                ["changed", "Changed", changedCount],
              ] as [AssortmentFilter, string, number][]
            ).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "h-8 rounded-md px-2.5 text-[12px] font-medium tabular-nums transition-colors",
                  filter === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* tabs → groups → rows */}
      {campaign.tabs.map((tab) => {
        const tabRows = all.filter((r) => r.tab.id === tab.id);
        const shownRows = tabRows.filter(passes);
        if (shownRows.length === 0 && (needle || filter !== "all")) return null;
        const tabVisible = tabRows.filter(eff).length;
        const tabChanged = tabRows.filter(changed).length;
        const open = !collapsed.has(tab.id);
        return (
          <div key={tab.id} className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-muted/30 border-b border-border">
              <button type="button" onClick={() => toggle(tab.id)} className="inline-flex items-center gap-2 text-left min-w-0" aria-label={open ? "Collapse" : "Expand"}>
                {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                <span className="text-[14px] font-semibold text-foreground truncate">{tab.name}</span>
              </button>
              <span className="text-[12px] text-muted-foreground tabular-nums">
                {tabVisible} of {tabRows.length} orderable{tabChanged > 0 ? ` · ${tabChanged} changed` : ""}
              </span>
              <div className="flex-1" />
              <BulkButtons
                onShow={() => setRowsVisible(tabRows, true)}
                onHide={() => setRowsVisible(tabRows, false)}
                onReset={tabChanged > 0 ? () => resetRows(tabRows, [tab.id, ...tab.groups.map((g) => g.id)]) : undefined}
              />
            </div>
            {open && (
              <div className="divide-y divide-border/60">
                {tab.groups.map((group) => {
                  const groupRows = tabRows.filter((r) => r.group.id === group.id);
                  const rows = groupRows.filter(passes);
                  if (rows.length === 0) return null;
                  const gVisible = groupRows.filter(eff).length;
                  const gChanged = groupRows.filter(changed).length;
                  return (
                    <div key={group.id}>
                      <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-muted/10">
                        <span className="text-[12px] font-semibold text-foreground">{group.name}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{gVisible}/{groupRows.length}</span>
                        <div className="flex-1" />
                        <BulkButtons
                          small
                          onShow={() => setRowsVisible(groupRows, true)}
                          onHide={() => setRowsVisible(groupRows, false)}
                          onReset={gChanged > 0 ? () => resetRows(groupRows, [group.id]) : undefined}
                        />
                      </div>
                      <div className="divide-y divide-border/40">
                        {rows.map((r) => {
                          const on = eff(r);
                          const isChanged = changed(r);
                          const price = rowUnitPrice(r.row);
                          return (
                            <div key={r.row.id} className={cn("flex items-center gap-3 px-4 py-2", isChanged && "bg-lime-50/50 dark:bg-lime-950/15", !on && "opacity-80")}>
                              {r.row.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={r.row.image} alt="" className={cn("w-9 h-9 rounded-md object-cover ring-1 ring-border shrink-0", !on && "grayscale")} />
                              ) : (
                                <span className="w-9 h-9 rounded-md bg-muted shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className={cn("text-[13px] truncate", on ? "text-foreground" : "text-muted-foreground line-through decoration-border")}>
                                  {r.row.name}
                                  {r.row.variantLabel && <span className="text-muted-foreground"> · {r.row.variantLabel}</span>}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <span className="font-mono">{r.row.code}</span>
                                  {r.row.restricted && (
                                    <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 px-1.5 py-px text-[10px] font-medium">restricted</span>
                                  )}
                                  {isChanged && <span className="text-lime-700 dark:text-lime-400">{on ? "shown for this layer" : "hidden for this layer"}</span>}
                                  {!isChanged && !inh(r) && <span>hidden by inheritance</span>}
                                </div>
                              </div>
                              {price > 0 && <span className="hidden sm:block text-[12px] tabular-nums text-muted-foreground shrink-0">{fmtMoney(price, currency)}</span>}
                              {isChanged && (
                                <button
                                  type="button"
                                  onClick={() => resetRows([r])}
                                  title="Back to inherited"
                                  aria-label="Back to inherited"
                                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <VisibilitySwitch on={on} onChange={(v) => setRowsVisible([r], v)} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {campaign.tabs.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[12px] text-muted-foreground">The sheet has no products yet.</div>
      )}
      {campaign.tabs.length > 0 && all.filter(passes).length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[12px] text-muted-foreground">Nothing matches.</div>
      )}
    </div>
  );
}

function BulkButtons({ onShow, onHide, onReset, small }: { onShow: () => void; onHide: () => void; onReset?: () => void; small?: boolean }) {
  const h = small ? "h-7" : "h-8";
  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" size="sm" variant="outline" onClick={onShow} className={cn(h, "text-[12px]")}>
        <Eye className="w-3.5 h-3.5" /> Show all
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onHide} className={cn(h, "text-[12px]")}>
        <EyeOff className="w-3.5 h-3.5" /> Hide all
      </Button>
      {onReset && (
        <Button type="button" size="sm" variant="ghost" onClick={onReset} className={cn(h, "text-[12px] text-muted-foreground")}>
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </Button>
      )}
    </div>
  );
}

// The per-row control: a labelled switch that always reads as the customer sees
// it — green "Visible" or grey "Hidden".
function VisibilitySwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border pl-1 pr-2.5 h-7 text-[11px] font-semibold transition-colors shrink-0",
        on
          ? "border-lime-500/40 bg-lime-500/12 text-lime-700 dark:text-lime-400"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-lime-500" : "bg-muted-foreground/30")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="w-11 text-left">{on ? "Visible" : "Hidden"}</span>
    </button>
  );
}
