"use client";
import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Building2,
  UserRound,
  Lock,
  LockOpen,
  Loader2,
  Mail,
  Phone,
  MapPin,
  Truck,
  MessageSquare,
  ShoppingCart,
  ExternalLink,
  Trash2,
  MoreVertical,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  History,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fmtMoney,
  SheetContextBar,
  TabBar,
  PreorderGridTab,
  OrderSummaryPanel,
  SheetHeaderSkeleton,
  PreorderGridSkeleton,
  OrderSummaryPanelSkeleton,
} from "@/app/preorder/preorder-shared";
import { MkOrderStateBadge, SourceBadge, SubmissionStageBadge, VisibilityBadge, MarketChip } from "@/app/preorder/preorder-badges";
import {
  LINE_STATUS_LABELS,
  CUSTOMER_KIND_LABELS,
  CONFIG_SOURCE_LABELS,
  VAT_SOURCE_LABELS,
  computeConfirmedTotals,
  submissionStage,
  type AllocationResult,
  type AllocationView,
  type LineStatus,
  type PreorderCampaign,
  type PreorderSubmission,
} from "@/types/preorder";
import { fmtVatRate } from "@/lib/pricing";
import { Flag } from "@/components/flag";
import { CampaignHeader } from "@/app/preorder/[campaignId]/campaign-nav";
import { ViewAsCustomerButton } from "@/components/view-as-customer-button";

type LoadData = {
  submission: PreorderSubmission;
  frozen: PreorderCampaign | null;
  allocation: AllocationResult;
  campaign: PreorderCampaign | null;
};

const LINE_STATUS_PILL: Record<LineStatus, string> = {
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  confirmed: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300",
  backorder: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
};

function fmtDateTime(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export default function SubmissionClient({
  campaignId,
  submissionId,
}: {
  campaignId: string;
  submissionId: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<LoadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "refresh" | "register" | "publish" | "unlock" | "dismiss" | "delete">(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [publishDialog, setPublishDialog] = useState<null | "show" | "hide">(null);
  const [unlockDialog, setUnlockDialog] = useState(false);
  const [deleteInMk, setDeleteInMk] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(
    async (refresh = false) => {
      const r = await fetch(`/api/admin/preorder/submissions/${submissionId}${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j?.submission) throw new Error(j?.error ?? "Submission not found");
      return j as LoadData;
    },
    [submissionId],
  );

  useEffect(() => {
    mounted.current = true;
    load()
      .then((d) => {
        if (!mounted.current) return;
        setData(d);
        setActiveTabId((d.frozen ?? d.campaign)?.tabs[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // Poll while a registration is in flight.
  const registering = data?.submission.mkOrder?.state === "pending";
  useEffect(() => {
    if (!registering) return;
    const id = setInterval(() => {
      load()
        .then((d) => mounted.current && setData(d))
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(id);
  }, [registering, load]);

  const submission = data?.submission ?? null;
  const campaign = data?.campaign ?? null;
  // The frozen snapshot is what the customer agreed to; legacy submissions (no snapshot)
  // fall back to the live campaign like the old review page did.
  const sheet = data?.frozen ?? campaign;
  const currency = sheet?.currency ?? campaign?.currency ?? "EUR";

  const quantities = useMemo(() => {
    const q: Record<string, number> = {};
    for (const l of submission?.lines ?? []) q[l.rowId] = l.qty;
    return q;
  }, [submission]);

  const filledTabs = useMemo(
    () => (sheet?.tabs ?? []).filter((t) => t.groups.some((g) => g.rows.some((r) => (quantities[r.id] || 0) > 0))),
    [sheet, quantities],
  );
  useEffect(() => {
    if (filledTabs.length === 0) return;
    if (!activeTabId || !filledTabs.some((t) => t.id === activeTabId)) setActiveTabId(filledTabs[0].id);
  }, [filledTabs, activeTabId]);
  const activeTab = useMemo(() => sheet?.tabs.find((t) => t.id === activeTabId) ?? null, [sheet, activeTabId]);

  // Legacy per-line fulfilment (read-only) for submissions made before immediate registration.
  const legacyFulfil = useMemo(() => {
    const m: Record<string, { confirmedQty: number | null; lineStatus: LineStatus }> = {};
    for (const l of submission?.lines ?? []) if (l.lineStatus) m[l.rowId] = { confirmedQty: l.confirmedQty ?? null, lineStatus: l.lineStatus };
    return m;
  }, [submission]);
  const isLegacy = !!submission && !submission.snapshot;
  const legacyConfirmed = useMemo(
    () => (isLegacy && sheet && Object.values(legacyFulfil).some((f) => f.lineStatus !== "pending") ? computeConfirmedTotals(sheet, quantities, legacyFulfil) : undefined),
    [isLegacy, sheet, quantities, legacyFulfil],
  );

  const run = useCallback(
    async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
      setBusy(kind);
      setActionError(null);
      try {
        await fn();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const refreshOrder = () => run("refresh", async () => setData(await load(true)));

  const register = () =>
    run("register", async () => {
      const r = await fetch(`/api/admin/preorder/submissions/${submissionId}/sales-order`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 409) throw new Error(j?.result?.error ?? j?.error ?? "Registration failed");
      setData(await load(true));
      if (j?.result?.state === "failed") throw new Error(j.result.error ?? "Registration failed");
    });

  const publish = (published: boolean) =>
    run("publish", async () => {
      const r = await fetch(`/api/admin/preorder/submissions/${submissionId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Failed");
      setPublishDialog(null);
      setData(await load(true));
    });

  const unlock = () =>
    run("unlock", async () => {
      const body: Record<string, unknown> = { status: "draft" };
      if (submission?.mkSalesOrder) body.detachOrder = { deleteInMk, reason: "unlocked for customer" };
      const r = await fetch(`/api/admin/preorder/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? "Unlock failed");
      setUnlockDialog(false);
      setData(await load());
    });

  const dismissRequest = () =>
    run("dismiss", async () => {
      const r = await fetch(`/api/admin/preorder/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissUnlockRequest: true }),
      });
      if (!r.ok) throw new Error("Failed");
      setData(await load());
    });

  const deleteSubmission = () =>
    run("delete", async () => {
      const r = await fetch(`/api/admin/preorder/submissions/${submissionId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      router.push(`/preorder/${campaignId}/submissions`);
    });

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <SheetHeaderSkeleton
          backHref={`/preorder/${campaignId}/submissions`}
          right={
            <>
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-md" delay={40} />
            </>
          }
        />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
            <div className="min-w-0 space-y-6">
              <PreorderGridSkeleton readOnly qtyHeader="Qty" />
              <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
                <SkeletonLine lh="h-[20px]" w="w-48" />
                {[0, 1, 2].map((i) => (
                  <SkeletonLine key={i} lh="h-[18px]" w="w-full" delay={stagger(i, 60, 80)} />
                ))}
              </div>
            </div>
            <aside className="lg:sticky lg:top-4 space-y-3">
              <OrderSummaryPanelSkeleton />
              <div className="rounded-xl border border-border bg-surface p-4 space-y-2.5 text-[12px]">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Customer visibility</div>
                <SkeletonLine lh="h-[18px]" w="w-full" delay={80} />
                <Skeleton className="h-9 w-full rounded-md" delay={120} />
              </div>
              <div className="rounded-xl border border-border bg-surface p-4 space-y-2 text-[12px]">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Metakocka</div>
                <SkeletonLine lh="h-[18px]" w="w-2/3" delay={140} />
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }
  if (error || !submission || !campaign || !sheet) {
    return (
      <div className="p-8">
        <Link href={`/preorder/${campaignId}/submissions`} className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to preorders
        </Link>
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error ?? "Not found"}</div>
      </div>
    );
  }

  const stage = submission.stage ?? submissionStage(submission);
  const isLocked = submission.status === "submitted" || submission.status === "confirmed";
  const mkState = submission.mkOrder?.state ?? (submission.mkSalesOrder ? ("legacy" as const) : null);
  const hasOrder = !!submission.mkSalesOrder?.mkId && (mkState === "created" || mkState === "legacy");
  const published = !!submission.resultPublishedToCustomer && hasOrder;
  const allocation = data?.allocation ?? { state: "none" as const };
  const t = submission.terms;
  const snap = submission.snapshot;
  const mkDocHref = submission.mkSalesOrder
    ? `/documents/${encodeURIComponent(submission.partnerMkId)}/order/${encodeURIComponent(submission.mkSalesOrder.mkId)}`
    : null;

  const renderLegacyCell = (rowId: string) => {
    const f = legacyFulfil[rowId];
    if (!f) return null;
    return (
      <span className="inline-flex items-center gap-2 text-[11px]">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-medium", LINE_STATUS_PILL[f.lineStatus])}>{LINE_STATUS_LABELS[f.lineStatus]}</span>
        {f.confirmedQty != null && <span className="tabular-nums text-muted-foreground">× {f.confirmedQty}</span>}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* The campaign header with its tab strip, like every other campaign page; the
          preorder's own sections (AEON · FOIL) sit at the right end of the tab row. */}
      <CampaignHeader
        campaignId={campaignId}
        active="preorders"
        backHref={`/preorder/${campaignId}/submissions`}
        title={submission.partnerName}
        meta={
          <>
            <span className="truncate">{campaign.title}</span>
            {isLocked && (
              <span className="inline-flex items-center gap-1 shrink-0">
                <span className="text-muted-foreground/40">·</span>
                <Lock className="w-3 h-3" /> Locked to customer
              </span>
            )}
          </>
        }
        actions={
          <>
            <ViewAsCustomerButton partnerMkId={submission.partnerMkId} to={`/portal/preorders/${campaignId}`} className="hidden sm:inline-flex" />
            <SubmissionStageBadge stage={stage} />
            <MoreMenu>
              {(close) => (
                <>
                  {isLocked && (
                    <MenuItem icon={LockOpen} label="Unlock for customer" onClick={() => { close(); setDeleteInMk(false); setUnlockDialog(true); }} />
                  )}
                  <MenuItem icon={Trash2} label="Delete submission" destructive onClick={() => { close(); setDeleteDialogOpen(true); }} />
                </>
              )}
            </MoreMenu>
          </>
        }
        navExtra={filledTabs.length > 0 ? <TabBar tabs={filledTabs} activeId={activeTabId} onSelect={setActiveTabId} quantities={quantities} /> : undefined}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="min-w-0 space-y-6">
            {actionError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive">{actionError}</div>
            )}

            {submission.unlockRequest && (
              <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <LockOpen className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-amber-800 dark:text-amber-200">Customer requested changes</div>
                    {submission.unlockRequest.note ? (
                      <p className="text-[12px] text-amber-700 dark:text-amber-300 mt-0.5 whitespace-pre-line">{submission.unlockRequest.note}</p>
                    ) : (
                      <p className="text-[12px] text-amber-700/70 dark:text-amber-300/70 mt-0.5 italic">No note provided.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="xs" variant="outline" onClick={dismissRequest} disabled={busy !== null}>Dismiss</Button>
                    {isLocked && (
                      <Button size="xs" onClick={() => { setDeleteInMk(false); setUnlockDialog(true); }} disabled={busy !== null}><LockOpen className="w-3 h-3" /> Unlock</Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 1 · Requested preorder */}
            <section>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h2 className="text-[13px] font-semibold text-foreground">Requested preorder</h2>
                <span className="text-[11px] text-muted-foreground">
                  what the customer submitted{submission.submittedAt ? ` · ${fmtDateTime(submission.submittedAt)}` : ""}
                  {submission.submitSource === "admin" ? ` · filled by ${submission.submittedBy ?? "admin"}` : ""}
                </span>
              </div>
              {snap && (
                <p
                  className="mb-3 text-[12px] text-muted-foreground flex flex-wrap items-center gap-x-1.5"
                  title={`Price list: ${CONFIG_SOURCE_LABELS[snap.sources.pricelist]} · Currency: ${CONFIG_SOURCE_LABELS[snap.sources.currency]}`}
                >
                  {snap.market ? <MarketChip name={snap.market.name} color="sky" /> : <span>No market</span>}
                  {snap.countryIso && <><span className="text-border">·</span><span className="inline-flex items-center gap-1"><Flag iso={snap.countryIso} /> {snap.countryIso}</span></>}
                  <span className="text-border">·</span>
                  <span>{snap.partnerPricelist ?? "sheet prices"}</span>
                  <span className="text-border">·</span>
                  <span>{snap.currency}</span>
                  {snap.pricing ? (
                    <>
                      <span className="text-border">·</span>
                      <span className="inline-flex items-center gap-1 text-foreground">
                        {snap.pricing.kind === "business" ? <Building2 className="w-3 h-3" /> : <UserRound className="w-3 h-3" />}
                        {CUSTOMER_KIND_LABELS[snap.pricing.kind]}
                      </span>
                      <span>{snap.pricing.basis === "rrp" ? "at RRP incl." : "at partner price, "} {fmtVatRate(snap.pricing.vatRate)} VAT</span>
                      <span className="text-[11px]">({VAT_SOURCE_LABELS[snap.pricing.vatSource].toLowerCase()})</span>
                    </>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300">· no VAT snapshot — re-priced on register</span>
                  )}
                </p>
              )}
              {/* What the customer saw while filling: how they are priced and the discount they reached. */}
              {sheet.pricing && activeTab && (
                <div className="mb-3 rounded-xl border border-border bg-surface overflow-hidden">
                  <SheetContextBar pricing={sheet.pricing} tab={activeTab} quantities={quantities} currency={currency} />
                </div>
              )}
              {isLegacy && (
                <div className="mb-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0" /> Legacy submission (before immediate Metakocka registration) — shown with the campaign&rsquo;s current prices.
                </div>
              )}
              {activeTab ? (
                <PreorderGridTab
                  tab={activeTab}
                  quantities={quantities}
                  currency={currency}
                  readOnly
                  onlyFilled
                  qtyHeader="Requested"
                  extraHeader={legacyConfirmed ? <th className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-2 text-left w-40">Fulfilment</th> : undefined}
                  renderExtraCell={legacyConfirmed ? renderLegacyCell : undefined}
                  pricing={sheet.pricing}
                />
              ) : (
                <div className="text-center text-[13px] text-muted-foreground py-12 rounded-xl border border-dashed border-border">No items in this preorder.</div>
              )}
            </section>

            {/* 2 · Current Metakocka order */}
            <MkOrderPanel
              submission={submission}
              allocation={allocation}
              currency={currency}
              mkDocHref={mkDocHref}
              busy={busy}
              onRefresh={refreshOrder}
              onRegister={register}
            />
          </div>

          <aside className="lg:sticky lg:top-4 space-y-3">
            <OrderSummaryPanel campaign={sheet} quantities={quantities} currency={currency} confirmed={legacyConfirmed} />

            {/* 3 · Customer visibility */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-2.5 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Customer visibility</div>
                <VisibilityBadge published={published} />
              </div>
              {published ? (
                <>
                  <p className="text-muted-foreground">
                    The customer sees the <strong className="text-foreground">current Metakocka order</strong> on their preorder page and under Orders.
                  </p>
                  {submission.resultPublishedAt && (
                    <div className="text-[11px] text-muted-foreground">
                      Shown {fmtDateTime(submission.resultPublishedAt)}
                      {submission.resultPublishedBy ? ` · ${submission.resultPublishedBy}` : ""}
                    </div>
                  )}
                  {allocation.state === "ok" && allocation.allocation.changedSincePublish && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/50 px-2.5 py-2 text-amber-800 dark:text-amber-200 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> The order changed in Metakocka since it was shown — the customer already sees the new version.
                    </div>
                  )}
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setPublishDialog("hide")} disabled={busy !== null}>
                    <EyeOff className="w-3.5 h-3.5" /> Hide from customer
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    The customer sees only what they requested. Allocation changes in Metakocka stay private until you show the order.
                  </p>
                  <Button size="sm" className="w-full" onClick={() => setPublishDialog("show")} disabled={busy !== null || !hasOrder || allocation.state === "missing"}>
                    <Eye className="w-3.5 h-3.5" /> Show order to customer
                  </Button>
                  {!hasOrder && <p className="text-[11px] text-muted-foreground">Register the Metakocka order first.</p>}
                </>
              )}
            </div>

            {/* Metakocka registration */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-2.5 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Metakocka</div>
                <MkOrderStateBadge state={mkState} />
              </div>
              {submission.mkSalesOrder && mkDocHref ? (
                <div className="space-y-1">
                  <Link href={mkDocHref} className="flex w-fit items-center gap-1.5 font-mono text-foreground hover:text-lime-600">
                    {submission.mkSalesOrder.countCode} <ExternalLink className="w-3 h-3 shrink-0" />
                  </Link>
                  {submission.mkSalesOrder.createdAt && (
                    <div className="text-[11px] text-muted-foreground">
                      {fmtDateTime(submission.mkSalesOrder.createdAt)}
                      {submission.mkSalesOrder.createdBy ? ` · ${submission.mkSalesOrder.createdBy}` : ""}
                      {mkState === "legacy" ? " · created manually" : ""}
                    </div>
                  )}
                </div>
              ) : submission.status !== "submitted" ? (
                <p className="text-muted-foreground">The order is registered when the customer submits.</p>
              ) : null}
              {submission.mkOrder?.state === "pending" && (
                <p className="text-sky-700 dark:text-sky-300 inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Registering… since {fmtDateTime(submission.mkOrder.lockedAt)}</p>
              )}
              {submission.mkOrder?.state === "failed" && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/50 px-2.5 py-2 space-y-1">
                  <div className="font-medium text-rose-700 dark:text-rose-300">Registration failed ({submission.mkOrder.attempts} attempt{submission.mkOrder.attempts === 1 ? "" : "s"})</div>
                  <div className="text-[11px] text-rose-700/80 dark:text-rose-300/80 break-words">{submission.mkOrder.lastError}</div>
                </div>
              )}
              {submission.status === "submitted" && (mkState === "failed" || (mkState === "pending" && isStale(submission.mkOrder?.lockedAt))) && (
                <Button size="sm" className="w-full" onClick={register} disabled={busy !== null}>
                  {busy === "register" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />} Register in Metakocka
                </Button>
              )}
              {submission.status === "submitted" && !submission.mkOrder && !submission.mkSalesOrder && (
                <Button size="sm" className="w-full" onClick={register} disabled={busy !== null}>
                  {busy === "register" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />} Register in Metakocka
                </Button>
              )}
              {submission.mkOrder?.buyerOrder && (
                <div className="text-[10px] text-muted-foreground font-mono">buyer_order {submission.mkOrder.buyerOrder}</div>
              )}
              {(submission.mkSalesOrderHistory?.length ?? 0) > 0 && (
                <div className="pt-1 border-t border-border/60">
                  <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mb-1"><History className="w-3 h-3" /> Superseded orders</div>
                  <ul className="space-y-0.5">
                    {submission.mkSalesOrderHistory!.map((h) => (
                      <li key={h.mkId} className="text-[11px] flex items-center gap-1.5">
                        <Link href={`/documents/${encodeURIComponent(submission.partnerMkId)}/order/${encodeURIComponent(h.mkId)}`} className="font-mono text-foreground hover:text-lime-600">{h.countCode || h.mkId}</Link>
                        <span className="text-muted-foreground">{h.deletedInMk ? "deleted in MK" : "detached"} · {fmtDateTime(h.detachedAt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Partner details */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-2 text-[12px]">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Partner details</div>
              {submission.partnerEmail && <Detail icon={Mail} value={submission.partnerEmail} />}
              {t.phone && <Detail icon={Phone} value={t.phone} />}
              {t.invoiceAddress && <Detail icon={MapPin} label="Invoice" value={t.invoiceAddress} />}
              {t.shippingAddress && <Detail icon={Truck} label="Shipping" value={t.shippingAddress} />}
              {t.country && <Detail icon={MapPin} label="Country" value={t.country} />}
              {t.deliveryDate && <Detail icon={Truck} label="Requested" value={new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(t.deliveryDate))} />}
              {t.comment && <Detail icon={MessageSquare} label="Comment" value={t.comment} />}
              {!submission.partnerEmail && !t.phone && !t.invoiceAddress && !t.shippingAddress && !t.comment && (
                <p className="text-muted-foreground">No additional details provided.</p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Show / hide confirmation */}
      <Dialog open={publishDialog !== null} onOpenChange={(o) => !o && busy !== "publish" && setPublishDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {publishDialog === "show" ? <Eye className="w-4 h-4 text-lime-600" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
              {publishDialog === "show" ? "Show order to customer" : "Hide order from customer"}
            </DialogTitle>
          </DialogHeader>
          <div className="text-[13px] text-muted-foreground space-y-2">
            {publishDialog === "show" ? (
              <>
                <p>
                  <strong className="text-foreground">{submission.partnerName}</strong> will see the current Metakocka order
                  {allocation.state === "ok" && (
                    <>
                      {" "}— <strong className="text-foreground">{allocation.allocation.allocatedQty}</strong> of{" "}
                      <strong className="text-foreground">{allocation.allocation.requestedQty}</strong> requested items
                      {allocation.allocation.sumAll ? <>, {fmtMoney(Number(allocation.allocation.sumAll), allocation.allocation.currency ?? currency)}</> : null}
                    </>
                  )}{" "}
                  on their preorder page and under Orders in the portal.
                </p>
                <p>Further changes you make to the order in Metakocka will be visible to them immediately.</p>
              </>
            ) : (
              <p>
                The order will disappear from the customer&rsquo;s preorder page and their Orders list. They will again see only what they requested.
              </p>
            )}
          </div>
          {actionError && <p className="text-[12px] text-destructive">{actionError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setPublishDialog(null)} disabled={busy === "publish"}>Cancel</Button>
            <Button size="sm" onClick={() => publish(publishDialog === "show")} disabled={busy === "publish"}>
              {busy === "publish" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : publishDialog === "show" ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {publishDialog === "show" ? "Show to customer" : "Hide"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unlock (detach) confirmation */}
      <Dialog open={unlockDialog} onOpenChange={(o) => !o && busy !== "unlock" && setUnlockDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LockOpen className="w-4 h-4 text-lime-600" /> Unlock for customer</DialogTitle>
          </DialogHeader>
          <div className="text-[13px] text-muted-foreground space-y-2">
            <p>
              <strong className="text-foreground">{submission.partnerName}</strong> will be able to edit and resubmit their preorder.
            </p>
            {submission.mkSalesOrder ? (
              <>
                <p>
                  The Metakocka order <span className="font-mono text-foreground">{submission.mkSalesOrder.countCode}</span> will be <strong className="text-foreground">detached</strong> from this preorder (it stays hidden from the customer). A new order is created when they resubmit.
                </p>
                <CheckboxRow
                  checked={deleteInMk}
                  onCheckedChange={setDeleteInMk}
                  title="Also delete it in Metakocka"
                  hint="Otherwise staff must cancel it there by hand."
                />
              </>
            ) : submission.mkOrder?.state === "pending" ? (
              <p className="text-amber-600 dark:text-amber-400">A registration is in progress — unlocking is refused until it settles.</p>
            ) : null}
          </div>
          {actionError && <p className="text-[12px] text-destructive">{actionError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setUnlockDialog(false)} disabled={busy === "unlock"}>Cancel</Button>
            <Button size="sm" onClick={unlock} disabled={busy === "unlock"}>
              {busy === "unlock" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LockOpen className="w-3.5 h-3.5" />} Unlock
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={(o) => !o && setDeleteDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="w-4 h-4" /> Delete submission</DialogTitle>
          </DialogHeader>
          <div className="text-[13px] text-muted-foreground space-y-2">
            <p>
              Permanently delete <strong className="text-foreground">{submission.partnerName}</strong>&rsquo;s submission for{" "}
              <strong className="text-foreground">{campaign.title}</strong>? This can&rsquo;t be undone.
            </p>
            <p>The partner can then start a fresh preorder for this campaign.</p>
            {submission.mkSalesOrder && (
              <p className="text-amber-600 dark:text-amber-400">
                The Metakocka order ({submission.mkSalesOrder.countCode}) is <strong>not</strong> deleted; it stays hidden from the customer.
              </p>
            )}
          </div>
          {actionError && <p className="text-[12px] text-destructive">{actionError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)} disabled={busy === "delete"}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={deleteSubmission} disabled={busy === "delete"}>
              {busy === "delete" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function isStale(lockedAt?: string | null): boolean {
  if (!lockedAt) return true;
  return Date.now() - new Date(lockedAt).getTime() > 180_000;
}

// The "Current Metakocka order" panel: the live order joined with the request.
function MkOrderPanel({
  submission,
  allocation,
  currency,
  mkDocHref,
  busy,
  onRefresh,
  onRegister,
}: {
  submission: PreorderSubmission;
  allocation: AllocationResult;
  currency: string;
  mkDocHref: string | null;
  busy: string | null;
  onRefresh: () => void;
  onRegister: () => void;
}) {
  const state = submission.mkOrder?.state ?? (submission.mkSalesOrder ? "legacy" : null);
  const head = (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <h2 className="text-[13px] font-semibold text-foreground">Current Metakocka order</h2>
      <span className="text-[11px] text-muted-foreground">what exists in Metakocka right now</span>
      <div className="flex-1" />
      {submission.mkSalesOrder && (
        <Button size="xs" variant="ghost" onClick={onRefresh} disabled={busy !== null} title="Re-read the order from Metakocka">
          {busy === "refresh" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
        </Button>
      )}
      {mkDocHref && (
        <Link href={mkDocHref} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Open in Documents <ExternalLink className="w-3 h-3" />
        </Link>
      )}
    </div>
  );

  if (submission.status !== "submitted" && submission.status !== "confirmed") {
    return (
      <section>
        {head}
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted-foreground">Not submitted yet — no order exists.</div>
      </section>
    );
  }
  if (state === "pending") {
    return (
      <section>
        {head}
        <div className="rounded-xl border border-sky-200/70 bg-sky-50 dark:border-sky-800/50 dark:bg-sky-950/30 px-4 py-4 text-[12px] text-sky-800 dark:text-sky-200 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" /> Registering the order in Metakocka…
        </div>
      </section>
    );
  }
  if (state === "failed" || !submission.mkSalesOrder) {
    return (
      <section>
        {head}
        <div className="rounded-xl border border-rose-200/70 bg-rose-50 dark:border-rose-800/50 dark:bg-rose-950/30 px-4 py-4 text-[12px] text-rose-800 dark:text-rose-200 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">No Metakocka order yet{state === "failed" ? " — the registration failed" : ""}.</div>
            {submission.mkOrder?.lastError && <div className="text-[11px] mt-0.5 break-words opacity-80">{submission.mkOrder.lastError}</div>}
          </div>
          <Button size="sm" onClick={onRegister} disabled={busy !== null} className="shrink-0">
            {busy === "register" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />} Register now
          </Button>
        </div>
      </section>
    );
  }
  if (allocation.state === "missing") {
    return (
      <section>
        {head}
        <div className="rounded-xl border border-rose-200/70 bg-rose-50 dark:border-rose-800/50 dark:bg-rose-950/30 px-4 py-4 text-[12px] text-rose-800 dark:text-rose-200 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Order {submission.mkSalesOrder.countCode} no longer exists in Metakocka.</div>
            <div className="text-[11px] mt-0.5 opacity-80">It was deleted there. Unlock the customer to detach it, or re-register from the menu after detaching.</div>
          </div>
        </div>
      </section>
    );
  }
  if (allocation.state === "unavailable") {
    return (
      <section>
        {head}
        <div className="rounded-xl border border-amber-300/70 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 px-4 py-4 text-[12px] text-amber-900 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Metakocka is not reachable right now — {allocation.error}
        </div>
      </section>
    );
  }
  if (allocation.state !== "ok") return null;
  const a: AllocationView = allocation.allocation;
  const diff = a.allocatedQty - a.requestedQty;
  return (
    <section>
      {head}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border text-[12px]">
          <span className="inline-flex items-center gap-1.5 font-mono text-foreground">{a.countCode}</span>
          {a.mkStatusDesc && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{a.mkStatusDesc}</span>}
          <span className="text-muted-foreground">
            Requested <span className="font-medium text-foreground tabular-nums">{a.requestedQty}</span> · Current{" "}
            <span className={cn("font-semibold tabular-nums", diff === 0 ? "text-lime-600 dark:text-lime-400" : diff < 0 ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400")}>{a.allocatedQty}</span>
            {diff !== 0 && <span className="text-muted-foreground"> ({diff > 0 ? "+" : ""}{diff})</span>}
          </span>
          {a.sumAll && <span className="text-muted-foreground">Total <span className="font-medium text-foreground tabular-nums">{fmtMoney(Number(a.sumAll), a.currency ?? currency)}</span></span>}
          <span className="text-[10px] text-muted-foreground ml-auto">read {fmtDateTime(a.fetchedAt)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                <th className="text-left px-4 py-2">Product</th>
                <th className="text-right px-2 py-2 w-20">Requested</th>
                <th className="text-right px-2 py-2 w-20">Current</th>
                <th className="text-right px-2 py-2 w-16">Δ</th>
                <th className="text-right px-2 py-2 w-24 hidden md:table-cell">Unit</th>
                <th className="text-right px-2 py-2 w-24 hidden md:table-cell">Line total</th>
                <th className="text-right px-4 py-2 w-16 hidden md:table-cell">Shipped</th>
              </tr>
            </thead>
            <tbody>
              {a.lines.map((l) => {
                const d = l.allocatedQty - l.requestedQty;
                return (
                  <tr key={l.code} className="border-t border-border/60">
                    <td className="px-4 py-1.5">
                      <div className="font-medium text-foreground truncate max-w-[26rem]">{l.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{l.code}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{l.requestedQty}</td>
                    <td className={cn("px-2 py-1.5 text-right tabular-nums font-semibold", l.status === "full" ? "text-lime-600 dark:text-lime-400" : l.status === "removed" ? "text-rose-600 dark:text-rose-400" : l.status === "added" || l.status === "increased" ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400")}>{l.allocatedQty}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{d === 0 ? "" : `${d > 0 ? "+" : ""}${d}`}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums hidden md:table-cell">{l.unitPriceWithTax != null ? fmtMoney(l.unitPriceWithTax, a.currency ?? currency) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums hidden md:table-cell">{l.lineTotal != null ? fmtMoney(l.lineTotal, a.currency ?? currency) : "—"}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground hidden md:table-cell">{l.shipped ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" /> Staff edit this order directly in Metakocka; what you see here is the live document.
        </div>
      </div>
    </section>
  );
}

// Lightweight overflow menu (no dropdown lib in the project): a toggle button + a
// positioned panel that closes on outside-click / Escape.
function MoreMenu({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setOpen((o) => !o)} aria-label="More actions" aria-expanded={open}>
        <MoreVertical className="w-4 h-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-max min-w-[200px] rounded-lg border border-border bg-background shadow-lg p-1">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, destructive }: { icon: React.ElementType; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] text-left transition-colors",
        destructive ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-muted",
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
    </button>
  );
}

function Detail({ icon: Icon, label, value }: { icon: React.ElementType; label?: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        {label && <span className="text-muted-foreground">{label}: </span>}
        <span className="text-foreground break-words">{value}</span>
      </div>
    </div>
  );
}
