"use client";

// One customer: the inheritance ladder (Customer → Country → Market → Campaign), the
// effective summary with provenance, and their campaign-specific rule editor
// (manual market / country, config overrides). Also the directory-owned bits: manual
// pin and country fix, refresh from Metakocka.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Check, RefreshCw, MapPin, Trash2, ExternalLink, Link2, Eye, AlertTriangle, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from "@/components/ui/drawer";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MarketChip, SourceBadge, SubmissionStageBadge } from "@/app/preorder/preorder-badges";
import { flagEmoji } from "@/lib/countries-client";
import { resolveEffectiveCampaign, resolvePartnerContext } from "@/lib/preorder-effective";
import type { CustomerRow } from "@/lib/preorder-customers";
import type { MkPricelist } from "@/types/documents";
import { type CommercialConfig, type CustomerRule, type EffectiveMeta, type PreorderCampaignAdmin } from "@/types/preorder";
import { CommercialConfigForm } from "./commercial-config-form";

type Detail = {
  customer: CustomerRow | null;
  rule: CustomerRule | null;
  effective: EffectiveMeta;
  effectiveTabs: { id: string; name: string; rows: number; tiers: unknown[] }[];
};

export type RuleDraft = { marketId: string | null; countryIso: string | null; note: string; config: CommercialConfig };

export function CustomerDrawer({
  open,
  onOpenChange,
  campaignId,
  campaign,
  partnerMkId,
  countryNames,
  pricelists,
  inviteUrl,
  pickingPin,
  onPickPin,
  pickedPin,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaignId: string;
  campaign: PreorderCampaignAdmin;
  partnerMkId: string | null;
  countryNames: Record<string, string>;
  pricelists: MkPricelist[];
  inviteUrl: string | null;
  pickingPin: boolean;
  onPickPin: (on: boolean) => void;
  pickedPin: { lat: number; lng: number } | null;
  onSaved: () => void; // parent reloads campaign + geo
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft>({ marketId: null, countryIso: null, note: "", config: {} });
  const [hasRule, setHasRule] = useState(false);
  const [saving, setSaving] = useState<null | "rule" | "remove" | "refresh" | "pin" | "country">(null);
  const [pin, setPin] = useState<{ lat: string; lng: string }>({ lat: "", lng: "" });

  const load = useCallback(async () => {
    if (!partnerMkId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}/customers/${encodeURIComponent(partnerMkId)}`, { cache: "no-store" });
      const j = (await r.json()) as Detail & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Failed to load");
      setDetail(j);
      setHasRule(!!j.rule);
      setDraft({ marketId: j.rule?.marketId ?? null, countryIso: j.rule?.countryIso ?? null, note: j.rule?.note ?? "", config: j.rule?.config ?? {} });
      setPin({ lat: j.customer?.manualGeo ? String(j.customer.manualGeo.lat) : "", lng: j.customer?.manualGeo ? String(j.customer.manualGeo.lng) : "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [campaignId, partnerMkId]);

  useEffect(() => {
    if (open && partnerMkId) void load();
  }, [open, partnerMkId, load]);

  useEffect(() => {
    if (pickedPin) setPin({ lat: pickedPin.lat.toFixed(5), lng: pickedPin.lng.toFixed(5) });
  }, [pickedPin]);

  const customer = detail?.customer ?? null;

  // What this customer inherits = the campaign resolved WITHOUT their rule, at their
  // effective country (manual country from the draft applies).
  const inherited = useMemo(() => {
    if (!partnerMkId) return null;
    const base = { ...campaign, customerRules: campaign.customerRules.filter((r) => r.partnerMkId !== partnerMkId) };
    const withCountry = draft.countryIso
      ? { ...base, customerRules: [...base.customerRules, { partnerMkId, partnerName: "", countryIso: draft.countryIso, config: {} }] }
      : base;
    const mkIso = customer?.countrySource === "manual" ? null : customer?.countryIso ?? null;
    const ctx = resolvePartnerContext(withCountry, partnerMkId, mkIso, mkIso ? (customer?.countrySource === "home-fallback" ? "home-fallback" : "mk") : null);
    // A manual market assignment on the draft changes what is inherited from the market layer.
    const marketAssigned = draft.marketId
      ? { ...withCountry, customerRules: [...withCountry.customerRules.filter((r) => r.partnerMkId !== partnerMkId), { partnerMkId, partnerName: "", marketId: draft.marketId, countryIso: draft.countryIso, config: {} }] }
      : withCountry;
    return resolveEffectiveCampaign(marketAssigned, ctx);
  }, [campaign, partnerMkId, draft.countryIso, draft.marketId, customer]);

  const saveRule = async () => {
    if (!partnerMkId) return;
    setSaving("rule");
    setError(null);
    try {
      const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}/customers/${encodeURIComponent(partnerMkId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerName: customer?.name, marketId: draft.marketId, countryIso: draft.countryIso, note: draft.note || null, config: draft.config }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Save failed");
      onSaved();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const removeRule = async () => {
    if (!partnerMkId) return;
    setSaving("remove");
    try {
      await fetch(`/api/admin/preorder/campaigns/${campaignId}/customers/${encodeURIComponent(partnerMkId)}`, { method: "DELETE" });
      onSaved();
      await load();
    } finally {
      setSaving(null);
    }
  };

  const refreshFromMk = async () => {
    if (!partnerMkId) return;
    setSaving("refresh");
    try {
      const r = await fetch(`/api/admin/preorder/customers/${encodeURIComponent(partnerMkId)}`, { method: "POST" });
      if (!r.ok) throw new Error("Partner not found in Metakocka");
      onSaved();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setSaving(null);
    }
  };

  const savePin = async (clear = false) => {
    if (!partnerMkId) return;
    setSaving("pin");
    setError(null);
    try {
      const body = clear ? { manualGeo: null } : { manualGeo: { lat: Number(pin.lat), lng: Number(pin.lng) } };
      const r = await fetch(`/api/admin/preorder/customers/${encodeURIComponent(partnerMkId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Could not save the pin");
      onPickPin(false);
      onSaved();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the pin");
    } finally {
      setSaving(null);
    }
  };

  const saveDirectoryCountry = async (iso: string | null) => {
    if (!partnerMkId) return;
    setSaving("country");
    try {
      await fetch(`/api/admin/preorder/customers/${encodeURIComponent(partnerMkId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countryIsoManual: iso }) });
      onSaved();
      await load();
    } finally {
      setSaving(null);
    }
  };

  const eff = inherited?.effective;
  const marketOptions = campaign.markets;
  const countryOptions = Object.entries(countryNames).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onPickPin(false); onOpenChange(o); }} widthClassName="w-[500px] max-w-full">
      <DrawerHeader
        title={customer?.name ?? (loading ? "Loading…" : "Customer")}
        description={
          customer ? (
            <span className="inline-flex items-center gap-1.5">
              {customer.city ? `${customer.city}, ` : ""}{customer.countryIso ? `${flagEmoji(customer.countryIso)} ${customer.countryName}` : <span className="text-amber-600 dark:text-amber-400">country unknown</span>}
              {customer.countCode && <span className="font-mono text-[10px]">· {customer.countCode}</span>}
            </span>
          ) : undefined
        }
      />
      <DrawerBody className="space-y-5">
        {loading && !detail ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <SkeletonLine lh="h-[18px]" w="w-32" delay={stagger(i)} />
                <Skeleton className="h-8 w-full rounded-md" delay={stagger(i, 80, 30)} />
              </div>
            ))}
          </div>
        ) : error && !detail ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive">{error}</div>
        ) : customer && eff ? (
          <>
            {/* status strip */}
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div className="rounded-lg border border-border bg-surface px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Campaign access</div>
                <div className="mt-1 flex items-center gap-1.5">
                  {customer.access ? <span className="inline-flex items-center gap-1 text-lime-700 dark:text-lime-400 font-medium"><Check className="w-3.5 h-3.5" /> Unlocked</span> : <span className="text-muted-foreground">Not unlocked</span>}
                </div>
                {!customer.access && inviteUrl && (
                  <button type="button" onClick={() => navigator.clipboard?.writeText(inviteUrl)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                    <Link2 className="w-3 h-3" /> Copy invite link
                  </button>
                )}
              </div>
              <div className="rounded-lg border border-border bg-surface px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Preorder</div>
                <div className="mt-1 flex items-center gap-1.5">
                  {customer.stage ? <SubmissionStageBadge stage={customer.stage} /> : <span className="text-muted-foreground">None</span>}
                  {customer.submissionId && (
                    <Link href={`/preorder/${campaignId}/submissions/${customer.submissionId}`} className="text-muted-foreground hover:text-foreground" aria-label="Open preorder">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* inheritance ladder */}
            <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Inheritance</div>
              <ol className="space-y-1 text-[12px]">
                <li className="flex items-center gap-2">
                  <span className={cn("size-1.5 rounded-full", hasRule ? "bg-lime-500" : "bg-muted-foreground/30")} />
                  <span className={hasRule ? "font-medium text-foreground" : "text-muted-foreground"}>{customer.name}</span>
                  {hasRule && <SourceBadge source="customer" />}
                </li>
                <li className="flex items-center gap-2 pl-3">
                  <span className="size-1.5 rounded-full bg-muted-foreground/30" />
                  <span className="text-foreground">{eff.countryIso ? `${flagEmoji(eff.countryIso)} ${countryNames[eff.countryIso] ?? eff.countryIso}` : "Country unknown"}</span>
                  {eff.countrySource === "manual" && <span className="text-[10px] text-muted-foreground">manual</span>}
                  {eff.countrySource === "home-fallback" && <span className="text-[10px] text-muted-foreground">home country</span>}
                </li>
                <li className="flex items-center gap-2 pl-6">
                  <span className={cn("size-1.5 rounded-full", eff.market ? "bg-sky-500" : "bg-muted-foreground/30")} />
                  {eff.market ? <MarketChip name={eff.market.name} color={eff.market.color} /> : <span className="text-muted-foreground">No market</span>}
                  {eff.marketSource === "manual" && <span className="text-[10px] text-muted-foreground">assigned manually</span>}
                </li>
                <li className="flex items-center gap-2 pl-9">
                  <span className="size-1.5 rounded-full bg-muted-foreground/30" />
                  <span className="text-muted-foreground">Campaign default</span>
                </li>
              </ol>
            </div>

            {/* effective summary */}
            <div className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[12px] space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Effective configuration</div>
              <Row label="Price list" value={inherited.partnerPricelist ?? "sheet prices"} source={detail?.effective.sources.pricelist ?? eff.sources.pricelist} />
              <Row label="Currency" value={inherited.currency} source={detail?.effective.sources.currency ?? eff.sources.currency} />
              <Row label="Products" value={`${detail?.effectiveTabs.reduce((n, t) => n + t.rows, 0) ?? 0} visible`} source={detail?.effective.assortment.hidden || detail?.effective.assortment.exposed ? (detail.effective.hasCustomerRule && (draft.config.hiddenIds || draft.config.exposedIds) ? "customer" : "market") : "campaign"} />
              <Row label="Discounts" value={Object.values(detail?.effective.sources.tiers ?? {}).includes("customer") ? "customer tiers" : Object.values(detail?.effective.sources.tiers ?? {}).includes("market") ? `${eff.market?.name ?? "market"} tiers` : "campaign tiers"} source={Object.values(detail?.effective.sources.tiers ?? {}).includes("customer") ? "customer" : Object.values(detail?.effective.sources.tiers ?? {}).includes("market") ? "market" : "campaign"} />
              {(detail?.effective.warnings.length ?? 0) > 0 && (
                <div className="pt-1 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{detail!.effective.warnings.join(" · ")}</span>
                </div>
              )}
              <div className="pt-1">
                <Link href={`/preorder/${campaignId}/preview?partner=${encodeURIComponent(customer.partnerMkId)}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-lime-700 dark:text-lime-400 hover:underline">
                  <Eye className="w-3.5 h-3.5" /> Open preview as this customer
                </Link>
              </div>
            </div>

            {/* placement */}
            <div className="rounded-lg border border-border bg-surface px-3 py-2.5 space-y-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Placement</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Market</label>
                  <Select value={draft.marketId ?? "__auto__"} onValueChange={(v) => setDraft({ ...draft, marketId: v === "__auto__" ? null : v })}>
                    <SelectTrigger size="sm" className="mt-1 h-8 text-[12px] w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__" className="text-[12px]">By country (automatic)</SelectItem>
                      {marketOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-[12px]">{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Country (this campaign)</label>
                  <Select value={draft.countryIso ?? "__mk__"} onValueChange={(v) => setDraft({ ...draft, countryIso: v === "__mk__" ? null : v })}>
                    <SelectTrigger size="sm" className="mt-1 h-8 text-[12px] w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__mk__" className="text-[12px]">From Metakocka ({customer.countryIso ?? "unknown"})</SelectItem>
                      {countryOptions.map(([iso, name]) => (
                        <SelectItem key={iso} value={iso} className="text-[12px]">{flagEmoji(iso)} {name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!customer.countryIso && (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/50 px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                  Metakocka has no usable country for this partner ({customer.countryRaw ? `“${customer.countryRaw}”` : "empty"}). Fix it for every campaign:
                  <Select value="" onValueChange={(v) => void saveDirectoryCountry(v)}>
                    <SelectTrigger size="sm" className="mt-1.5 h-7 text-[11px] w-full bg-background"><SelectValue placeholder="Set country in the directory…" /></SelectTrigger>
                    <SelectContent>
                      {countryOptions.map(([iso, name]) => (
                        <SelectItem key={iso} value={iso} className="text-[12px]">{flagEmoji(iso)} {name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Internal note</label>
                <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Why this customer is special…" className="mt-1 h-8 text-[12px]" />
              </div>
            </div>

            {/* overrides */}
            <CommercialConfigForm value={draft.config} onChange={(config) => setDraft({ ...draft, config })} inherited={inherited} campaign={campaign} pricelists={pricelists} layer="customer" />

            {/* pin */}
            <div className="rounded-lg border border-border bg-surface px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Map pin</div>
                <div className="flex-1" />
                <button type="button" onClick={refreshFromMk} disabled={saving !== null} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  {saving === "refresh" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh from Metakocka
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">Metakocka has no coordinates; without a pin the customer is counted at the country&rsquo;s centre.</p>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                <Input value={pin.lat} onChange={(e) => setPin({ ...pin, lat: e.target.value })} placeholder="Latitude" className="h-8 text-[12px] tabular-nums" />
                <Input value={pin.lng} onChange={(e) => setPin({ ...pin, lng: e.target.value })} placeholder="Longitude" className="h-8 text-[12px] tabular-nums" />
                <Button size="sm" variant={pickingPin ? "default" : "outline"} className="h-8" onClick={() => onPickPin(!pickingPin)} title="Click the map to place the pin">
                  <Crosshair className="w-3.5 h-3.5" /> {pickingPin ? "Click map…" : "Pick on map"}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button size="xs" onClick={() => savePin(false)} disabled={saving !== null || !pin.lat || !pin.lng}>
                  {saving === "pin" ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />} Save pin
                </Button>
                {customer.manualGeo && (
                  <Button size="xs" variant="ghost" onClick={() => savePin(true)} disabled={saving !== null}>
                    <Trash2 className="w-3 h-3" /> Remove pin
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : null}
      </DrawerBody>
      <DrawerFooter>
        {error && detail && <p className="text-[12px] text-destructive mb-2">{error}</p>}
        <div className="flex items-center gap-2">
          {hasRule && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={removeRule} disabled={saving !== null}>
              {saving === "remove" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Remove overrides
            </Button>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving !== null}>Close</Button>
          <Button size="sm" onClick={saveRule} disabled={saving !== null || !customer}>
            {saving === "rule" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {hasRule ? "Save overrides" : "Save as override"}
          </Button>
        </div>
      </DrawerFooter>
    </Drawer>
  );
}

function Row({ label, value, source }: { label: string; value: string; source: "campaign" | "market" | "customer" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-foreground truncate">{value}</span>
      <SourceBadge source={source} className="ml-auto" />
    </div>
  );
}
