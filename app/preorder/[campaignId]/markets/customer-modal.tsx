"use client";

// One customer, opened big: a tabbed editor modal. Header + copyable contact
// strip, then tabs — Overview (status + "what this customer gets", each card
// jumps to the tab that changes it), Placement (market / country / directory
// country / note), Pricing & terms, Volume discounts, Assortment (the last three
// are slices of CommercialConfigForm). One draft, one Save.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Check, RefreshCw, Trash2, ExternalLink, Link2, Lock, LockOpen, AlertTriangle, Mail, Phone, MapPin, Hash, Building2, User, Compass, Copy, LayoutList, Wallet, Percent, Boxes, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditorModal, EditorModalBody, EditorModalFooter, EditorModalHeader } from "@/components/ui/editor-modal";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { fmtMoney } from "@/app/preorder/preorder-shared";
import { cn } from "@/lib/utils";
import { MarketChip, SubmissionStageBadge, WarningList } from "@/app/preorder/preorder-badges";
import { Flag } from "@/components/flag";
import { resolveEffectiveCampaign, resolvePartnerContext } from "@/lib/preorder-effective";
import type { CustomerRow } from "@/lib/preorder-customers";
import type { MkPricelist } from "@/types/documents";
import { type CommercialConfig, type CustomerRule, type EffectiveMeta, type PreorderCampaignAdmin } from "@/types/preorder";
import { CommercialConfigForm, configSectionCounts } from "./commercial-config-form";
import { ViewAsCustomerButton } from "@/components/view-as-customer-button";
import { CountrySelect } from "./country-picker";
import { CustomerKindBadge } from "./tables";

type Detail = {
  customer: CustomerRow | null;
  rule: CustomerRule | null;
  effective: EffectiveMeta;
  effectiveTabs: { id: string; name: string; rows: number; tiers: unknown[] }[];
};

export type RuleDraft = { marketId: string | null; countryIso: string | null; note: string; config: CommercialConfig };

export function CustomerModal({
  open,
  onOpenChange,
  campaignId,
  campaign,
  partnerMkId,
  countryNames,
  pricelists,
  inviteUrl,
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
  onSaved: () => void; // parent reloads campaign + geo
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft>({ marketId: null, countryIso: null, note: "", config: {} });
  const [hasRule, setHasRule] = useState(false);
  const [saving, setSaving] = useState<null | "rule" | "remove" | "refresh" | "country" | "access">(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [dirPick, setDirPick] = useState(false); // directory-country picker revealed
  const [advanced, setAdvanced] = useState(false); // placement "Advanced" opened

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [campaignId, partnerMkId]);

  useEffect(() => {
    // A different customer must not flash the previous one's data in the header.
    setDetail(null);
    setError(null);
    setTab("overview");
    setDirPick(false);
    setAdvanced(false);
    if (open && partnerMkId) void load();
  }, [open, partnerMkId, load]);

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
    const ctx = resolvePartnerContext(withCountry, partnerMkId, mkIso, mkIso ? (customer?.countrySource === "home-fallback" ? "home-fallback" : "mk") : null, customer?.kind ?? null);
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

  // Unlock / lock the campaign for this customer by hand (what the invite link does).
  const setAccess = async (grant: boolean) => {
    if (!partnerMkId) return;
    setSaving("access");
    setError(null);
    try {
      const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}/customers/${encodeURIComponent(partnerMkId)}/access`, { method: grant ? "POST" : "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not change access");
      onSaved();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change access");
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

  const KindIcon = customer?.kind === "business" ? Building2 : User;

  // Per-tab override counts for the tab badges + the summary.
  const counts = configSectionCounts(draft.config);
  const placementCount = (draft.marketId ? 1 : 0) + (draft.countryIso ? 1 : 0);
  const dirty = useMemo(() => {
    const base = detail?.rule;
    const same =
      (base?.marketId ?? null) === draft.marketId &&
      (base?.countryIso ?? null) === draft.countryIso &&
      (base?.note ?? "") === draft.note &&
      JSON.stringify(base?.config ?? {}) === JSON.stringify(draft.config);
    return !same;
  }, [detail?.rule, draft]);

  const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutList },
    { id: "placement", label: "Placement", icon: Compass, count: placementCount },
    { id: "commercial", label: "Pricing & terms", icon: Wallet, count: counts.commercial },
    { id: "tiers", label: "Volume discounts", icon: Percent, count: counts.tiers },
    { id: "assortment", label: "Assortment", icon: Boxes, count: counts.assortment },
  ];

  const productsVisible = detail?.effectiveTabs.reduce((n, t) => n + t.rows, 0) ?? 0;
  const tierSources = Object.values(detail?.effective.sources.tiers ?? {});
  const tiersSource: "campaign" | "market" | "customer" = tierSources.includes("customer") ? "customer" : tierSources.includes("market") ? "market" : "campaign";
  const assortmentSource: "campaign" | "market" | "customer" =
    detail?.effective.assortment.hidden || detail?.effective.assortment.exposed
      ? detail.effective.hasCustomerRule && (draft.config.hiddenIds || draft.config.exposedIds)
        ? "customer"
        : "market"
      : "campaign";

  return (
    <EditorModal open={open} onOpenChange={onOpenChange}>
      <EditorModalHeader
        leading={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lime-500/12 text-lime-700 dark:text-lime-400">
            <KindIcon className="size-5" />
          </span>
        }
        title={customer?.name ?? (loading ? "Loading…" : "Customer")}
        description={
          customer ? (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <CustomerKindBadge kind={customer.kind} compact />
              <span className="inline-flex items-center gap-1.5">
                {customer.city ? `${customer.city}, ` : ""}
                {customer.countryIso ? <><Flag iso={customer.countryIso} /> {customer.countryName}</> : <span className="text-amber-600 dark:text-amber-400">country unknown</span>}
              </span>
              {customer.countCode && <span className="font-mono text-[10px]">· {customer.countCode}</span>}
              {customer.stale && <span className="text-[10px] text-amber-600 dark:text-amber-400">· not in the last Metakocka sync</span>}
            </span>
          ) : undefined
        }
        right={
          customer ? (
            <>
              <ViewAsCustomerButton partnerMkId={customer.partnerMkId} />
              <button
                type="button"
                onClick={refreshFromMk}
                disabled={saving !== null}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                title="Re-read this partner from Metakocka"
              >
                {saving === "refresh" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
              </button>
            </>
          ) : undefined
        }
      />

      <EditorModalBody className="flex flex-col overflow-hidden">
        {/* ── contact strip ── */}
        {customer && (
          <div className="shrink-0 border-b border-border bg-muted/20 px-6 py-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-3">
              {customer.kind === "business" ? (
                <CopyFact icon={Hash} label="VAT / tax id" value={customer.taxId} mono />
              ) : (
                <CopyFact icon={User} label="Tax id" value={null} empty="Natural person — no tax id" />
              )}
              <CopyFact icon={Mail} label="Email" value={customer.emails.length > 1 ? customer.emails.join(", ") : customer.email} />
              <CopyFact icon={Phone} label="Phone" value={customer.phone} />
              <CopyFact
                icon={MapPin}
                label="Address"
                value={[customer.street, [customer.postNumber, customer.city].filter(Boolean).join(" "), customer.countryRaw].filter(Boolean).join(", ")}
              />
            </div>
          </div>
        )}

        {/* ── tabs ── */}
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

        {/* ── tab body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !detail ? (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-xl border border-border p-4 space-y-2">
                  <SkeletonLine lh="h-[14px]" w="w-24" delay={stagger(i)} />
                  <Skeleton className="h-6 w-2/3 rounded-md" delay={stagger(i, 80, 30)} />
                  <Skeleton className="h-3 w-1/2 rounded-md" delay={stagger(i, 80, 60)} />
                </div>
              ))}
            </div>
          ) : error && !detail ? (
            <div className="p-6">
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive">{error}</div>
            </div>
          ) : customer && eff ? (
            <div className="p-6">
              {tab === "overview" && (
                <div className="space-y-5">
                  {/* status */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <StatusCard label="Campaign access">
                      {customer.access ? (
                        <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-lime-700 dark:text-lime-400"><Check className="w-4 h-4" /> Unlocked</span>
                      ) : (
                        <span className="text-[14px] font-medium text-foreground">Not unlocked</span>
                      )}
                      {customer.access ? (
                        !customer.submissionId && (
                          <Button type="button" size="sm" variant="ghost" className="h-8 text-[12px] text-muted-foreground" onClick={() => setAccess(false)} disabled={saving !== null} title="Take the campaign away again — they will no longer see it in the portal">
                            {saving === "access" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Lock
                          </Button>
                        )
                      ) : (
                        <>
                          <Button type="button" size="sm" className="h-8 text-[12px] bg-lime-600 hover:bg-lime-700 text-white" onClick={() => setAccess(true)} disabled={saving !== null} title="Give this customer the campaign now — no invite link needed">
                            {saving === "access" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LockOpen className="w-3.5 h-3.5" />} Unlock for this customer
                          </Button>
                          {inviteUrl && (
                            <Button type="button" size="sm" variant="outline" className="h-8 text-[12px]" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>
                              <Link2 className="w-3.5 h-3.5" /> Copy invite link
                            </Button>
                          )}
                        </>
                      )}
                    </StatusCard>
                    <StatusCard label="Preorder">
                      {customer.stage ? <SubmissionStageBadge stage={customer.stage} /> : <span className="text-[14px] font-medium text-foreground">None yet</span>}
                      {customer.submissionId && (
                        <Link href={`/preorder/${campaignId}/submissions/${customer.submissionId}`}>
                          <Button type="button" size="sm" variant="outline" className="h-8 text-[12px]">
                            Open preorder <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      )}
                    </StatusCard>
                  </div>

                  {/* what applies */}
                  <div>
                    <div className="flex items-baseline justify-between gap-3 mb-3">
                      <h3 className="text-[13px] font-semibold text-foreground">What this customer gets</h3>
                      <span className="text-[11px] text-muted-foreground">Click a card to change it</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <SummaryCard
                        label="Country"
                        value={eff.countryIso ? <span className="inline-flex items-center gap-2"><Flag iso={eff.countryIso} className="text-[16px]" /> {countryNames[eff.countryIso] ?? eff.countryIso}</span> : "Unknown"}
                        note={
                          draft.countryIso
                            ? "set for this campaign"
                            : eff.countrySource === "manual"
                              ? "set manually in the directory"
                              : eff.countrySource === "home-fallback"
                                ? "home country — no address country in Metakocka"
                                : eff.countryIso
                                  ? "from Metakocka"
                                  : "not recognised — pick one under Placement"
                        }
                        tone={eff.countryIso ? undefined : "warn"}
                        onClick={() => setTab("placement")}
                      />
                      <SummaryCard
                        label="Market"
                        value={eff.market ? <MarketChip name={eff.market.name} color={eff.market.color} /> : "None"}
                        note={
                          eff.market
                            ? eff.marketSource === "manual"
                              ? "assigned manually"
                              : `${eff.countryIso ? (countryNames[eff.countryIso] ?? eff.countryIso) : "the country"} belongs to it`
                            : eff.countryIso
                              ? `no market covers ${countryNames[eff.countryIso] ?? eff.countryIso}`
                              : "no country, so no market"
                        }
                        onClick={() => setTab("placement")}
                      />
                      <SummaryCard
                        label="Price list"
                        value={inherited.partnerPricelist ?? "Sheet prices"}
                        note={sourceNote(detail?.effective.sources.pricelist ?? eff.sources.pricelist, eff.market?.name)}
                        onClick={() => setTab("commercial")}
                      />
                      <SummaryCard
                        label="Currency"
                        value={inherited.currency}
                        note={sourceNote(detail?.effective.sources.currency ?? eff.sources.currency, eff.market?.name)}
                        onClick={() => setTab("commercial")}
                      />
                      <SummaryCard
                        label="Deadline"
                        value={inherited.deadline ? fmtDateTime(inherited.deadline) : "None"}
                        note={sourceNote(eff.sources.deadline, eff.market?.name)}
                        onClick={() => setTab("commercial")}
                      />
                      <SummaryCard
                        label="Minimum order"
                        value={inherited.effective.minOrderAmount ? fmtMoney(inherited.effective.minOrderAmount, inherited.currency) : "None"}
                        note={sourceNote(eff.sources.minOrderAmount, eff.market?.name)}
                        onClick={() => setTab("commercial")}
                      />
                      <SummaryCard
                        label="Products"
                        value={`${productsVisible} visible`}
                        note={sourceNote(assortmentSource, eff.market?.name)}
                        onClick={() => setTab("assortment")}
                      />
                      <SummaryCard
                        label="Volume discounts"
                        value={tiersSource === "customer" ? "Customer ladder" : tiersSource === "market" ? `${eff.market?.name ?? "Market"} ladder` : "Campaign ladder"}
                        note={sourceNote(tiersSource, eff.market?.name)}
                        onClick={() => setTab("tiers")}
                      />
                    </div>
                    {(detail?.effective.warnings.length ?? 0) > 0 && (
                      <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/50 px-4 py-3 text-[12px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <WarningList codes={detail!.effective.warnings} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "placement" && (
                <div className="space-y-5">
                  <TabIntro title="Placement" hint="Which market this customer belongs to in this campaign. Automatic follows their country." />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field label="Market" hint="Automatic = the market that contains the customer's country.">
                      <Select value={draft.marketId ?? "__auto__"} onValueChange={(v) => setDraft({ ...draft, marketId: v === "__auto__" ? null : v })}>
                        <SelectTrigger className="h-10 text-[13px] w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__auto__" className="text-[13px]">By country (automatic)</SelectItem>
                          {marketOptions.map((m) => (
                            <SelectItem key={m.id} value={m.id} className="text-[13px]">{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Internal note" hint="Only your team sees this.">
                      <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Why this customer is special…" className="h-10 text-[13px]" />
                    </Field>
                  </div>

                  {(() => {
                    const dirBlock = (() => {
                        const manual = customer.countrySource === "manual";
                        const unresolved = !customer.countryIso;
                        const picker = (
                          <CountrySelect
                            value={null}
                            onChange={(iso) => {
                              if (iso) {
                                setDirPick(false);
                                void saveDirectoryCountry(iso);
                              }
                            }}
                            countryNames={countryNames}
                            placeholder={saving === "country" ? "Saving…" : unresolved ? "Pick the right country…" : "Pick another country…"}
                            disabled={saving === "country"}
                            className="h-9 text-[13px] bg-background"
                          />
                        );
                        if (unresolved) {
                          return (
                            <div className="rounded-xl border bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/50 p-4">
                              <div className="text-[13px] font-semibold text-foreground">Country in the directory</div>
                              <div className="mt-1 text-[12px] text-amber-800 dark:text-amber-200">
                                {customer.countryRaw ? (
                                  <>Metakocka says <span className="font-semibold">&ldquo;{customer.countryRaw}&rdquo;</span> — not a country we recognise. Pick the right one; it applies to every campaign.</>
                                ) : (
                                  <>Metakocka has no country on this partner&rsquo;s address. Pick one; it applies to every campaign.</>
                                )}
                              </div>
                              <div className="mt-3">{picker}</div>
                            </div>
                          );
                        }
                        // Resolved: one quiet line. The picker only appears on demand.
                        return (
                          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-[12px]">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                              <span className="text-muted-foreground">Directory country</span>
                              <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
                                <Flag iso={customer.countryIso} /> {customer.countryName}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {manual ? "set manually" : customer.countrySource === "home-fallback" ? "home country" : "from Metakocka"}
                                {manual && customer.countryRaw ? ` · Metakocka says “${customer.countryRaw}”` : ""}
                                {" · shared by every campaign"}
                              </span>
                              <div className="flex-1" />
                              {manual && (
                                <button
                                  type="button"
                                  onClick={() => void saveDirectoryCountry(null)}
                                  disabled={saving !== null}
                                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                                >
                                  <RefreshCw className={cn("w-3 h-3", saving === "country" && "animate-spin")} /> Use Metakocka&rsquo;s value
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setDirPick((v) => !v)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-lime-700 dark:text-lime-400 hover:underline"
                              >
                                {dirPick ? "Cancel" : "Change"}
                              </button>
                            </div>
                            {dirPick && <div className="mt-2">{picker}</div>}
                          </div>
                        );
                    })();
                    const unresolved = !customer.countryIso;
                    return (
                      <>
                      {/* Rarely needed: the directory country and a per-campaign country. */}
                      <div className="rounded-xl border border-dashed border-border">
                        <button
                          type="button"
                          onClick={() => setAdvanced((v) => !v)}
                          className="flex w-full items-center gap-2 px-4 py-3 text-left text-[12px] font-medium text-muted-foreground hover:text-foreground"
                        >
                          {advanced || draft.countryIso || unresolved ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          Advanced
                          {draft.countryIso && (
                            <span className="ml-1 rounded-full bg-lime-500/15 text-lime-700 dark:text-lime-400 px-1.5 text-[10px] font-semibold">country overridden</span>
                          )}
                        </button>
                        {(advanced || draft.countryIso || unresolved) && (
                          <div className="px-4 pb-4 space-y-4">
                            {dirBlock}
                            <Field label="Country in this campaign only" hint="Treat the customer as another country here without touching the directory. Almost never needed — fix the directory country instead.">
                              <CountrySelect
                                value={draft.countryIso}
                                onChange={(iso) => setDraft({ ...draft, countryIso: iso })}
                                countryNames={countryNames}
                                noneLabel={`Same as directory (${customer.countryIso ? (countryNames[customer.countryIso] ?? customer.countryIso) : "unknown"})`}
                                className="h-10 text-[13px] md:max-w-[420px]"
                              />
                            </Field>
                          </div>
                        )}
                      </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {tab === "commercial" && (
                <div className="space-y-5">
                  <TabIntro title="Pricing & terms" hint="Each field shows what the customer inherits. Override only what should differ for them." />
                  <CommercialConfigForm section="commercial" value={draft.config} onChange={(config) => setDraft({ ...draft, config })} inherited={inherited} campaign={campaign} pricelists={pricelists} layer="customer" customerKind={customer?.kind ?? null} />
                </div>
              )}

              {tab === "tiers" && (
                <div className="space-y-5">
                  <TabIntro title="Volume discounts" hint="Per sheet tab: the discount ladder the customer gets. Override a tab to give them their own ladder." />
                  <CommercialConfigForm section="tiers" value={draft.config} onChange={(config) => setDraft({ ...draft, config })} inherited={inherited} campaign={campaign} pricelists={pricelists} layer="customer" />
                </div>
              )}

              {tab === "assortment" && (
                <div className="space-y-5">
                  <TabIntro title="Assortment" hint="Which products this customer can order. Hide or show tabs, groups or single products for them." />
                  <CommercialConfigForm section="assortment" value={draft.config} onChange={(config) => setDraft({ ...draft, config })} inherited={inherited} campaign={campaign} pricelists={pricelists} layer="customer" />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </EditorModalBody>

      <EditorModalFooter>
        <div className="flex items-center gap-2">
          {hasRule && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={removeRule} disabled={saving !== null}>
              {saving === "remove" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Remove all overrides
            </Button>
          )}
          {error && detail && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex-1" />
          {dirty && customer && <span className="text-[11px] text-muted-foreground">Unsaved changes</span>}
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving !== null}>Close</Button>
          <Button size="sm" onClick={saveRule} disabled={saving !== null || !customer || !dirty}>
            {saving === "rule" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {hasRule ? "Save changes" : "Save overrides"}
          </Button>
        </div>
      </EditorModalFooter>
    </EditorModal>
  );
}

type Tab = "overview" | "placement" | "commercial" | "tiers" | "assortment";

function fmtDateTime(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function StatusCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3">{children}</div>
      </div>
    </div>
  );
}

// One answer on the overview: label, the value in full, where it comes from, and
// a click that opens the tab where it can be changed.
function SummaryCard({
  label,
  value,
  note,
  tone,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  note: string;
  tone?: "warn";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group text-left rounded-xl border px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "warn"
          ? "border-amber-200/70 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          : "border-border bg-surface hover:border-lime-400/60 hover:bg-lime-50/30 dark:hover:bg-lime-950/10",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
          <div className="mt-1 text-[14px] font-medium text-foreground break-words">{value}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{note}</div>
        </div>
        <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          Change <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}

function TabIntro({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[12px] font-medium text-foreground">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// One contact / address fact with a copy-to-clipboard button. Flashes a check
// for a moment after copying.
function CopyFact({
  icon: Icon,
  label,
  value,
  mono,
  empty = "—",
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  empty?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  };
  return (
    <div className="group flex items-start gap-2.5 min-w-0">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface border border-border text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
        <div className="flex items-start gap-1.5 mt-0.5">
          <span className={cn("text-[12px] text-foreground min-w-0 break-words leading-snug", mono && "font-mono text-[11.5px]", !value && "text-muted-foreground")}>
            {value || empty}
          </span>
          {value && (
            <button
              type="button"
              onClick={copy}
              title={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
              aria-label={`Copy ${label.toLowerCase()}`}
              className={cn(
                "shrink-0 rounded-md p-1 -my-1 transition-colors",
                copied ? "text-lime-600 dark:text-lime-400" : "text-muted-foreground/60 hover:text-foreground hover:bg-muted",
              )}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function sourceNote(source: "campaign" | "market" | "customer", marketName?: string): string {
  if (source === "customer") return "customer override";
  if (source === "market") return marketName ? `from market ${marketName}` : "from the market";
  return "campaign default";
}
