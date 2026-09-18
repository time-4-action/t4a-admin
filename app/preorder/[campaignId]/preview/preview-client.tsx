"use client";
// Admin preview / fill of a campaign sheet. Renders the exact partner fill experience
// (grid + Shopify-like guided + live summary). With NO partner selected it is a pure,
// non-persisting preview. Pick a partner and the admin can fill & SUBMIT a real preorder
// on their behalf (same as a partner would).
import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Table2,
  LayoutGrid,
  Eye,
  Pencil,
  RotateCcw,
  Search,
  UserRound,
  UserPlus,
  X,
  Loader2,
  Check,
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
  TabTierBanner,
  PricingBanner,
  PreorderGridTab,
  PreorderGuidedTab,
  OrderSummaryPanel,
  PreorderReviewModal,
  TabBarSkeleton,
  PreorderGridSkeleton,
  OrderSummaryPanelSkeleton,
} from "@/app/preorder/preorder-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampaignHeader } from "@/app/preorder/[campaignId]/campaign-nav";
import { MarketChip, SourceBadge, WarningList } from "@/app/preorder/preorder-badges";
import { Flag } from "@/components/flag";
import { CUSTOMER_KIND_LABELS, VAT_SOURCE_LABELS, type EffectiveCampaign, type PreorderCampaign, type PreorderTerms } from "@/types/preorder";
import { fmtVatRate } from "@/lib/pricing";
import type { MkPartner } from "@/types/documents";

type Mode = "grid" | "guided";

// The partner being filled for — from the MK picker or the ?partner= deep link.
type PickedPartner = { mkId: string; name: string; email?: string | null; address?: MkPartner["address"]; phone?: string };

export default function PreviewClient({ campaignId }: { campaignId: string }) {
  // The admin sheet (no partner) and, once a partner is picked, THEIR effective campaign.
  const [adminCampaign, setAdminCampaign] = useState<PreorderCampaign | null>(null);
  const [effective, setEffective] = useState<EffectiveCampaign | null>(null);
  const [effectiveLoading, setEffectiveLoading] = useState(false);
  const campaign: PreorderCampaign | null = effective ?? adminCampaign;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [terms, setTerms] = useState<PreorderTerms>({});
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("guided");

  const [partner, setPartner] = useState<PickedPartner | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Deep-links: ?fill=1 (overview "Fill for customer") opens the picker; ?partner=<mkId>
  // (customer drawer "Open preview as this customer") previews that partner directly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("fill") === "1") setPickerOpen(true);
    const pid = sp.get("partner");
    if (pid) setPartner({ mkId: pid, name: pid });
  }, []);
  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

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
  // rules applied server-side) and their existing preorder to prefill.
  useEffect(() => {
    if (!partner) {
      setEffective(null);
      return;
    }
    let alive = true;
    setEffectiveLoading(true);
    Promise.all([
      fetch(`/api/admin/preorder/campaigns/${campaignId}/effective?partnerMkId=${encodeURIComponent(partner.mkId)}`).then((r) => r.json()),
      fetch(`/api/admin/preorder/submissions?campaignId=${campaignId}&partnerMkId=${encodeURIComponent(partner.mkId)}`).then((r) => r.json()),
    ])
      .then(([eff, sub]) => {
        if (!alive) return;
        if (eff?.campaign) {
          setEffective(eff.campaign);
          setActiveTabId((prev) => (prev && eff.campaign.tabs.some((t: { id: string }) => t.id === prev) ? prev : eff.campaign.tabs[0]?.id ?? null));
          if (eff.partner && (partner.name === partner.mkId || !partner.email)) {
            setPartner((p) => (p && p.mkId === eff.partner.mkId ? { ...p, name: eff.partner.name, email: eff.partner.email } : p));
          }
        }
        if (sub?.submission) {
          const q: Record<string, number> = {};
          for (const l of sub.submission.lines ?? []) q[l.rowId] = l.qty;
          setQuantities(q);
          setTerms(sub.submission.terms ?? {});
        } else {
          const a = partner.address;
          const addr = a ? [a.street, [a.postNumber, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ") : "";
          setTerms({ invoiceAddress: addr, shippingAddress: addr, country: a?.country, phone: partner.phone, deliveryDate: null, comment: "" });
          setQuantities({});
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

  const submitFor = useCallback(
    async (action: "save" | "submit") => {
      if (!partner) return;
      setBusy(action);
      setError(null);
      try {
        const r = await fetch(`/api/admin/preorder/submissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId,
            partnerMkId: partner.mkId,
            partnerName: partner.name,
            partnerEmail: partner.email ?? undefined,
            quantities,
            terms,
            action,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "Failed");
        const reg = data?.register?.state as string | undefined;
        setFlash(
          action === "submit"
            ? reg === "created"
              ? `Preorder submitted for ${partner.name} — Metakocka order ${data.register.countCode ?? ""} created`
              : reg === "failed"
                ? `Preorder submitted for ${partner.name} — Metakocka registration failed (retry from the preorder page)`
                : `Preorder submitted for ${partner.name}`
            : "Draft saved",
        );
        setTimeout(() => setFlash(null), 6000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusy(null);
      }
    },
    [partner, campaignId, quantities, terms],
  );

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <CampaignHeader
          campaignId={campaignId}
          active="preview"
          backHref={`/preorder/${campaignId}`}
          title={<SkeletonLine lh="h-[19px]" h="h-3.5" w="w-48" />}
          meta={<Skeleton className="h-2.5 w-64" delay={40} />}
          actions={<Button size="sm" className="h-8" disabled><UserPlus className="w-3.5 h-3.5" /> Fill for customer</Button>}
          navExtra={
            <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              <span className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] bg-muted text-foreground font-medium"><Table2 className="w-3.5 h-3.5" /> Grid</span>
              <span className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] text-muted-foreground"><LayoutGrid className="w-3.5 h-3.5" /> Store</span>
            </div>
          }
        />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
            <div className="min-w-0">
              <div className="mb-4"><TabBarSkeleton /></div>
              <PreorderGridSkeleton />
            </div>
            <aside className="lg:sticky lg:top-4 space-y-3">
              <OrderSummaryPanelSkeleton />
              <div className="rounded-xl border border-border bg-surface p-3 text-center space-y-2">
                <p className="text-[12px] text-muted-foreground">This is a preview. To place a preorder, choose a customer.</p>
                <Button size="sm" className="w-full" disabled>
                  <UserPlus className="w-3.5 h-3.5" /> Fill for customer
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

  return (
    <div className="flex flex-col h-full">
      <CampaignHeader
        campaignId={campaignId}
        active="preview"
        backHref={`/preorder/${campaignId}`}
        title={
          <h1 className="text-[15px] font-semibold text-foreground truncate leading-tight flex items-center gap-2">
            {campaign.title}
            <span className="inline-flex items-center gap-1 rounded-full bg-lime-600/10 text-lime-700 dark:text-lime-300 px-2 py-0.5 text-[10px] font-medium">
              <Eye className="w-3 h-3" /> {partner ? "Fill" : "Preview"}
            </span>
          </h1>
        }
        meta={partner ? `Filling for ${partner.name} — submits a real preorder` : "How partners fill this sheet — pick a partner to submit on their behalf"}
        actions={
          <>
            {Object.keys(quantities).length > 0 && (
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setQuantities({})}>
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </Button>
            )}
            {partner ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-600/10 text-lime-700 dark:text-lime-300 pl-2.5 pr-1 py-1 text-[12px] font-medium">
                <UserRound className="w-3.5 h-3.5" />
                <span className="max-w-[140px] truncate">{partner.name}</span>
                <button onClick={() => setPickerOpen(true)} className="p-0.5 rounded hover:bg-lime-600/20" title="Change customer"><Pencil className="w-3 h-3" /></button>
                <button onClick={clearPartner} className="p-0.5 rounded hover:bg-lime-600/20" title="Clear"><X className="w-3 h-3" /></button>
              </span>
            ) : (
              <Button size="sm" className="h-8" onClick={() => setPickerOpen(true)}>
                <UserPlus className="w-3.5 h-3.5" /> Fill for customer
              </Button>
            )}
          </>
        }
        navExtra={
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <button onClick={() => setMode("grid")} className={cn("flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px]", mode === "grid" ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
              <Table2 className="w-3.5 h-3.5" /> Grid
            </button>
            <button onClick={() => setMode("guided")} className={cn("flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px]", mode === "guided" ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
              <LayoutGrid className="w-3.5 h-3.5" /> Store
            </button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="min-w-0">
            {campaign.tabs.length > 0 && (
              <div className="mb-4 border-b border-border flex items-stretch">
                <TabBar tabs={campaign.tabs} activeId={activeTabId} onSelect={setActiveTabId} quantities={quantities} />
              </div>
            )}
            <PricingBanner pricing={campaign.pricing} className="mb-4" />
            {activeTab && (
              <TabTierBanner tab={activeTab} tabs={campaign.tabs} quantities={quantities} currency={currency} pricing={campaign.pricing} className="mb-4" />
            )}
            {!activeTab ? (
              <div className="text-center text-[13px] text-muted-foreground py-16">This sheet has no tabs yet.</div>
            ) : mode === "grid" ? (
              <PreorderGridTab tab={activeTab} quantities={quantities} onQty={setQty} currency={currency} pricing={campaign.pricing} />
            ) : (
              <PreorderGuidedTab tab={activeTab} quantities={quantities} onQty={setQty} currency={currency} pricing={campaign.pricing} />
            )}
          </div>

          <aside className="lg:sticky lg:top-4 space-y-3">
            <OrderSummaryPanel campaign={campaign} quantities={quantities} currency={currency} />

            {partner && (effective || effectiveLoading) && (
              <EffectiveConfigCard effective={effective} loading={effectiveLoading} campaignId={campaignId} partnerMkId={partner.mkId} />
            )}

            {partner ? (
              <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
                <div className="flex items-center gap-2 pb-1">
                  <span className="w-8 h-8 rounded-full bg-lime-600/10 flex items-center justify-center shrink-0">
                    <UserRound className="w-4 h-4 text-lime-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-foreground truncate">{partner.name}</div>
                    {partner.email && <div className="text-[11px] text-muted-foreground truncate">{partner.email}</div>}
                  </div>
                </div>
                <Button className="w-full" onClick={() => setReviewOpen(true)} disabled={busy !== null}>
                  <Eye className="w-4 h-4" /> Preview &amp; submit
                </Button>
                <Button variant="outline" className="w-full" onClick={() => submitFor("save")} disabled={busy !== null}>
                  {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save draft
                </Button>
                {flash && <p className="text-[12px] text-lime-600 dark:text-lime-400 text-center pt-1">{flash}</p>}
                {error && <p className="text-[12px] text-destructive text-center pt-1">{error}</p>}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface p-3 text-center space-y-2">
                <p className="text-[12px] text-muted-foreground">This is a preview. To place a preorder, choose a customer.</p>
                <Button size="sm" className="w-full" onClick={() => setPickerOpen(true)}>
                  <UserPlus className="w-3.5 h-3.5" /> Fill for customer
                </Button>
              </div>
            )}

            {partner && partner.address && (
              <details className="rounded-xl border border-border bg-surface p-3">
                <summary className="text-[12px] font-medium text-foreground cursor-pointer">Partner details</summary>
                <dl className="mt-3 space-y-2">
                  <ViewRow label="Invoice address" value={terms.invoiceAddress} />
                  <ViewRow label="Shipping address" value={terms.shippingAddress} />
                  <ViewRow label="Country" value={terms.country} />
                  <ViewRow label="Phone" value={terms.phone} />
                </dl>
                <p className="text-[10px] text-muted-foreground mt-2">From the partner&rsquo;s Metakocka record.</p>
              </details>
            )}
          </aside>
        </div>
      </div>

      {partner && (
        <PreorderReviewModal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          campaign={campaign}
          quantities={quantities}
          terms={terms}
          submitting={busy === "submit"}
          title={`Review preorder for ${partner.name}`}
          submitLabel="Submit for customer"
          onSubmit={async () => {
            await submitFor("submit");
            setReviewOpen(false);
          }}
        />
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-lime-600" /> Fill for customer
            </DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-muted-foreground -mt-1">
            Choose the partner you&rsquo;re placing this preorder for. Their existing draft (if any) will load.
          </p>
          <PartnerPicker
            onSelect={(p) => {
              setPartner({ mkId: p.mkId, name: p.name, email: p.emails?.[0] ?? null, address: p.address, phone: p.phone });
              setPickerOpen(false);
            }}
          />
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

function ViewRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-foreground text-right break-words min-w-0">{value || "—"}</dd>
    </div>
  );
}

function PartnerPicker({ onSelect }: { onSelect: (p: MkPartner) => void }) {
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
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50"
          >
            <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
              <UserRound className="w-3.5 h-3.5 text-muted-foreground" />
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
