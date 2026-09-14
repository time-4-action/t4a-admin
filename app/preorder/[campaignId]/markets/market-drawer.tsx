"use client";

// Create / edit one market: name, colour, countries, and its configuration layer
// (inherits from the campaign defaults).

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Check, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { MARKET_COLORS } from "@/app/preorder/preorder-badges";
import { flagEmoji } from "@/lib/countries-client";
import { resolveEffectiveCampaign } from "@/lib/preorder-effective";
import { MARKET_COLOR_KEYS, type CommercialConfig, type MarketColor, type PreorderCampaignAdmin, type PreorderMarket } from "@/types/preorder";
import type { MkPricelist } from "@/types/documents";
import { CommercialConfigForm } from "./commercial-config-form";

export type MarketDraft = { id: string | null; name: string; color: MarketColor; countries: string[]; config: CommercialConfig };

export function MarketDrawer({
  open,
  onOpenChange,
  campaign,
  market,
  seedCountries,
  countryNames,
  pricelists,
  customerCount,
  onSave,
  onDelete,
  onAddSelected,
  selectedCount,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaign: PreorderCampaignAdmin;
  market: PreorderMarket | null; // null = create
  seedCountries: string[];
  countryNames: Record<string, string>;
  pricelists: MkPricelist[];
  customerCount: number;
  onSave: (draft: MarketDraft) => Promise<string | null>; // returns an error message or null
  onDelete: (id: string) => Promise<string | null>;
  onAddSelected: () => void;
  selectedCount: number;
}) {
  const [draft, setDraft] = useState<MarketDraft>(() => toDraft(market, seedCountries, campaign));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(market, seedCountries, campaign));
      setError(null);
      setConfirmDelete(false);
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

  return (
    <Drawer open={open} onOpenChange={onOpenChange} widthClassName="w-[480px] max-w-full">
      <DrawerHeader
        title={market ? market.name : "New market"}
        description={market ? `${customerCount} customer${customerCount === 1 ? "" : "s"} · ${market.countries.length} countr${market.countries.length === 1 ? "y" : "ies"}` : "Group countries that share commercial rules."}
      />
      <DrawerBody className="space-y-5">
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Name</label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. DACH, Adriatic, Nordics" className="mt-1 h-9 text-[13px]" autoFocus={!market} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Colour</label>
            <div className="mt-1 flex items-center gap-1">
              {MARKET_COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraft({ ...draft, color: c })}
                  className={cn("size-6 rounded-full border-2 transition-transform", draft.color === c ? "border-foreground scale-110" : "border-transparent")}
                  style={{ background: MARKET_COLORS[c].hex }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-muted-foreground">Countries</label>
            <div className="flex-1" />
            {selectedCount > 0 && (
              <button type="button" onClick={onAddSelected} className="inline-flex items-center gap-1 text-[11px] font-medium text-lime-700 dark:text-lime-400 hover:underline">
                <Plus className="w-3 h-3" /> Add {selectedCount} selected on the map
              </button>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 min-h-[34px] rounded-lg border border-border bg-surface p-2">
            {draft.countries.length === 0 && <span className="text-[12px] text-muted-foreground">Select countries on the map, then add them here.</span>}
            {draft.countries.map((iso) => (
              <span key={iso} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                {flagEmoji(iso)} {countryNames[iso] ?? iso}
                <button type="button" onClick={() => setDraft({ ...draft, countries: draft.countries.filter((c) => c !== iso) })} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${iso}`}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        <CommercialConfigForm value={draft.config} onChange={(config) => setDraft({ ...draft, config })} inherited={inherited} campaign={campaign} pricelists={pricelists} layer="market" />
      </DrawerBody>
      <DrawerFooter>
        {error && <p className="text-[12px] text-destructive mb-2">{error}</p>}
        <div className="flex items-center gap-2">
          {market &&
            (confirmDelete ? (
              <>
                <span className="text-[11px] text-muted-foreground">Delete this market?</span>
                <Button size="sm" variant="destructive" onClick={async () => { setSaving(true); const err = await onDelete(market.id); setSaving(false); if (err) setError(err); else onOpenChange(false); }} disabled={saving}>
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            ))}
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {market ? "Save market" : "Create market"}
          </Button>
        </div>
      </DrawerFooter>
    </Drawer>
  );
}

function toDraft(market: PreorderMarket | null, seed: string[], campaign: PreorderCampaignAdmin): MarketDraft {
  if (market) return { id: market.id, name: market.name, color: market.color, countries: [...market.countries], config: { ...market.config } };
  const used = new Set(campaign.markets.map((m) => m.color));
  const color = MARKET_COLOR_KEYS.find((c) => !used.has(c)) ?? MARKET_COLOR_KEYS[campaign.markets.length % MARKET_COLOR_KEYS.length];
  return { id: null, name: "", color, countries: [...seed], config: {} };
}
