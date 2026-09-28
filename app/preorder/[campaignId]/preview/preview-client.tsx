"use client";
// Admin preview of a campaign sheet. Renders the customer's fill page piece for
// piece (app/portal/preorders/[campaignId]/fill-client.tsx, unlocked draft state):
// the same section tabs + Catalogue / Order sheet switcher, the same framed sheet
// document (SheetContextBar → products) and the same sidebar card (summary,
// minimum order, delivery & note, terms) — only the submit slot is the admin's.
// Nothing is persisted. Pick a customer and the sheet becomes THEIR effective
// campaign (market / country / customer rules applied server-side) with an
// admin-only "Effective configuration" card. Placing a preorder for a customer is NOT done here: "View as customer"
// opens the B2B portal as them (lib/portal-impersonation.ts) — one fill flow, the
// customer's own, whoever is at the keyboard.
import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Eye,
  Info,
  Pencil,
  RotateCcw,
  Search,
  UserRound,
  UserRoundSearch,
  X,
  Loader2,
  Globe2,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import {
  TabBar,
  SheetContextBar,
  FillModeNav,
  PreorderGridTab,
  PreorderGuidedTab,
  OrderSummaryPanel,
  TabBarSkeleton,
  PreorderGridSkeleton,
  OrderSummaryPanelSkeleton,
  fmtMoney,
  type FillMode,
} from "@/app/preorder/preorder-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampaignHeader } from "@/app/preorder/[campaignId]/campaign-nav";
import { MarketChip, SourceBadge, WarningList } from "@/app/preorder/preorder-badges";
import { Flag } from "@/components/flag";
import { CUSTOMER_KIND_LABELS, VAT_SOURCE_LABELS, flattenRows, type EffectiveCampaign, type PreorderCampaign, type PreorderTerms } from "@/types/preorder";
import { fmtVatRate, type PricingContext } from "@/lib/pricing";
import type { MkPartner } from "@/types/documents";

type Mode = FillMode;

// A customer always has a pricing context; the admin's raw sheet has none. With no
// customer picked the preview is shown as the common B2B case — a company,
// zero-rated — so the sheet reads exactly like a customer's (kind, VAT line,
// summary). Pick a customer for their real country / VAT / overrides.
const DEFAULT_PREVIEW_PRICING: PricingContext = { kind: "business", basis: "partner", countryIso: null, vat: { rate: 0, source: "zero-rated" } };

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

// The customer being previewed — from the MK picker or the ?partner= deep link.
type PickedPartner = { mkId: string; name: string; email?: string | null };

export default function PreviewClient({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  // The admin sheet (no partner) and, once a partner is picked, THEIR effective campaign.
  const [adminCampaign, setAdminCampaign] = useState<PreorderCampaign | null>(null);
  const [effective, setEffective] = useState<EffectiveCampaign | null>(null);
  const [effectiveLoading, setEffectiveLoading] = useState(false);
  const campaign: PreorderCampaign | null = useMemo(
    () => effective ?? (adminCampaign ? { ...adminCampaign, pricing: DEFAULT_PREVIEW_PRICING } : null),
    [effective, adminCampaign],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // The customer's two free-text fields, kept only so the sidebar reads as theirs.
  const [terms, setTerms] = useState<PreorderTerms>({});
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("grid");

  const [partner, setPartner] = useState<PickedPartner | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // "View as customer" in flight: unlocking the campaign + starting the impersonation.
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // Deep-links: ?pick=1 (overview "View as customer") opens the picker; ?partner=<mkId>
  // (customer drawer "Open preview as this customer") previews that partner directly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("pick") === "1") setPickerOpen(true);
    const pid = sp.get("partner");
    if (pid) setPartner({ mkId: pid, name: pid });
  }, []);

  useEffect(() => {
    fetch(`/api/admin/preorder/campaigns/${campaignId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "Not found");
        setAdminCampaign(data.campaign);
        setActiveTabId(data.campaign.tabs[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [campaignId]);

  // When a partner is chosen, load THEIR effective campaign (market / country / customer
  // rules applied server-side).
  useEffect(() => {
    if (!partner) {
      setEffective(null);
      return;
    }
    let alive = true;
    setEffectiveLoading(true);
    fetch(`/api/admin/preorder/campaigns/${campaignId}/effective?partnerMkId=${encodeURIComponent(partner.mkId)}`)
      .then((r) => r.json())
      .then((eff) => {
        if (!alive || !eff?.campaign) return;
        setEffective(eff.campaign);
        setActiveTabId((prev) => (prev && eff.campaign.tabs.some((t: { id: string }) => t.id === prev) ? prev : eff.campaign.tabs[0]?.id ?? null));
        if (eff.partner && (partner.name === partner.mkId || !partner.email)) {
          setPartner((p) => (p && p.mkId === eff.partner.mkId ? { ...p, name: eff.partner.name, email: eff.partner.email } : p));
        }
      })
      .catch(() => {})
      .finally(() => alive && setEffectiveLoading(false));
    return () => {
      alive = false;
    };
  }, [partner?.mkId, campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearPartner = () => {
    setPartner(null);
    setEffective(null);
    setQuantities({});
    setTerms({});
    setActiveTabId(adminCampaign?.tabs[0]?.id ?? null);
  };

  const setQty = useCallback((rowId: string, qty: number) => {
    setQuantities((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[rowId];
      else next[rowId] = qty;
      return next;
    });
  }, []);

  const activeTab = useMemo(() => campaign?.tabs.find((t) => t.id === activeTabId) ?? null, [campaign, activeTabId]);
  // Same warning the customer gets: filled rows that carry no price at all.
  const unpricedFilled = useMemo(
    () => (campaign ? flattenRows(campaign).filter(({ row }) => row.unpriced && (quantities[row.id] || 0) > 0) : []),
    [campaign, quantities],
  );

  // Open the portal as this customer, on this campaign. The portal shows a campaign
  // only to a customer with an access grant (invite link opened, or a preorder), so a
  // customer who has not opened the invite yet is unlocked first — the same grant the
  // link creates. Anything then filled and submitted is theirs, exactly as if they
  // had done it.
  const viewAs = useCallback(
    async (p: PickedPartner) => {
      setOpening(p.mkId);
      setOpenError(null);
      try {
        const a = await fetch(`/api/admin/preorder/campaigns/${campaignId}/customers/${encodeURIComponent(p.mkId)}/access`, { method: "POST" });
        if (!a.ok) {
          const j = (await a.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Could not unlock the campaign for ${p.name} (${a.status})`);
        }
        const r = await fetch("/api/admin/portal/impersonate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerMkId: p.mkId, returnTo: pathname }),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) throw new Error(j.error ?? `Could not open the portal (${r.status})`);
        router.push(`/portal/preorders/${campaignId}`);
        router.refresh();
      } catch (e) {
        setOpenError(e instanceof Error ? e.message : "Failed");
        setOpening(null);
      }
    },
    [campaignId, pathname, router],
  );

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <CampaignHeader
          campaignId={campaignId}
          active="preview"
          hideNav
          backHref={`/preorder/${campaignId}`}
          title={<SkeletonLine lh="h-[19px]" h="h-3.5" w="w-48" />}
          meta={<Skeleton className="h-2.5 w-64" delay={40} />}
          actions={<Button size="sm" className="h-8" disabled><UserRoundSearch className="w-3.5 h-3.5" /> View as customer</Button>}
        />
        <div className="px-4 md:px-6 flex items-stretch gap-3 border-b border-border shrink-0">
          <TabBarSkeleton />
          <div className="flex-1" />
          <FillModeNav mode="grid" onChange={() => {}} />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
            <div className="min-w-0">
              <PreorderGridSkeleton />
            </div>
            <aside className="lg:sticky lg:top-4 space-y-3">
              <OrderSummaryPanelSkeleton />
              <div className="rounded-xl border border-border bg-surface p-3 text-center space-y-2">
                <p className="text-[12px] text-muted-foreground">This is a preview. To place a preorder, open the portal as the customer.</p>
                <Button size="sm" className="w-full" disabled>
                  <UserRoundSearch className="w-3.5 h-3.5" /> View as customer
                </Button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }
  if (error && !campaign) {
    return (
      <div className="p-8">
        <Link href={`/preorder/${campaignId}`} className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to overview
        </Link>
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</div>
      </div>
    );
  }
  if (!campaign) return null;

  const currency = campaign.currency;
  const openingThis = partner ? opening === partner.mkId : false;
  // The customer-facing terms come from the market / customer layers, so they exist
  // only once a customer is picked (the campaign itself has no defaults for them).
  const minOrderAmount = effective?.effective.minOrderAmount ?? null;
  const customerNote = effective?.effective.note ?? null;

  return (
    <div className="flex flex-col h-full">
      <CampaignHeader
        campaignId={campaignId}
        active="preview"
        hideNav
        backHref={`/preorder/${campaignId}`}
        title={
          <h1 className="text-[15px] font-semibold text-foreground truncate leading-tight flex items-center gap-2">
            {campaign.title}
            <span className="inline-flex items-center gap-1 rounded-full bg-lime-600/10 text-lime-700 dark:text-lime-300 px-2 py-0.5 text-[10px] font-medium">
              <Eye className="w-3 h-3" /> Preview
            </span>
          </h1>
        }
        meta={
          <>
            {campaign.deadline && (
              <span className="inline-flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" /> Deadline {fmtDate(campaign.deadline)}</span>
            )}
            <span className="truncate">
              {partner
                ? `Previewing as ${partner.name} — nothing here is saved; open the portal as them to fill`
                : "Exactly what a customer sees, shown as a company (zero-rated) — pick a customer for their prices, or open the portal as them to fill"}
            </span>
          </>
        }
        actions={
          <>
            {Object.keys(quantities).length > 0 && (
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setQuantities({})}>
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </Button>
            )}
            {partner ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-600/10 text-lime-700 dark:text-lime-300 pl-2.5 pr-1 py-1 text-[12px] font-medium">
                  <UserRound className="w-3.5 h-3.5" />
                  <span className="max-w-[140px] truncate">{partner.name}</span>
                  <button onClick={() => setPickerOpen(true)} className="p-0.5 rounded hover:bg-lime-600/20" title="Change customer"><Pencil className="w-3 h-3" /></button>
                  <button onClick={clearPartner} className="p-0.5 rounded hover:bg-lime-600/20" title="Clear"><X className="w-3 h-3" /></button>
                </span>
                <Button size="sm" className="h-8" onClick={() => viewAs(partner)} disabled={opening !== null} title="Open the B2B portal as this customer, on this campaign">
                  {openingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserRoundSearch className="w-3.5 h-3.5" />} View as customer
                </Button>
              </>
            ) : (
              <Button size="sm" className="h-8" onClick={() => setPickerOpen(true)}>
                <UserRoundSearch className="w-3.5 h-3.5" /> View as customer
              </Button>
            )}
          </>
        }
      />

      {/* The customer's second header row: section tabs + how to browse the sheet.
          The campaign tab strip is hidden (hideNav) so the page reads like the
          customer's; the back arrow returns to the campaign overview. */}
      <div className="px-4 md:px-6 flex items-stretch gap-3 border-b border-border shrink-0">
        {campaign.tabs.length > 0 && <TabBar tabs={campaign.tabs} activeId={activeTabId} onSelect={setActiveTabId} quantities={quantities} />}
        <div className="flex-1" />
        <FillModeNav mode={mode} onChange={setMode} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* Sheet — the customer's order document: how they are priced / discount
              progress → the products. One frame, rows divided. */}
          <div className="min-w-0">
            <div className="rounded-2xl border border-border bg-surface overflow-hidden divide-y divide-border/60">
              {(campaign.pricing || unpricedFilled.length > 0 || (activeTab && (activeTab.tiers?.length ?? 0) > 0)) && (
                <div className="divide-y divide-border/60 bg-muted/10">
                  <SheetContextBar pricing={campaign.pricing} tab={activeTab} tabs={campaign.tabs} quantities={quantities} currency={currency} />
                  {unpricedFilled.length > 0 && (
                    <div className="px-4 py-2.5 text-[12px] text-amber-800 dark:text-amber-300 flex items-start gap-2.5 bg-amber-50/70 dark:bg-amber-950/30">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-amber-600" />
                      <div className="min-w-0">
                        <span className="font-semibold">{unpricedFilled.length} product{unpricedFilled.length === 1 ? "" : "s"} in your preorder {unpricedFilled.length === 1 ? "has" : "have"} no price yet</span>{" "}
                        and cannot be ordered: {unpricedFilled.slice(0, 4).map(({ row }) => row.name).join(", ")}{unpricedFilled.length > 4 ? ", …" : ""}.{" "}
                        <button
                          type="button"
                          className="underline font-medium"
                          onClick={() => setQuantities((prev) => { const next = { ...prev }; for (const { row } of unpricedFilled) delete next[row.id]; return next; })}
                        >
                          Remove {unpricedFilled.length === 1 ? "it" : "them"}
                        </button>{" "}
                        or contact us.
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!activeTab ? (
                <div className="text-center text-[13px] text-muted-foreground py-16">This sheet has no tabs yet.</div>
              ) : mode === "grid" ? (
                <PreorderGridTab tab={activeTab} quantities={quantities} onQty={setQty} currency={currency} pricing={campaign.pricing} bare searchable />
              ) : (
                <div className="p-4">
                  <PreorderGuidedTab tab={activeTab} quantities={quantities} onQty={setQty} currency={currency} pricing={campaign.pricing} />
                </div>
              )}
            </div>
          </div>

          {/* Sidebar — the customer's card, with the admin's action in the submit slot. */}
          <aside className="lg:sticky lg:top-4 space-y-3">
            <div className="rounded-2xl border border-border bg-surface overflow-hidden divide-y divide-border/60">
              <OrderSummaryPanel campaign={campaign} quantities={quantities} currency={currency} bare />
              {minOrderAmount ? (
                <p className="text-[11px] text-muted-foreground px-4 -mt-2 pb-2">
                  Minimum order value: <span className="font-medium text-foreground">{fmtMoney(minOrderAmount, currency)}</span>
                </p>
              ) : null}

              <div className="p-3 space-y-2">
                {partner ? (
                  <>
                    <div className="flex items-center gap-2 pb-1">
                      <span className="w-8 h-8 rounded-full bg-lime-600/10 flex items-center justify-center shrink-0">
                        <UserRound className="w-4 h-4 text-lime-600" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-foreground truncate">{partner.name}</div>
                        {partner.email && <div className="text-[11px] text-muted-foreground truncate">{partner.email}</div>}
                      </div>
                    </div>
                    <Button className="w-full" onClick={() => viewAs(partner)} disabled={opening !== null}>
                      {openingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserRoundSearch className="w-4 h-4" />} View as customer
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center pt-0.5">
                      Preview only — nothing here is saved. Open the portal as {partner.name} to fill and submit.
                    </p>
                    {openError && <p className="text-[12px] text-destructive text-center pt-1">{openError}</p>}
                  </>
                ) : (
                  <>
                    <Button className="w-full" onClick={() => setPickerOpen(true)}>
                      <UserRoundSearch className="w-4 h-4" /> View as customer
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center pt-0.5">
                      This is a preview. To place a preorder, open the portal as the customer.
                    </p>
                  </>
                )}
              </div>

              {/* The only two things the customer fills in besides quantities. */}
              <div className="p-3 space-y-2.5">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Delivery &amp; note</div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Requested delivery <span className="font-normal">(optional)</span></label>
                  <Input
                    type="date"
                    value={terms.deliveryDate ? terms.deliveryDate.slice(0, 10) : ""}
                    onChange={(e) => setTerms((t) => ({ ...t, deliveryDate: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                    className="mt-1 h-8 text-[12px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Comment <span className="font-normal">(optional)</span></label>
                  <textarea
                    value={terms.comment ?? ""}
                    onChange={(e) => setTerms((t) => ({ ...t, comment: e.target.value }))}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] focus:border-ring focus:outline-none"
                    placeholder="Anything we should know…"
                  />
                </div>
              </div>

              {customerNote && (
                <div className="px-3 py-2.5 text-[12px] text-foreground flex items-start gap-2 bg-muted/20">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your terms</div>
                    <p className="whitespace-pre-line mt-0.5">{customerNote}</p>
                  </div>
                </div>
              )}
            </div>

            {partner && (effective || effectiveLoading) && (
              <EffectiveConfigCard effective={effective} loading={effectiveLoading} campaignId={campaignId} partnerMkId={partner.mkId} />
            )}
          </aside>
        </div>
      </div>

      <Dialog open={pickerOpen} onOpenChange={(o) => { if (opening === null) setPickerOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRoundSearch className="w-4 h-4 text-lime-600" /> View as customer
            </DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-muted-foreground -mt-1">
            Opens the B2B portal as this customer, on this campaign — fill and submit exactly as they would.
            A customer who hasn&rsquo;t opened the invite link yet is unlocked for the campaign first.
          </p>
          <PartnerPicker
            busyId={opening}
            onSelect={(p) => {
              const picked = { mkId: p.mkId, name: p.name, email: p.emails?.[0] ?? null };
              setPartner(picked);
              void viewAs(picked);
            }}
          />
          {openError && <p className="text-[12px] text-destructive pt-1">{openError}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Admin-only explanation of what the partner is seeing and where each setting came from.
function EffectiveConfigCard({ effective, loading, campaignId, partnerMkId }: { effective: EffectiveCampaign | null; loading: boolean; campaignId: string; partnerMkId: string }) {
  const m = effective?.effective;
  return (
    <div className="rounded-xl border border-sky-200/70 bg-sky-50/50 dark:border-sky-800/50 dark:bg-sky-950/20 p-3 space-y-2 text-[12px]">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-sky-700 dark:text-sky-300">
        <SlidersHorizontal className="w-3.5 h-3.5" /> Effective configuration
        {loading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
      </div>
      {m && effective ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Market</span>
            {m.market ? <MarketChip name={m.market.name} color={m.market.color} /> : <span className="text-foreground">none</span>}
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">{m.marketSource === "manual" ? "assigned" : m.countryIso ? <><Flag iso={m.countryIso} /> {m.countryIso}</> : "no country"}</span>
          </div>
          <Line label="Pricing" value={effective.partnerPricelist ?? "sheet prices"} source={m.sources.pricelist} />
          <Line
            label="Assortment"
            value={`${effective.tabs.reduce((n, t) => n + t.groups.reduce((a, g) => a + g.rows.length, 0), 0)} products${m.assortment.hidden ? ` · ${m.assortment.hidden} hidden` : ""}${m.assortment.exposed ? ` · ${m.assortment.exposed} added` : ""}`}
            source={m.assortment.hiddenBy.customer || (m.hasCustomerRule && m.assortment.exposed) ? "customer" : m.assortment.hidden || m.assortment.exposed ? "market" : "campaign"}
          />
          <Line
            label="Discounts"
            value={Object.values(m.sources.tiers).includes("customer") ? "customer tiers" : Object.values(m.sources.tiers).includes("market") ? `${m.market?.name ?? "market"} tiers` : "campaign tiers"}
            source={Object.values(m.sources.tiers).includes("customer") ? "customer" : Object.values(m.sources.tiers).includes("market") ? "market" : "campaign"}
          />
          <Line label="Currency" value={effective.currency} source={m.sources.currency} />
          <div className="flex items-start gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Customer</span>
            <span className="text-foreground min-w-0 truncate">
              {CUSTOMER_KIND_LABELS[m.pricing.ctx.kind]} · partner price excl. VAT{(m.pricing.ctx.vat.rate ?? 0) > 0 ? " + VAT" : ""}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-muted-foreground w-20 shrink-0">VAT</span>
            <span className={cn("min-w-0 truncate", m.pricing.ctx.vat.rate == null ? "text-amber-700 dark:text-amber-300 font-medium" : "text-foreground")}>
              {m.pricing.ctx.vat.rate == null ? `not configured${m.countryIso ? ` for ${m.countryIso}` : ""}` : `${fmtVatRate(m.pricing.ctx.vat.rate)}${m.countryIso && (m.pricing.ctx.vat.source === "global" || m.pricing.ctx.vat.source === "campaign") ? ` · ${m.countryIso}` : ""}`}
            </span>
            <span
              className={cn(
                "ml-auto shrink-0 inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium",
                m.pricing.ctx.vat.source === "campaign"
                  ? "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300"
                  : m.pricing.ctx.vat.source === "missing"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
              )}
            >
              {VAT_SOURCE_LABELS[m.pricing.ctx.vat.source].toLowerCase()}
            </span>
          </div>
          {effective.deadline && <Line label="Deadline" value={new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(effective.deadline))} source={m.sources.deadline} />}
          {m.minOrderAmount != null && <Line label="Min. order" value={`${m.minOrderAmount} ${effective.currency}`} source={m.sources.minOrderAmount} />}
          {m.note && <Line label="Note" value={m.note} source={m.sources.note} />}
          {m.warnings.length > 0 && (
            <div className="text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5 pt-1">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <WarningList codes={m.warnings} />
            </div>
          )}
          <Link href={`/preorder/${campaignId}/markets?customer=${encodeURIComponent(partnerMkId)}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 dark:text-sky-300 hover:underline pt-1">
            <Globe2 className="w-3.5 h-3.5" /> Edit customer overrides
          </Link>
        </>
      ) : (
        <p className="text-muted-foreground">Resolving…</p>
      )}
    </div>
  );
}

function Line({ label, value, source }: { label: string; value: string; source: "campaign" | "market" | "customer" }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-foreground min-w-0 truncate" title={value}>{value}</span>
      <SourceBadge source={source} label={source === "campaign" ? "default" : source === "market" ? "market" : "override"} className="ml-auto shrink-0" />
    </div>
  );
}

function PartnerPicker({ onSelect, busyId }: { onSelect: (p: MkPartner) => void; busyId?: string | null }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MkPartner[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/preorder/partners?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((data) => !cancelled && setResults(data.partners ?? []))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input autoFocus placeholder="Search partner…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-8 text-[12px]" />
      </div>
      <div className="max-h-56 overflow-y-auto mt-2 -mx-1">
        {loading && <PartnerRowsSkeleton />}
        {!loading && results.length === 0 && <div className="text-[11px] text-muted-foreground px-2 py-2">No partners found.</div>}
        {results.map((p) => (
          <button
            key={p.mkId}
            onClick={() => onSelect(p)}
            disabled={busyId != null}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 disabled:opacity-60"
          >
            <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
              {busyId === p.mkId ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : <UserRound className="w-3.5 h-3.5 text-muted-foreground" />}
            </span>
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-foreground truncate">{p.name}</div>
              {p.emails?.[0] && <div className="text-[10px] text-muted-foreground truncate">{p.emails[0]}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Twin of the partner result rows while a search is in flight. */
function PartnerRowsSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg">
          <Skeleton className="w-7 h-7 rounded-full shrink-0" delay={stagger(i, 60)} />
          <div className="min-w-0">
            <SkeletonLine lh="h-[18px]" w="w-36" delay={stagger(i, 60, 20)} />
            <SkeletonLine lh="h-[15px]" h="h-2.5" w="w-44" delay={stagger(i, 60, 40)} />
          </div>
        </div>
      ))}
    </>
  );
}
