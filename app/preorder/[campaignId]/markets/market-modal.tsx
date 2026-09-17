"use client";

// Create / edit one market in the same large tabbed modal as a customer:
// Market (name, colour, countries) · Pricing & terms · Volume discounts ·
// Assortment — the last three are slices of CommercialConfigForm, inheriting
// from the campaign defaults. One draft, one Save.

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2, Check, Globe2, Wallet, Percent, Boxes, X, Building2, User } from "lucide-react";
import { Flag } from "@/components/flag";
import { TagField } from "@/components/ui/tag-field";
import type { MkCustomerView } from "@/lib/mk-customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorModal, EditorModalBody, EditorModalFooter, EditorModalHeader } from "@/components/ui/editor-modal";
import { cn } from "@/lib/utils";
import { MARKET_COLORS } from "@/app/preorder/preorder-badges";
import { resolveEffectiveCampaign } from "@/lib/preorder-effective";
import type { CountryGeo } from "@/lib/preorder-customers";
import { MARKET_COLOR_KEYS, type CommercialConfig, type MarketColor, type MarketKind, type PreorderCampaignAdmin, type PreorderMarket } from "@/types/preorder";
import type { MkPricelist } from "@/types/documents";
import { CommercialConfigForm, configSectionCounts } from "./commercial-config-form";
import { CountryPicker } from "./country-picker";

// A customer pinned to the market by hand (a customer rule with marketId) — on
// top of everyone the market's countries bring in automatically.
export type MarketCustomer = { partnerMkId: string; partnerName: string };

export type MarketDraft = {
  id: string | null;
  name: string;
  color: MarketColor;
  countries: string[];
  kinds: MarketKind[]; // [] = companies and individuals alike
  customers: MarketCustomer[];
  config: CommercialConfig;
};

export function MarketModal({
  open,
  onOpenChange,
  campaign,
  market,
  seedCountries,
  countryNames,
  stats,
  pricelists,
  customerCount,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaign: PreorderCampaignAdmin;
  market: PreorderMarket | null; // null = create
  seedCountries: string[];
  countryNames: Record<string, string>;
  stats: Record<string, CountryGeo>;
  pricelists: MkPricelist[];
  customerCount: number;
  onSave: (draft: MarketDraft) => Promise<string | null>; // returns an error message or null
  onDelete: (id: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<MarketDraft>(() => toDraft(market, seedCountries, campaign));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<MarketTab>("market");

  useEffect(() => {
    if (open) {
      setDraft(toDraft(market, seedCountries, campaign));
      setError(null);
      setConfirmDelete(false);
      setTab("market");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, market?.id]);

  // What this market inherits = the campaign defaults (no market, no rule).
  const inherited = useMemo(
    () => resolveEffectiveCampaign({ ...campaign, markets: [], customerRules: [] }, { partnerMkId: "__market__", countryIso: null, countrySource: null }),
    [campaign],
  );

  const save = async () => {
    if (!draft.name.trim()) {
      setError("Give the market a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const err = await onSave(draft);
    setSaving(false);
    if (err) setError(err);
    else onOpenChange(false);
  };

  const counts = configSectionCounts(draft.config);
  const tabs: { id: MarketTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "market", label: "Market", icon: Globe2 },
    { id: "commercial", label: "Pricing & terms", icon: Wallet, count: counts.commercial },
    { id: "tiers", label: "Volume discounts", icon: Percent, count: counts.tiers },
    { id: "assortment", label: "Assortment", icon: Boxes, count: counts.assortment },
  ];

  return (
    <EditorModal open={open} onOpenChange={onOpenChange}>
      <EditorModalHeader
        leading={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${MARKET_COLORS[draft.color].hex}22` }}>
            <span className="size-4 rounded-full" style={{ background: MARKET_COLORS[draft.color].hex }} />
          </span>
        }
        title={draft.name.trim() || (market ? market.name : "New market")}
        description={
          market
            ? `${customerCount} customer${customerCount === 1 ? "" : "s"} · ${draft.countries.length} countr${draft.countries.length === 1 ? "y" : "ies"}`
            : "A market groups countries that share prices, terms, discounts and assortment."
        }
      />

      <EditorModalBody className="flex flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-6">
          <div className="flex items-end gap-1 -mb-px overflow-x-auto">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-2 border-b-2 px-3 h-11 text-[13px] whitespace-nowrap transition-colors",
                    active ? "border-lime-500 text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                  {!!t.count && (
                    <span className="rounded-full bg-lime-500/15 text-lime-700 dark:text-lime-400 px-1.5 text-[10px] font-semibold tabular-nums">{t.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {tab === "market" && (
            <div className="space-y-6 max-w-[760px]">
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-5 items-start">
                <div>
                  <div className="text-[12px] font-medium text-foreground">Name</div>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. DACH, Adriatic, Nordics"
                    className="mt-1.5 h-10 text-[13px]"
                    autoFocus={!market}
                  />
                </div>
                <div>
                  <div className="text-[12px] font-medium text-foreground">Colour</div>
                  <div className="mt-1.5 flex items-center gap-1.5 h-10">
                    {MARKET_COLOR_KEYS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setDraft({ ...draft, color: c })}
                        className={cn("size-7 rounded-full border-2 transition-transform", draft.color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105")}
                        style={{ background: MARKET_COLORS[c].hex }}
                        aria-label={MARKET_COLORS[c].label}
                        title={MARKET_COLORS[c].label}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[12px] font-medium text-foreground">Who is in this market</div>
                <div className="mt-1.5 inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
                  {(
                    [
                      ["all", "Everyone", null],
                      ["business", "Companies only", Building2],
                      ["person", "Individuals only", User],
                    ] as ["all" | MarketKind, string, React.ElementType | null][]
                  ).map(([key, label, Icon]) => {
                    const on = key === "all" ? draft.kinds.length === 0 : draft.kinds.length === 1 && draft.kinds[0] === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDraft({ ...draft, kinds: key === "all" ? [] : [key] })}
                        className={cn(
                          "inline-flex items-center gap-1.5 h-8 rounded-md px-3 text-[12px] font-medium transition-colors",
                          on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {Icon && <Icon className="w-3.5 h-3.5" />} {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Company = has a tax id in Metakocka. Everyone else is an individual.</p>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <label className="text-[12px] font-medium text-foreground">Countries</label>
                  <span className="text-[12px] text-muted-foreground tabular-nums">{draft.countries.length}</span>
                  <div className="flex-1" />
                  <span className="text-[11px] text-muted-foreground">
                    {draft.countries.length === 0 && draft.kinds.length > 0 ? "None — any country." : "A customer who fits several markets lands in the one with higher priority."}
                  </span>
                </div>
                <div className="mt-2">
                  <CountryPicker
                    value={draft.countries}
                    onChange={(countries) => setDraft({ ...draft, countries })}
                    countryNames={countryNames}
                    stats={stats}
                    markets={campaign.markets}
                    currentMarketId={market?.id ?? null}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <label className="text-[12px] font-medium text-foreground">Market customers</label>
                  <span className="text-[12px] text-muted-foreground tabular-nums">{draft.customers.length}</span>
                  <div className="flex-1" />
                  <span className="text-[11px] text-muted-foreground">Customers placed in this market by hand — they stay here whatever their country, kind or the priority order.</span>
                </div>
                <div className="mt-2">
                  <CustomerPicker
                    value={draft.customers}
                    onChange={(customers) => setDraft({ ...draft, customers })}
                    campaign={campaign}
                    currentMarketId={market?.id ?? null}
                    countryNames={countryNames}
                    marketCountries={draft.countries}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === "commercial" && (
            <div className="space-y-5">
              <TabIntro title="Pricing & terms" hint="What every customer in this market gets unless their own rule says otherwise. Anything left inherited follows the campaign." />
              <CommercialConfigForm section="commercial" value={draft.config} onChange={(config) => setDraft({ ...draft, config })} inherited={inherited} campaign={campaign} pricelists={pricelists} layer="market" />
            </div>
          )}
          {tab === "tiers" && (
            <div className="space-y-5">
              <TabIntro title="Volume discounts" hint="Per sheet tab: the discount ladder this market gets. Override a tab to give the market its own ladder." />
              <CommercialConfigForm section="tiers" value={draft.config} onChange={(config) => setDraft({ ...draft, config })} inherited={inherited} campaign={campaign} pricelists={pricelists} layer="market" />
            </div>
          )}
          {tab === "assortment" && (
            <div className="space-y-5">
              <TabIntro title="Assortment" hint="Which products customers in this market can order." />
              <CommercialConfigForm section="assortment" value={draft.config} onChange={(config) => setDraft({ ...draft, config })} inherited={inherited} campaign={campaign} pricelists={pricelists} layer="market" />
            </div>
          )}
        </div>
      </EditorModalBody>

      <EditorModalFooter>
        <div className="flex items-center gap-2">
          {market &&
            (confirmDelete ? (
              <>
                <span className="text-[11px] text-muted-foreground">Delete this market? Its countries fall back to campaign defaults.</span>
                <Button size="sm" variant="destructive" onClick={async () => { setSaving(true); const err = await onDelete(market.id); setSaving(false); if (err) setError(err); else onOpenChange(false); }} disabled={saving}>
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 className="w-3.5 h-3.5" /> Delete market
              </Button>
            ))}
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {market ? "Save market" : "Create market"}
          </Button>
        </div>
      </EditorModalFooter>
    </EditorModal>
  );
}

type MarketTab = "market" | "commercial" | "tiers" | "assortment";

function TabIntro({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function toDraft(market: PreorderMarket | null, seed: string[], campaign: PreorderCampaignAdmin): MarketDraft {
  if (market) {
    const customers = campaign.customerRules
      .filter((r) => r.marketId === market.id)
      .map((r) => ({ partnerMkId: r.partnerMkId, partnerName: r.partnerName }));
    return { id: market.id, name: market.name, color: market.color, countries: [...market.countries], kinds: [...(market.kinds ?? [])], customers, config: { ...market.config } };
  }
  const used = new Set(campaign.markets.map((m) => m.color));
  const color = MARKET_COLOR_KEYS.find((c) => !used.has(c)) ?? MARKET_COLOR_KEYS[campaign.markets.length % MARKET_COLOR_KEYS.length];
  return { id: null, name: "", color, countries: [...seed], kinds: [], customers: [], config: {} };
}

// Searchable directory picker for the market's hand-picked customers. Mirrors
// CountryPicker: chips of what is picked, a search box, a short result list.
function CustomerPicker({
  value,
  onChange,
  campaign,
  currentMarketId,
  countryNames,
  marketCountries,
}: {
  value: MarketCustomer[];
  onChange: (v: MarketCustomer[]) => void;
  campaign: PreorderCampaignAdmin;
  currentMarketId: string | null;
  countryNames: Record<string, string>;
  marketCountries: string[];
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MkCustomerView[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Where a customer sits today, by hand: partnerMkId → market name.
  const pinnedTo = useMemo(() => {
    const byId = new Map(campaign.markets.map((m) => [m.id, m.name]));
    const out = new Map<string, string>();
    for (const r of campaign.customerRules) if (r.marketId && r.marketId !== currentMarketId) out.set(r.partnerMkId, byId.get(r.marketId) ?? "another market");
    return out;
  }, [campaign, currentMarketId]);
  const countryOf = useMemo(() => new Map(campaign.markets.flatMap((m) => m.countries.map((iso) => [iso, m.name] as const))), [campaign]);
  const inCountries = new Set(marketCountries);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/preorder/customers?q=${encodeURIComponent(query)}&pageSize=8`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => !cancelled && setResults((j.items ?? []) as MkCustomerView[]))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);
  useEffect(() => setActive(0), [results]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const picked = new Set(value.map((c) => c.partnerMkId));
  const options = results.filter((c) => !picked.has(c.partnerMkId));
  const add = (c: MkCustomerView) => {
    onChange([...value, { partnerMkId: c.partnerMkId, partnerName: c.name }]);
    setQ("");
    setOpen(false);
  };
  const remove = (id: string) => onChange(value.filter((c) => c.partnerMkId !== id));

  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div ref={rootRef} className="relative">
      <TagField
        inputRef={inputRef}
        chips={value.map((c) => ({
          key: c.partnerMkId,
          node: (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 h-6 text-[11px] font-medium text-foreground">
              {c.partnerName || c.partnerMkId}
              <button type="button" onClick={(e) => { e.stopPropagation(); remove(c.partnerMkId); }} className="opacity-60 hover:opacity-100" aria-label={`Remove ${c.partnerName}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ),
        }))}
        onRemoveAt={(i) => remove(value[i].partnerMkId)}
        value={q}
        onChange={(v) => {
          setQ(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
            return true;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
            return true;
          }
          if (e.key === "Enter" && q.trim() && options[active]) {
            e.preventDefault();
            add(options[active]);
            return true;
          }
          if (e.key === "Escape") {
            setOpen(false);
            return true;
          }
          return false;
        }}
        placeholder="Type a name, email or VAT id…"
      />
      <div className="relative">
        {open && q.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
            {loading && <div className="px-3 py-2 text-[12px] text-muted-foreground">Searching…</div>}
            {!loading && options.length === 0 && <div className="px-3 py-2 text-[12px] text-muted-foreground">No customers match.</div>}
            {options.map((c, i) => {
              const pinned = pinnedTo.get(c.partnerMkId);
              const viaCountry = c.countryIso ? (inCountries.has(c.countryIso) ? "already in — by country" : countryOf.get(c.countryIso)) : null;
              return (
                <button
                  key={c.partnerMkId}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(c)}
                  className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-left", i === active ? "bg-muted" : "hover:bg-muted/60")}
                >
                  <span className={cn("size-6 rounded-md flex items-center justify-center shrink-0", c.taxId ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : "bg-muted text-muted-foreground")}>
                    {c.taxId ? <Building2 className="w-3 h-3" /> : <User className="w-3 h-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-foreground truncate">{c.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {[c.city, c.email].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {c.countryIso && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                      <Flag iso={c.countryIso} /> {countryNames[c.countryIso] ?? c.countryIso}
                    </span>
                  )}
                  {pinned ? (
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 shrink-0">pinned to {pinned} — moves here</span>
                  ) : viaCountry ? (
                    <span className="text-[10px] text-muted-foreground shrink-0">{viaCountry === "already in — by country" ? viaCountry : `in ${viaCountry} by country`}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
