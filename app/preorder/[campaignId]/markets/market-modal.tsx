"use client";

// Create / edit one market in the same large tabbed modal as a customer:
// Market (name, colour, countries) · Pricing & terms · Volume discounts ·
// Assortment — the last three are slices of CommercialConfigForm, inheriting
// from the campaign defaults. One draft, one Save.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Check, Globe2, Wallet, Percent, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorModal, EditorModalBody, EditorModalFooter, EditorModalHeader } from "@/components/ui/editor-modal";
import { cn } from "@/lib/utils";
import { MARKET_COLORS } from "@/app/preorder/preorder-badges";
import { resolveEffectiveCampaign } from "@/lib/preorder-effective";
import type { CountryGeo } from "@/lib/preorder-customers";
import { MARKET_COLOR_KEYS, type CommercialConfig, type MarketColor, type PreorderCampaignAdmin, type PreorderMarket } from "@/types/preorder";
import type { MkPricelist } from "@/types/documents";
import { CommercialConfigForm, configSectionCounts } from "./commercial-config-form";
import { CountryPicker } from "./country-picker";

export type MarketDraft = { id: string | null; name: string; color: MarketColor; countries: string[]; config: CommercialConfig };

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
                  <label className="text-[12px] font-medium text-foreground">Name</label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. DACH, Adriatic, Nordics"
                    className="mt-1.5 h-10 text-[13px]"
                    autoFocus={!market}
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-foreground">Colour</label>
                  <div className="mt-1.5 flex items-center gap-1.5 h-10">
                    {MARKET_COLOR_KEYS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setDraft({ ...draft, color: c })}
                        className={cn("size-7 rounded-full border-2 transition-transform", draft.color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105")}
                        style={{ background: MARKET_COLORS[c].hex }}
                        aria-label={c}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <label className="text-[12px] font-medium text-foreground">Countries</label>
                  <span className="text-[12px] text-muted-foreground tabular-nums">{draft.countries.length}</span>
                  <div className="flex-1" />
                  <span className="text-[11px] text-muted-foreground">A country belongs to one market — adding it here moves it.</span>
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
  if (market) return { id: market.id, name: market.name, color: market.color, countries: [...market.countries], config: { ...market.config } };
  const used = new Set(campaign.markets.map((m) => m.color));
  const color = MARKET_COLOR_KEYS.find((c) => !used.has(c)) ?? MARKET_COLOR_KEYS[campaign.markets.length % MARKET_COLOR_KEYS.length];
  return { id: null, name: "", color, countries: [...seed], config: {} };
}
