"use client";

// One customer, opened big: a two-column editor modal. The left column is the
// read-only context — who they are (company / individual, VAT id, contact,
// address), campaign access + preorder state, the inheritance ladder
// (Customer → Country → Market → Campaign) and the effective summary with
// provenance. The right column is the editor: placement (manual market /
// country) and the commercial overrides. Also the directory-owned bits: country
// fix and refresh from Metakocka.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Check, RefreshCw, Trash2, ExternalLink, Link2, Eye, AlertTriangle, Mail, Phone, MapPin, Hash, Building2, User, SlidersHorizontal, Compass, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditorModal, EditorModalBody, EditorModalFooter, EditorModalHeader } from "@/components/ui/editor-modal";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MarketChip, SubmissionStageBadge } from "@/app/preorder/preorder-badges";
import { Flag } from "@/components/flag";
import { resolveEffectiveCampaign, resolvePartnerContext } from "@/lib/preorder-effective";
import type { CustomerRow } from "@/lib/preorder-customers";
import type { MkPricelist } from "@/types/documents";
import { type CommercialConfig, type CustomerRule, type EffectiveMeta, type PreorderCampaignAdmin } from "@/types/preorder";
import { CommercialConfigForm } from "./commercial-config-form";
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
  const [saving, setSaving] = useState<null | "rule" | "remove" | "refresh" | "country">(null);

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
              <span>
                {customer.city ? `${customer.city}, ` : ""}
                {customer.countryIso ? <span className="inline-flex items-center gap-1.5"><Flag iso={customer.countryIso} /> {customer.countryName}</span> : <span className="text-amber-600 dark:text-amber-400">country unknown</span>}
              </span>
              {customer.countCode && <span className="font-mono text-[10px]">· {customer.countCode}</span>}
              {customer.stale && <span className="text-[10px] text-amber-600 dark:text-amber-400">· not in the last Metakocka sync</span>}
            </span>
          ) : undefined
        }
        right={
          customer ? (
            <>
              <Link
                href={`/preorder/${campaignId}/preview?partner=${encodeURIComponent(customer.partnerMkId)}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-muted"
              >
                <Eye className="w-3.5 h-3.5" /> Preview as customer
              </Link>
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
        {/* ── customer info strip: contact + address, full width, each copyable ── */}
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

        <div className="min-h-0 flex-1 grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] overflow-hidden">
        {loading && !detail ? (
          <>
            <aside className="hidden md:block border-r border-border bg-muted/30 p-5 space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-border bg-surface p-4 space-y-2">
                  <SkeletonLine lh="h-[14px]" w="w-24" delay={stagger(i)} />
                  <Skeleton className="h-8 w-full rounded-md" delay={stagger(i, 80, 30)} />
                  <Skeleton className="h-8 w-2/3 rounded-md" delay={stagger(i, 80, 60)} />
                </div>
              ))}
            </aside>
            <div className="p-6 space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-border p-4 space-y-2">
                  <SkeletonLine lh="h-[18px]" w="w-40" delay={stagger(i)} />
                  <Skeleton className="h-9 w-full rounded-md" delay={stagger(i, 80, 30)} />
                </div>
              ))}
            </div>
          </>
        ) : error && !detail ? (
          <div className="md:col-span-2 p-6">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive">{error}</div>
          </div>
        ) : customer && eff ? (
          <>
            {/* ── left: what this customer gets ── */}
            <aside className="min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r border-border bg-muted/30 p-5 space-y-4">
              {/* status */}
              <Panel title="Status">
                <div className="divide-y divide-border/60 text-[12px]">
                  <div className="flex items-center gap-2 py-1.5">
                    <span className="text-muted-foreground w-24 shrink-0">Access</span>
                    {customer.access ? (
                      <span className="inline-flex items-center gap-1 text-lime-700 dark:text-lime-400 font-medium"><Check className="w-3.5 h-3.5" /> Unlocked</span>
                    ) : (
                      <span className="text-foreground">Not unlocked</span>
                    )}
                    {!customer.access && inviteUrl && (
                      <button type="button" onClick={() => navigator.clipboard?.writeText(inviteUrl)} className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                        <Link2 className="w-3 h-3" /> Copy invite
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 py-1.5">
                    <span className="text-muted-foreground w-24 shrink-0">Preorder</span>
                    {customer.stage ? <SubmissionStageBadge stage={customer.stage} /> : <span className="text-foreground">None yet</span>}
                    {customer.submissionId && (
                      <Link href={`/preorder/${campaignId}/submissions/${customer.submissionId}`} className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                        Open <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </Panel>

              {/* effective summary — plain answers, full text, source as a footnote */}
              <Panel title="What this customer gets">
                <div className="divide-y divide-border/60">
                  <Item
                    label="Country"
                    value={eff.countryIso ? <span className="inline-flex items-center gap-1.5"><Flag iso={eff.countryIso} /> {countryNames[eff.countryIso] ?? eff.countryIso}</span> : "Unknown"}
                    note={
                      draft.countryIso
                        ? "set for this campaign"
                        : eff.countrySource === "manual"
                          ? "set manually in the directory"
                          : eff.countrySource === "home-fallback"
                            ? "home country (no address country in Metakocka)"
                            : eff.countryIso
                              ? "from Metakocka"
                              : "pick one under Placement"
                    }
                  />
                  <Item
                    label="Market"
                    value={eff.market ? <MarketChip name={eff.market.name} color={eff.market.color} /> : "None"}
                    note={
                      eff.market
                        ? eff.marketSource === "manual"
                          ? "assigned under Placement"
                          : `because ${eff.countryIso ? (countryNames[eff.countryIso] ?? eff.countryIso) : "the country"} belongs to it`
                        : eff.countryIso
                          ? `no market covers ${countryNames[eff.countryIso] ?? eff.countryIso} — campaign defaults apply`
                          : "no country, so no market"
                    }
                  />
                  <Item
                    label="Price list"
                    value={inherited.partnerPricelist ?? "Sheet prices"}
                    note={sourceNote(detail?.effective.sources.pricelist ?? eff.sources.pricelist, eff.market?.name)}
                  />
                  <Item label="Currency" value={inherited.currency} note={sourceNote(detail?.effective.sources.currency ?? eff.sources.currency, eff.market?.name)} />
                  <Item
                    label="Products"
                    value={`${detail?.effectiveTabs.reduce((n, t) => n + t.rows, 0) ?? 0} visible`}
                    note={sourceNote(
                      detail?.effective.assortment.hidden || detail?.effective.assortment.exposed
                        ? detail.effective.hasCustomerRule && (draft.config.hiddenIds || draft.config.exposedIds)
                          ? "customer"
                          : "market"
                        : "campaign",
                      eff.market?.name,
                    )}
                  />
                  <Item
                    label="Volume discounts"
                    value={
                      Object.values(detail?.effective.sources.tiers ?? {}).includes("customer")
                        ? "Customer ladder"
                        : Object.values(detail?.effective.sources.tiers ?? {}).includes("market")
                          ? `${eff.market?.name ?? "Market"} ladder`
                          : "Campaign ladder"
                    }
                    note={sourceNote(
                      Object.values(detail?.effective.sources.tiers ?? {}).includes("customer")
                        ? "customer"
                        : Object.values(detail?.effective.sources.tiers ?? {}).includes("market")
                          ? "market"
                          : "campaign",
                      eff.market?.name,
                    )}
                  />
                </div>
                {(detail?.effective.warnings.length ?? 0) > 0 && (
                  <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/50 px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{detail!.effective.warnings.join(" · ")}</span>
                  </div>
                )}
              </Panel>
            </aside>

            {/* ── right: editor ── */}
            <div className="min-h-0 overflow-y-auto p-6 space-y-6">
              {/* placement */}
              <section className="space-y-3">
                <SectionHeading icon={Compass} title="Placement" hint="Where this customer sits in the campaign — overrides the country lookup." />
                <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Market</label>
                      <Select value={draft.marketId ?? "__auto__"} onValueChange={(v) => setDraft({ ...draft, marketId: v === "__auto__" ? null : v })}>
                        <SelectTrigger size="sm" className="mt-1 h-9 text-[12px] w-full"><SelectValue /></SelectTrigger>
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
                      <CountrySelect
                        value={draft.countryIso}
                        onChange={(iso) => setDraft({ ...draft, countryIso: iso })}
                        countryNames={countryNames}
                        noneLabel={`From Metakocka (${customer.countryIso ?? "unknown"})`}
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>
                  {/* Directory country — shared by every campaign. Unresolved ⇒ amber
                      prompt; manual ⇒ shows the override with a way back to Metakocka. */}
                  {(() => {
                    const manual = customer.countrySource === "manual";
                    const unresolved = !customer.countryIso;
                    return (
                      <div
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-[11px]",
                          unresolved
                            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/50 text-amber-800 dark:text-amber-200"
                            : "bg-muted/30 border-border text-muted-foreground",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium text-foreground">Country in the directory</span>
                          <span className="text-[10px] text-muted-foreground">applies to every campaign</span>
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
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground">
                            {customer.countryIso ? (
                              <>
                                <Flag iso={customer.countryIso} /> {customer.countryName}
                                <span className="text-[10px] text-muted-foreground">
                                  {manual ? "· set manually" : customer.countrySource === "home-fallback" ? "· home country" : "· from Metakocka"}
                                </span>
                              </>
                            ) : customer.countryRaw ? (
                              <>
                                Metakocka says <span className="font-semibold">&ldquo;{customer.countryRaw}&rdquo;</span> — not a country we recognise.
                              </>
                            ) : (
                              <>Metakocka has no country on this partner&rsquo;s address.</>
                            )}
                          </span>
                          {manual && customer.countryRaw && (
                            <span className="text-[10px] text-muted-foreground">Metakocka: &ldquo;{customer.countryRaw}&rdquo;</span>
                          )}
                        </div>
                        <CountrySelect
                          value={null}
                          onChange={(iso) => {
                            if (iso) void saveDirectoryCountry(iso);
                          }}
                          countryNames={countryNames}
                          placeholder={saving === "country" ? "Saving…" : unresolved ? "Pick the right country…" : manual ? "Change the manual country…" : "Override with another country…"}
                          disabled={saving === "country"}
                          className="mt-2 h-8 bg-background"
                        />
                      </div>
                    );
                  })()}
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Internal note</label>
                    <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Why this customer is special…" className="mt-1 h-9 text-[12px]" />
                  </div>
                </div>
              </section>

              {/* overrides */}
              <section className="space-y-3">
                <SectionHeading icon={SlidersHorizontal} title="Commercial overrides" hint="Anything left inherited follows the market, then the campaign." />
                <CommercialConfigForm value={draft.config} onChange={(config) => setDraft({ ...draft, config })} inherited={inherited} campaign={campaign} pricelists={pricelists} layer="customer" />
              </section>
            </div>
          </>
        ) : null}
        </div>
      </EditorModalBody>

      <EditorModalFooter>
        <div className="flex items-center gap-2">
          {hasRule && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={removeRule} disabled={saving !== null}>
              {saving === "remove" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Remove overrides
            </Button>
          )}
          {error && detail && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving !== null}>Close</Button>
          <Button size="sm" onClick={saveRule} disabled={saving !== null || !customer}>
            {saving === "rule" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {hasRule ? "Save overrides" : "Save as override"}
          </Button>
        </div>
      </EditorModalFooter>
    </EditorModal>
  );
}

function Panel({ title, compact, children }: { title: string; compact?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface", compact ? "px-3 py-2.5" : "px-4 py-3")}>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

function SectionHeading({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-foreground leading-7">{title}</h3>
        {hint && <p className="-mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
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

// One line of the "what this customer gets" list: label, the full answer, and a
// footnote saying where it comes from.
function Item({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[12px] font-medium text-foreground break-words">{value}</div>
      {note && <div className="mt-0.5 text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}

function sourceNote(source: "campaign" | "market" | "customer", marketName?: string): string {
  if (source === "customer") return "customer override";
  if (source === "market") return marketName ? `from market ${marketName}` : "from the market";
  return "campaign default";
}
