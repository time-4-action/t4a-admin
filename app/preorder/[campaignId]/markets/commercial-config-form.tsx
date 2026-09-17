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
import { activeTiers, flattenRows, type CommercialConfig, type ConfigSource, type EffectiveCampaign, type PreorderCampaign, type PreorderTier } from "@/types/preorder";
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

type Tri = "inherit" | "hidden" | "exposed";

function AssortmentEditor({ value, onChange, inherited, campaign }: Pick<ConfigFormProps, "value" | "onChange" | "inherited" | "campaign">) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const hidden = useMemo(() => new Set(value.hiddenIds ?? []), [value.hiddenIds]);
  const exposed = useMemo(() => new Set(value.exposedIds ?? []), [value.exposedIds]);
  const inheritedVisible = useMemo(() => new Set(flattenRows(inherited).map((r) => r.row.id)), [inherited]);

  const stateOf = (id: string): Tri => (hidden.has(id) ? "hidden" : exposed.has(id) ? "exposed" : "inherit");
  const setState = (id: string, s: Tri) => {
    const h = new Set(hidden);
    const e = new Set(exposed);
    h.delete(id);
    e.delete(id);
    if (s === "hidden") h.add(id);
    if (s === "exposed") e.add(id);
    const next = { ...value };
    if (h.size || value.hiddenIds !== undefined) next.hiddenIds = Array.from(h);
    if (e.size || value.exposedIds !== undefined) next.exposedIds = Array.from(e);
    if (!h.size && !e.size) {
      delete next.hiddenIds;
      delete next.exposedIds;
    }
    onChange(next);
  };
  const toggle = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const needle = q.trim().toLowerCase();
  const match = (s: string | null | undefined) => !needle || (s ?? "").toLowerCase().includes(needle);
  const total = flattenRows(campaign).length;
  const overrides = hidden.size + exposed.size;
  const visibleNow = inheritedVisible.size;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{visibleNow} of {total} rows visible when inheriting</span>
        {overrides > 0 && <span className="rounded-full bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300 px-2 py-0.5 font-medium">{overrides} override{overrides === 1 ? "" : "s"}</span>}
        <div className="flex-1" />
        {overrides > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => { const n = { ...value }; delete n.hiddenIds; delete n.exposedIds; onChange(n); }} className="h-7 text-[12px] text-muted-foreground">
            <RotateCcw className="w-3.5 h-3.5" /> Reset all
          </Button>
        )}
      </div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find product / SKU…" className="h-8 pl-8 text-[12px]" />
      </div>
      <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
        {campaign.tabs.map((tab) => {
          const rows = tab.groups.flatMap((g) => g.rows);
          const tabMatches = match(tab.name) || rows.some((r) => match(r.name) || match(r.code) || match(r.variantLabel));
          if (!tabMatches) return null;
          const isOpen = open.has(tab.id) || !!needle;
          const vis = rows.filter((r) => inheritedVisible.has(r.id)).length;
          return (
            <div key={tab.id}>
              <NodeRow
                depth={0}
                label={tab.name}
                meta={`${vis}/${rows.length} visible`}
                state={stateOf(tab.id)}
                onState={(s) => setState(tab.id, s)}
                expandable
                open={isOpen}
                onToggle={() => toggle(tab.id)}
              />
              {isOpen &&
                tab.groups.map((g) => {
                  const gm = match(g.name) || g.rows.some((r) => match(r.name) || match(r.code) || match(r.variantLabel));
                  if (!gm) return null;
                  const gOpen = open.has(g.id) || !!needle;
                  const gvis = g.rows.filter((r) => inheritedVisible.has(r.id)).length;
                  return (
                    <div key={g.id}>
                      <NodeRow
                        depth={1}
                        label={g.name}
                        meta={`${gvis}/${g.rows.length}`}
                        state={stateOf(g.id)}
                        onState={(s) => setState(g.id, s)}
                        expandable
                        open={gOpen}
                        onToggle={() => toggle(g.id)}
                      />
                      {gOpen &&
                        g.rows
                          .filter((r) => !needle || match(r.name) || match(r.code) || match(r.variantLabel))
                          .map((r) => (
                            <NodeRow
                              key={r.id}
                              depth={2}
                              label={[r.name, r.variantLabel].filter(Boolean).join(" · ")}
                              meta={r.code}
                              restricted={!!r.restricted}
                              inheritedVisible={inheritedVisible.has(r.id)}
                              state={stateOf(r.id)}
                              onState={(s) => setState(r.id, s)}
                            />
                          ))}
                    </div>
                  );
                })}
            </div>
          );
        })}
        {campaign.tabs.length === 0 && <div className="px-3 py-4 text-[12px] text-muted-foreground">The sheet has no products yet.</div>}
      </div>
    </div>
  );
}

function NodeRow({
  depth,
  label,
  meta,
  state,
  onState,
  expandable,
  open,
  onToggle,
  restricted,
  inheritedVisible,
}: {
  depth: number;
  label: string;
  meta?: string;
  state: Tri;
  onState: (s: Tri) => void;
  expandable?: boolean;
  open?: boolean;
  onToggle?: () => void;
  restricted?: boolean;
  inheritedVisible?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2 px-2 py-1.5 text-[12px]", depth === 0 ? "bg-muted/30" : "", state !== "inherit" && "bg-lime-50/60 dark:bg-lime-950/20")} style={{ paddingLeft: 8 + depth * 16 }}>
      {expandable ? (
        <button type="button" onClick={onToggle} className="p-0.5 text-muted-foreground hover:text-foreground" aria-label={open ? "Collapse" : "Expand"}>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      ) : (
        <span className={cn("w-4 flex justify-center", inheritedVisible === false ? "text-muted-foreground/50" : "text-lime-600")} title={inheritedVisible === false ? "Hidden when inheriting" : "Visible when inheriting"}>
          {inheritedVisible === false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </span>
      )}
      <span className={cn("truncate", depth === 0 ? "font-medium text-foreground" : depth === 1 ? "text-foreground" : "text-foreground/90", inheritedVisible === false && state === "inherit" && "text-muted-foreground")}>{label}</span>
      {restricted && <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 px-1.5 py-px text-[10px] font-medium shrink-0">restricted</span>}
      {meta && <span className="text-[10px] text-muted-foreground font-mono shrink-0">{meta}</span>}
      <div className="flex-1" />
      <div className="inline-flex rounded-md border border-border overflow-hidden shrink-0">
        {(["inherit", "hidden", "exposed"] as Tri[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onState(s)}
            className={cn(
              "px-1.5 h-5 text-[10px] font-medium transition-colors",
              state === s
                ? s === "hidden"
                  ? "bg-rose-500 text-white"
                  : s === "exposed"
                    ? "bg-lime-600 text-white"
                    : "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {s === "inherit" ? "Inherit" : s === "hidden" ? "Hide" : "Show"}
          </button>
        ))}
      </div>
    </div>
  );
}
