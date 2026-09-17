"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Clock,
  LayoutGrid,
  Table2,
  Loader2,
  Check,
  Send,
  CheckCircle2,
  Lock,
  LockOpen,
  Eye,
  RefreshCw,
  AlertTriangle,
  PackageCheck,
  ExternalLink,
  Info,
  ChevronRight,
} from "lucide-react";
import { fmtMoney } from "@/app/preorder/preorder-shared";
import { computeConfirmedTotals, flattenRows } from "@/types/preorder";
import { vatIsMissing, vatLabel } from "@/lib/pricing";
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
  SheetHeaderSkeleton,
  PreorderGridSkeleton,
  OrderSummaryPanelSkeleton,
} from "@/app/preorder/preorder-shared";
import {
  LINE_STATUS_LABELS,
  type AllocationResult,
  type AllocationView,
  type PortalCampaign,
  type PreorderCampaign,
  type PortalSubmission,
  type PreorderTerms,
  type LineStatus,
  type PricingContext,
} from "@/types/preorder";

type Mode = "grid" | "guided";

const LINE_STATUS_PILL: Record<LineStatus, string> = {
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  confirmed: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300",
  backorder: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
};

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

type LoadData = {
  campaign: PortalCampaign;
  submission: PortalSubmission;
  frozen: PreorderCampaign | null;
  allocation?: AllocationResult;
  orderMkId?: string | null;
  partner?: { name: string };
};

export default function FillClient({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<PortalCampaign | null>(null);
  const [frozen, setFrozen] = useState<PreorderCampaign | null>(null);
  const [allocation, setAllocation] = useState<AllocationResult | null>(null);
  const [orderMkId, setOrderMkId] = useState<string | null>(null);
  const [submission, setSubmission] = useState<PortalSubmission | null>(null);
  const [partnerName, setPartnerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [terms, setTerms] = useState<PreorderTerms>({});
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("guided");
  const [busy, setBusy] = useState<null | "save" | "submit" | "retry">(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [status, setStatus] = useState<PortalSubmission["status"]>("draft");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNote, setRequestNote] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const mounted = useRef(true);

  const applyLoad = useCallback((data: LoadData) => {
    setCampaign(data.campaign);
    setFrozen(data.frozen ?? null);
    setAllocation(data.allocation ?? null);
    setOrderMkId(data.orderMkId ?? null);
    setSubmission(data.submission);
    setPartnerName(data.partner?.name ?? data.submission?.partnerName ?? "");
    setStatus(data.submission.status);
    setTerms(data.submission.terms ?? {});
    const qmap: Record<string, number> = {};
    for (const l of data.submission.lines ?? []) qmap[l.rowId] = l.qty;
    setQuantities(qmap);
  }, []);

  const load = useCallback(async () => {
    const r = await fetch(`/api/portal/preorder/campaigns/${campaignId}`, { cache: "no-store" });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error === "no-account" ? "no-account" : "not-found");
    return data as LoadData;
  }, [campaignId]);

  useEffect(() => {
    mounted.current = true;
    load()
      .then((data) => {
        if (!mounted.current) return;
        applyLoad(data);
        setActiveTabId((data.frozen ?? data.campaign).tabs[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "error"))
      .finally(() => setLoading(false));
    return () => {
      mounted.current = false;
    };
  }, [load, applyLoad]);

  // While the order is being registered with Metakocka, poll until it settles.
  const registering = submission?.registration.state === "pending";
  useEffect(() => {
    if (!registering) return;
    const id = setInterval(() => {
      load()
        .then((data) => mounted.current && applyLoad(data))
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(id);
  }, [registering, load, applyLoad]);

  const setQty = useCallback((rowId: string, qty: number) => {
    setQuantities((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[rowId];
      else next[rowId] = qty;
      return next;
    });
  }, []);

  // A preorder is LOCKED once submitted (or once the campaign is no longer open).
  // Locked = view only; an admin must unlock it (revert to draft) to allow edits.
  const locked = useMemo(() => {
    if (!campaign) return false;
    if (campaign.status !== "open") return true;
    return status === "submitted" || status === "confirmed";
  }, [campaign, status]);

  // The sheet to render: the frozen snapshot once submitted (what was agreed), else
  // the live effective campaign.
  const sheet: PreorderCampaign | null = locked && frozen ? frozen : campaign;
  const currency = sheet?.currency ?? campaign?.currency ?? "EUR";
  // No configured VAT rate for this customer's country: nothing can be submitted.
  const vatMissing = vatIsMissing(campaign?.pricing);
  // Rows this customer cannot order (no consumer price) that still carry a quantity —
  // e.g. saved before the price was removed. They block submit until removed.
  const unpricedFilled = useMemo(
    () => (sheet ? flattenRows(sheet).filter(({ row }) => row.unpriced && (quantities[row.id] || 0) > 0) : []),
    [sheet, quantities],
  );
  // Saved quantities on rows that are not on this customer's sheet any more (hidden by
  // an admin, product removed). Kept in the draft; shown here so nothing vanishes
  // silently — they are left out of a submit.
  const orphanLines = useMemo(() => {
    if (!sheet || locked) return [];
    const known = new Set(flattenRows(sheet).map(({ row }) => row.id));
    return (submission?.lines ?? []).filter((l) => !known.has(l.rowId) && (quantities[l.rowId] || 0) > 0);
  }, [sheet, locked, submission, quantities]);

  // Legacy per-line admin fulfilment (submissions made before immediate registration).
  const lineInfo = useMemo(() => {
    const m: Record<string, { lineStatus: LineStatus; confirmedQty: number | null }> = {};
    for (const l of submission?.lines ?? []) {
      if (l.lineStatus) m[l.rowId] = { lineStatus: l.lineStatus, confirmedQty: l.confirmedQty ?? null };
    }
    return m;
  }, [submission]);
  const legacyFulfilment = locked && !frozen && Object.values(lineInfo).some((i) => i.lineStatus !== "pending");

  const filledTabs = useMemo(
    () =>
      (sheet?.tabs ?? []).filter((t) =>
        t.groups.some((g) => g.rows.some((r) => (quantities[r.id] || 0) > 0)),
      ),
    [sheet, quantities],
  );

  const confirmedTotals = useMemo(
    () => (sheet && legacyFulfilment ? computeConfirmedTotals(sheet, quantities, lineInfo) : undefined),
    [sheet, legacyFulfilment, quantities, lineInfo],
  );

  // On the locked view keep the active tab on one that actually has items.
  useEffect(() => {
    if (!locked || filledTabs.length === 0) return;
    if (!activeTabId || !filledTabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(filledTabs[0].id);
    }
  }, [locked, filledTabs, activeTabId]);

  const tabsForBar = locked ? filledTabs : sheet?.tabs ?? [];
  const activeTab = useMemo(
    () => sheet?.tabs.find((t) => t.id === activeTabId) ?? null,
    [sheet, activeTabId],
  );

  const save = useCallback(
    async (action: "save" | "submit") => {
      if (!campaign) return;
      setBusy(action);
      setError(null);
      try {
        const r = await fetch(`/api/portal/preorder/submissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId, quantities, terms, action }),
        });
        const data = await r.json();
        if (r.status === 409 && data?.error === "locked") throw new Error("This preorder is locked. Please contact us to make changes.");
        if (!r.ok) throw new Error(data?.message ?? data?.error ?? "Save failed");
        const dropped: string[] = data.dropped ?? [];
        if (action === "submit") {
          // Reload everything: the frozen sheet and registration state come from the server.
          const fresh = await load();
          applyLoad(fresh);
          const reg = (fresh.submission as PortalSubmission).registration.state;
          setFlash(
            reg === "done"
              ? "Preorder submitted — thank you!"
              : reg === "pending"
                ? "Preorder submitted — registering your order…"
                : "Preorder saved — registration pending.",
          );
        } else {
          setSubmission(data.submission);
          setStatus(data.submission.status);
          setFlash(dropped.length ? `Draft saved · ${dropped.length} item${dropped.length === 1 ? "" : "s"} kept aside (no longer offered to you)` : "Draft saved");
        }
        setTimeout(() => setFlash(null), 4500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setBusy(null);
      }
    },
    [campaign, campaignId, quantities, terms, load, applyLoad],
  );

  const retryRegistration = useCallback(async () => {
    if (!submission?.id) return;
    setBusy("retry");
    setError(null);
    try {
      const r = await fetch(`/api/portal/preorder/submissions/${submission.id}/register`, { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (data?.submission) setSubmission(data.submission);
      const fresh = await load();
      applyLoad(fresh);
    } catch {
      setError("Could not retry right now. Please try again in a moment.");
    } finally {
      setBusy(null);
    }
  }, [submission?.id, load, applyLoad]);

  async function submitUnlockRequest() {
    setRequestBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/preorder/unlock-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, note: requestNote }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Failed");
      setSubmission((prev) => (prev ? { ...prev, unlockRequest: data.submission?.unlockRequest ?? prev.unlockRequest } : prev));
      setRequestOpen(false);
      setFlash("Change request sent — we'll be in touch.");
      setTimeout(() => setFlash(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRequestBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <SheetHeaderSkeleton
          backHref="/portal/preorders"
          right={
            <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              <span className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] bg-muted text-foreground font-medium"><Table2 className="w-3.5 h-3.5" /> Grid</span>
              <span className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground"><LayoutGrid className="w-3.5 h-3.5" /> Store</span>
            </div>
          }
        />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
            <div className="min-w-0">
              <PreorderGridSkeleton />
              <section className="mt-6 rounded-xl border border-border bg-surface p-4">
                <h2 className="text-[13px] font-semibold text-foreground mb-3">Your details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: "Name" }, { label: "Country" },
                    { label: "Invoice address", wide: true }, { label: "Shipping address", wide: true },
                    { label: "Phone" }, { label: "Requested delivery" },
                  ].map(({ label, wide }, i) => (
                    <div key={label} className={wide ? "sm:col-span-2" : undefined}>
                      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
                      <Skeleton className="mt-1 h-9 w-full rounded-md" delay={stagger(i, 40, 300)} />
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-medium text-muted-foreground">Comment</label>
                    <Skeleton className="mt-1 h-[74px] w-full rounded-md" delay={560} />
                  </div>
                </div>
              </section>
            </div>
            <aside className="lg:sticky lg:top-4 space-y-3">
              <OrderSummaryPanelSkeleton />
              <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
                <Button className="w-full" disabled><Eye className="w-4 h-4" /> Preview &amp; submit</Button>
                <Button variant="outline" className="w-full" disabled><Check className="w-4 h-4" /> Save draft</Button>
                <p className="text-[11px] text-muted-foreground text-center pt-0.5">Once submitted, your preorder is locked.</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }
  if (error === "no-account") {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <p className="text-[14px] font-medium text-foreground">No B2B account matched</p>
        <p className="text-[13px] text-muted-foreground mt-1"><Link href="/portal/no-account" className="underline">Learn more</Link></p>
      </div>
    );
  }
  if (error === "not-found" || !campaign || !sheet) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <p className="text-[14px] font-medium text-foreground">Preorder not available</p>
        <Link href="/portal/preorders" className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-2">
          <ArrowLeft className="w-4 h-4" /> Back to preorders
        </Link>
      </div>
    );
  }

  const submitted = status === "submitted" || status === "confirmed";
  const published = !!submission?.published && !!allocation;
  const registration = submission?.registration ?? { state: "none" as const, canRetry: false };

  const renderStatusCell = (rowId: string) => {
    const info = lineInfo[rowId];
    if (!info) return null;
    return (
      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", LINE_STATUS_PILL[info.lineStatus])}>
        {LINE_STATUS_LABELS[info.lineStatus]}
      </span>
    );
  };

  // Legacy qty column on the locked view: "ordered / confirmed".
  const renderQtyCell = (rowId: string, ordered: number) => {
    const info = lineInfo[rowId];
    const confirmed = info && info.lineStatus === "confirmed" ? info.confirmedQty ?? ordered : 0;
    const differs = confirmed !== ordered;
    return (
      <span className="tabular-nums text-[12px]">
        <span className="font-medium text-foreground">{ordered}</span>
        <span className="text-muted-foreground"> / </span>
        <span
          className={cn(
            "font-semibold",
            confirmed === 0
              ? "text-muted-foreground"
              : differs
              ? "text-amber-600 dark:text-amber-400"
              : "text-lime-600 dark:text-lime-400",
          )}
        >
          {confirmed}
        </span>
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 md:px-6 h-14">
          <Link href="/portal/preorders" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground truncate leading-tight">{campaign.title}</h1>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {sheet.deadline && (
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Deadline {fmtDate(sheet.deadline)}</span>
              )}
              {submitted && (
                <span className="inline-flex items-center gap-1 text-lime-600 dark:text-lime-400 font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Submitted{submission?.submittedAt ? ` ${fmtDate(submission.submittedAt)}` : ""}
                </span>
              )}
              {locked && (
                <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              )}
            </div>
          </div>
          <div className="flex-1" />
          {!locked && (
            // How to browse the sheet — sits with the tabs, where the customer is looking.
            // Two real choices with a one-line explanation each, not a tiny icon toggle.
            <div className="flex items-stretch gap-0.5 rounded-xl bg-muted p-1 shrink-0" role="group" aria-label="How to fill the order">
              {(
                [
                  ["guided", LayoutGrid, "Catalogue", "browse with pictures"],
                  ["grid", Table2, "Order sheet", "every variant in a table"],
                ] as [Mode, React.ElementType, string, string][]
              ).map(([m, Icon, label, hint]) => {
                const on = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={on}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition-colors",
                      on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", on ? "text-lime-600" : "text-muted-foreground/70")} />
                    <span className="flex flex-col leading-tight">
                      <span className="text-[12px] font-semibold">{label}</span>
                      <span className="text-[10px] text-muted-foreground">{hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {tabsForBar.length > 0 && (
          <div className="px-4 md:px-6 pb-2.5 flex items-center gap-3">
            <span className="text-[11px] font-medium text-muted-foreground shrink-0">{tabsForBar.length > 1 ? "Sections" : "Section"}</span>
            <div className="flex-1 min-w-0">
              <TabBar tabs={tabsForBar} activeId={activeTabId} onSelect={setActiveTabId} quantities={quantities} />
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* Sheet */}
          <div className="min-w-0">
            {locked && submitted && (
              <RegistrationBanner registration={registration} published={published} busy={busy === "retry"} onRetry={retryRegistration} />
            )}

            {published && allocation && (
              <YourOrderCard allocation={allocation} currency={currency} orderMkId={orderMkId} pricing={sheet?.pricing} />
            )}

            {locked && !submitted && (
              <div className="mb-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                This campaign is closed. You&rsquo;re viewing your preorder as it was saved.
              </div>
            )}

            {locked && submitted && (
              <h2 className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-2">
                Your preorder request
                <span className="text-[11px] font-normal text-muted-foreground">what you submitted{submission?.submittedAt ? ` on ${fmtDate(submission.submittedAt)}` : ""}</span>
              </h2>
            )}

            {/* One quiet frame for everything the customer needs to know while filling:
                how they are priced, and how far they are from the section's discount. */}
            {(sheet.pricing || orphanLines.length > 0 || unpricedFilled.length > 0 || (activeTab && (activeTab.tiers?.length ?? 0) > 0)) && (
              <div className="mb-4 rounded-xl border border-border bg-surface overflow-hidden divide-y divide-border/60">
                <PricingBanner pricing={sheet.pricing} bare />
                {orphanLines.length > 0 && (
                  <div className="px-4 py-2.5 text-[12px] text-amber-800 dark:text-amber-300 flex items-start gap-2.5 bg-amber-50/70 dark:bg-amber-950/30">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-amber-600" />
                    <div className="min-w-0">
                      <span className="font-semibold">{orphanLines.length} item{orphanLines.length === 1 ? "" : "s"} from your saved preorder {orphanLines.length === 1 ? "is" : "are"} no longer offered to you</span>{" "}
                      ({orphanLines.slice(0, 4).map((l) => `${l.code || "item"} × ${l.qty}`).join(", ")}{orphanLines.length > 4 ? ", …" : ""}). {orphanLines.length === 1 ? "It stays" : "They stay"} in your draft but will not be part of a submitted preorder — contact us if you still need {orphanLines.length === 1 ? "it" : "them"}.
                    </div>
                  </div>
                )}
                {unpricedFilled.length > 0 && !locked && (
                  <div className="px-4 py-2.5 text-[12px] text-amber-800 dark:text-amber-300 flex items-start gap-2.5 bg-amber-50/70 dark:bg-amber-950/30">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-amber-600" />
                    <div className="min-w-0">
                      <span className="font-semibold">{unpricedFilled.length} product{unpricedFilled.length === 1 ? "" : "s"} in your preorder {unpricedFilled.length === 1 ? "has" : "have"} no consumer price yet</span>{" "}
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
                {activeTab && <TabTierBanner tab={activeTab} quantities={quantities} currency={currency} pricing={sheet.pricing} bare />}
              </div>
            )}
            {!activeTab ? (
              <div className="text-center text-[13px] text-muted-foreground py-16">
                {locked ? "No items in this preorder." : "This sheet has no tabs yet."}
              </div>
            ) : locked ? (
              legacyFulfilment ? (
                <PreorderGridTab
                  tab={activeTab}
                  quantities={quantities}
                  currency={currency}
                  readOnly
                  onlyFilled
                  qtyHeader="Qty / Conf."
                  renderQty={renderQtyCell}
                  extraHeader={<th className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-2 text-left w-32">Status</th>}
                  renderExtraCell={renderStatusCell}
                  pricing={sheet.pricing}
                />
              ) : (
                <PreorderGridTab tab={activeTab} quantities={quantities} currency={currency} readOnly onlyFilled pricing={sheet.pricing} />
              )
            ) : mode === "grid" ? (
              <PreorderGridTab tab={activeTab} quantities={quantities} onQty={setQty} currency={currency} pricing={sheet.pricing} />
            ) : (
              <PreorderGuidedTab tab={activeTab} quantities={quantities} onQty={setQty} currency={currency} pricing={sheet.pricing} />
            )}

          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-4 space-y-3">
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <OrderSummaryPanel campaign={sheet} quantities={quantities} currency={currency} confirmed={confirmedTotals} bare />
            {campaign.effective.minOrderAmount && !locked && (
              <p className="text-[11px] text-muted-foreground px-4 -mt-2 pb-2">
                Minimum order value: <span className="font-medium text-foreground">{fmtMoney(campaign.effective.minOrderAmount, currency)}</span>
              </p>
            )}
            {locked ? (
              <div className="border-t border-border/60 p-3 space-y-2">
                <div className="text-[12px] text-muted-foreground flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {submitted ? "This preorder is submitted and locked." : "This campaign is closed."}
                </div>
                {submitted && submission?.unlockRequest ? (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/50 px-2.5 py-2 text-[12px]">
                    <div className="font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1">
                      <LockOpen className="w-3 h-3" /> Change request sent
                    </div>
                    {submission.unlockRequest.note && (
                      <p className="text-muted-foreground mt-1 whitespace-pre-line">{submission.unlockRequest.note}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">Awaiting admin approval.</p>
                    <button
                      onClick={() => { setRequestNote(submission.unlockRequest?.note ?? ""); setRequestOpen(true); }}
                      className="text-[11px] text-amber-700 dark:text-amber-300 underline mt-1"
                    >
                      Update request
                    </button>
                  </div>
                ) : submitted ? (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => { setRequestNote(""); setRequestOpen(true); }}>
                    <LockOpen className="w-3.5 h-3.5" /> Request changes
                  </Button>
                ) : null}
                {flash && <p className="text-[12px] text-lime-600 dark:text-lime-400 text-center pt-1">{flash}</p>}
                {error && error !== "no-account" && error !== "not-found" && (
                  <p className="text-[12px] text-destructive text-center pt-1">{error}</p>
                )}
              </div>
            ) : (
              <div className="border-t border-border/60 p-3 space-y-2">
                <Button className="w-full bg-lime-600 hover:bg-lime-700 text-white" onClick={() => setReviewOpen(true)} disabled={busy !== null || vatMissing || unpricedFilled.length > 0}>
                  <Eye className="w-4 h-4" /> Preview &amp; submit
                </Button>
                {vatMissing && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 text-center">
                    Submitting is disabled until the VAT rate for your country is configured.
                  </p>
                )}
                <Button variant="outline" className="w-full" onClick={() => save("save")} disabled={busy !== null}>
                  {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save draft
                </Button>
                <p className="text-[11px] text-muted-foreground text-center pt-0.5">Once submitted, your preorder is locked.</p>
                {flash && <p className="text-[12px] text-lime-600 dark:text-lime-400 text-center pt-1">{flash}</p>}
                {error && error !== "no-account" && error !== "not-found" && (
                  <p className="text-[12px] text-destructive text-center pt-1">{error}</p>
                )}
              </div>
            )}
            </div>

            {/* The only two things the customer fills in besides quantities. */}
            {!locked && (
              <div className="rounded-xl border border-border bg-surface p-3 space-y-2.5">
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
            )}

            {!locked && campaign.effective.note && (
              <div className="rounded-xl border border-lime-300/60 bg-lime-50 dark:border-lime-800/50 dark:bg-lime-950/30 px-3 py-2.5 text-[12px] text-lime-900 dark:text-lime-200 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-lime-700 dark:text-lime-400">Your terms</div>
                  <p className="whitespace-pre-line mt-0.5">{campaign.effective.note}</p>
                </div>
              </div>
            )}

            {/* Who is ordering — Metakocka's data, read-only, tucked away. */}
            <details className="rounded-xl border border-border bg-surface group">
              <summary className="cursor-pointer list-none px-3 py-2 flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground">
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                <span className="font-medium text-foreground truncate">{partnerName}</span>
                <span className="ml-auto text-[11px]">your details</span>
              </summary>
              <dl className="px-3 pb-3 space-y-1.5 text-[12px]">
                <ViewRow label="Invoice address" value={terms.invoiceAddress} />
                <ViewRow label="Shipping address" value={terms.shippingAddress} />
                <ViewRow label="Country" value={terms.country} />
                <ViewRow label="Phone" value={terms.phone} />
                {locked && <ViewRow label="Requested delivery" value={terms.deliveryDate ? fmtDate(terms.deliveryDate) : ""} />}
                {locked && terms.comment && <ViewRow label="Comment" value={terms.comment} />}
                <p className="text-[10px] text-muted-foreground pt-1">From our records — contact us if something is wrong.</p>
              </dl>
            </details>
          </aside>
        </div>
      </div>

      <PreorderReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        campaign={campaign}
        quantities={quantities}
        terms={terms}
        submitting={busy === "submit"}
        onSubmit={async () => {
          await save("submit");
          setReviewOpen(false);
        }}
      />

      <Dialog open={requestOpen} onOpenChange={(o) => !requestBusy && setRequestOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="w-4 h-4 text-lime-600" /> Request changes
            </DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-muted-foreground -mt-1">
            Tell us what you&rsquo;d like to change. An admin will review and unlock your
            preorder if approved.
          </p>
          <textarea
            autoFocus
            value={requestNote}
            onChange={(e) => setRequestNote(e.target.value)}
            rows={4}
            placeholder="e.g. I need to add 2 more boards and change one size…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] focus:border-ring focus:outline-none"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRequestOpen(false)} disabled={requestBusy}>
              Cancel
            </Button>
            <Button size="sm" onClick={submitUnlockRequest} disabled={requestBusy}>
              {requestBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// The customer-facing registration state. Deliberately free of any Metakocka
// terminology: "registered with our order system" is all they need to know.
function RegistrationBanner({
  registration,
  published,
  busy,
  onRetry,
}: {
  registration: PortalSubmission["registration"];
  published: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  if (published) return null;
  if (registration.state === "pending") {
    return (
      <div className="mb-4 rounded-xl border border-sky-200/70 bg-sky-50 dark:border-sky-800/50 dark:bg-sky-950/30 px-4 py-3 text-[13px] text-sky-800 dark:text-sky-200 flex items-center gap-2">
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
        Registering your preorder with our order system…
      </div>
    );
  }
  if (registration.state === "failed") {
    return (
      <div className="mb-4 rounded-xl border border-amber-300/70 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 px-4 py-3 text-[13px] text-amber-900 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Your preorder is saved, but we couldn&rsquo;t register it with our order system yet.</p>
            <p className="text-[12px] mt-0.5 text-amber-800/80 dark:text-amber-300/80">Nothing is lost — you can retry now, or we will register it for you shortly.</p>
          </div>
          {registration.canRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} disabled={busy} className="shrink-0">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Retry
            </Button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground flex items-center gap-2">
      <Lock className="w-4 h-4 shrink-0" />
      This preorder is submitted and being processed. You&rsquo;ll see your confirmed order here once it is ready.
    </div>
  );
}

// "Your order": the current, confirmed order once an admin has shown it to the customer.
// Compares what was requested with what was allocated, line by line.
function YourOrderCard({
  allocation,
  currency,
  orderMkId,
  pricing,
}: {
  allocation: AllocationResult;
  currency: string;
  orderMkId: string | null;
  pricing?: PricingContext | null;
}) {
  if (allocation.state === "missing") {
    return (
      <div className="mb-5 rounded-xl border border-border bg-surface px-4 py-3 text-[13px] text-muted-foreground flex items-center gap-2">
        <Info className="w-4 h-4 shrink-0" /> Your order is being updated — check back soon.
      </div>
    );
  }
  if (allocation.state === "unavailable") {
    return (
      <div className="mb-5 rounded-xl border border-amber-300/70 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 px-4 py-3 text-[13px] text-amber-900 dark:text-amber-200 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" /> Order details are temporarily unavailable. Please try again in a few minutes.
      </div>
    );
  }
  if (allocation.state !== "ok") return null;
  const a: AllocationView = allocation.allocation;
  const total = a.sumAll != null ? Number(a.sumAll) : null;
  return (
    <section className="mb-5 rounded-2xl border border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-800/50 dark:bg-emerald-950/20 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-emerald-200/60 dark:border-emerald-800/40">
        <PackageCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-foreground">Your confirmed order</h2>
          <p className="text-[11px] text-muted-foreground">
            Order {a.countCode} · Requested <span className="font-medium text-foreground tabular-nums">{a.requestedQty}</span> · Confirmed{" "}
            <span className="font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">{a.allocatedQty}</span> items
          </p>
        </div>
        {orderMkId && (
          <Link href={`/portal/orders/${orderMkId}`} className="text-[12px] font-medium text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 hover:underline shrink-0">
            View order <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              <th className="text-left px-4 py-2">Product</th>
              <th className="text-right px-2 py-2 w-24">Requested</th>
              <th className="text-right px-2 py-2 w-24">Confirmed</th>
              <th className="text-right px-4 py-2 w-28 hidden sm:table-cell">Total</th>
            </tr>
          </thead>
          <tbody>
            {a.lines.map((l) => {
              const tone =
                l.status === "full"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : l.status === "removed"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-amber-700 dark:text-amber-300";
              return (
                <tr key={l.code} className="border-t border-emerald-200/40 dark:border-emerald-800/30">
                  <td className="px-4 py-2">
                    <div className="font-medium text-foreground truncate max-w-[28rem]">{l.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{l.code}{l.status === "added" ? " · added" : ""}</div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{l.requestedQty}</td>
                  <td className={cn("px-2 py-2 text-right tabular-nums font-semibold", tone)}>{l.allocatedQty}</td>
                  <td className="px-4 py-2 text-right tabular-nums hidden sm:table-cell">{l.lineTotal != null ? fmtMoney(l.lineTotal, a.currency ?? currency) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          {total != null && (
            <tfoot>
              <tr className="border-t border-emerald-200/60 dark:border-emerald-800/40">
                <td className="px-4 py-2 text-[11px] text-muted-foreground" colSpan={3}>Order total{pricing ? ` (${vatLabel(pricing)})` : ""}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-foreground">{fmtMoney(total, a.currency ?? currency)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function ViewRow({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="text-[13px] text-foreground break-words">{value || "—"}</dd>
    </div>
  );
}
