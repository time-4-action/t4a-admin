"use client";
import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Check, CheckCheck, Mail, Phone, MapPin, Truck, MessageSquare, Lock, LockOpen, Minus, Plus, RotateCcw, ShoppingCart, ExternalLink, Trash2, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { TabBar, PreorderGridTab, OrderSummaryPanel, fmtMoney } from "@/app/preorder/preorder-shared";
import {
  SUBMISSION_STATUS_LABELS,
  LINE_STATUS_LABELS,
  computeConfirmedTotals,
  computeConfirmedTabTotals,
  type PreorderCampaign,
  type PreorderSubmission,
  type SubmissionStatus,
  type LineStatus,
} from "@/types/preorder";

type Fulfil = { confirmedQty: number | null; lineStatus: LineStatus };

const LINE_STATUS_DOT: Record<LineStatus, string> = {
  pending: "bg-slate-400",
  confirmed: "bg-lime-500",
  backorder: "bg-amber-500",
  cancelled: "bg-rose-500",
};

const LINE_STATUS_PILL: Record<LineStatus, string> = {
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  confirmed: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300",
  backorder: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
};

const SUB_STATUS_DOT: Record<SubmissionStatus, string> = {
  draft: "bg-amber-500",
  submitted: "bg-lime-500",
  confirmed: "bg-emerald-500",
  closed: "bg-slate-400",
};

const SUB_STATUS_STYLE: Record<SubmissionStatus, string> = {
  draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  submitted: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  closed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export default function SubmissionClient({
  campaignId,
  submissionId,
}: {
  campaignId: string;
  submissionId: string;
}) {
  const [campaign, setCampaign] = useState<PreorderCampaign | null>(null);
  const [submission, setSubmission] = useState<PreorderSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const [fulfil, setFulfil] = useState<Record<string, Fulfil>>({});
  const [status, setStatus] = useState<SubmissionStatus>("submitted");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [soDialogOpen, setSoDialogOpen] = useState(false);
  const [creatingSO, setCreatingSO] = useState(false);
  const [soError, setSoError] = useState<string | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/preorder/campaigns/${campaignId}`).then((r) => r.json()),
      fetch(`/api/admin/preorder/submissions/${submissionId}`).then((r) => r.json()),
    ])
      .then(([c, s]) => {
        if (c?.campaign) setCampaign(c.campaign);
        if (s?.submission) {
          setSubmission(s.submission);
          setStatus(s.submission.status);
          const f: Record<string, Fulfil> = {};
          for (const l of s.submission.lines) {
            f[l.rowId] = { confirmedQty: l.confirmedQty ?? null, lineStatus: l.lineStatus ?? "pending" };
          }
          setFulfil(f);
        } else {
          setError(s?.error ?? "Submission not found");
        }
        if (c?.campaign) setActiveTabId(c.campaign.tabs[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [campaignId, submissionId]);

  const quantities = useMemo(() => {
    const q: Record<string, number> = {};
    for (const l of submission?.lines ?? []) q[l.rowId] = l.qty;
    return q;
  }, [submission]);

  const currency = campaign?.currency ?? "EUR";

  // Live confirmed totals from the current (unsaved) fulfilment edits.
  const confirmedTotals = useMemo(
    () => (campaign ? computeConfirmedTotals(campaign, quantities, fulfil) : { qty: 0, amount: 0 }),
    [campaign, quantities, fulfil],
  );

  // The SAVED confirmed lines — what a Metakocka sales order would actually contain
  // (the server reads from the DB, not the unsaved edits).
  const savedConfirmed = useMemo(() => {
    let qty = 0;
    let lines = 0;
    for (const l of submission?.lines ?? []) {
      if (l.lineStatus !== "confirmed") continue;
      const c = l.confirmedQty ?? l.qty;
      if (c > 0) {
        qty += c;
        lines += 1;
      }
    }
    return { qty, lines };
  }, [submission]);

  // The volume discounts the SAVED confirmed lines earn, per tab — this is exactly what
  // the sales order will price at, so the admin sees it before pushing.
  const savedConfirmedTabs = useMemo(() => {
    if (!campaign) return [];
    const q: Record<string, number> = {};
    const conf: Record<string, Fulfil> = {};
    for (const l of submission?.lines ?? []) {
      q[l.rowId] = l.qty;
      conf[l.rowId] = { confirmedQty: l.confirmedQty ?? null, lineStatus: l.lineStatus ?? "pending" };
    }
    return computeConfirmedTabTotals(campaign, q, conf).filter((t) => t.qty > 0);
  }, [campaign, submission]);

  const savedConfirmedDiscount = useMemo(
    () => savedConfirmedTabs.reduce((n, t) => n + t.discount, 0),
    [savedConfirmedTabs],
  );

  // Unsaved edits (fulfilment or submission status) vs the saved submission — drives
  // autosave, and the sales order uses saved data so we gate on it too.
  const dirty = useMemo(() => {
    if (submission && status !== submission.status) return true;
    for (const l of submission?.lines ?? []) {
      const f = fulfil[l.rowId];
      if (!f) continue;
      if (f.lineStatus !== (l.lineStatus ?? "pending")) return true;
      if ((f.confirmedQty ?? null) !== (l.confirmedQty ?? null)) return true;
    }
    return false;
  }, [submission, fulfil, status]);

  // Only tabs that actually contain ordered items — the rest are noise on review.
  const filledTabs = useMemo(
    () =>
      (campaign?.tabs ?? []).filter((t) =>
        t.groups.some((g) => g.rows.some((r) => (quantities[r.id] || 0) > 0)),
      ),
    [campaign, quantities],
  );

  // Keep the active tab on one that has items.
  useEffect(() => {
    if (filledTabs.length === 0) return;
    if (!activeTabId || !filledTabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(filledTabs[0].id);
    }
  }, [filledTabs, activeTabId]);

  const activeTab = useMemo(() => campaign?.tabs.find((t) => t.id === activeTabId) ?? null, [campaign, activeTabId]);

  const save = useCallback(
    async (
      statusOverride?: SubmissionStatus,
      linesOverride?: { rowId: string; confirmedQty: number | null; lineStatus: LineStatus }[],
    ) => {
      if (!submission) return;
      setSaving(true);
      setError(null);
      try {
        const lines =
          linesOverride ??
          submission.lines.map((l) => ({
            rowId: l.rowId,
            confirmedQty: fulfil[l.rowId]?.confirmedQty ?? null,
            lineStatus: fulfil[l.rowId]?.lineStatus ?? "pending",
          }));
        const r = await fetch(`/api/admin/preorder/submissions/${submissionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: statusOverride ?? status, lines }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "Save failed");
        setSubmission(data.submission);
        setStatus(data.submission.status);
        setSavedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [submission, submissionId, fulfil, status],
  );

  // Autosave: persist fulfilment / status ~900ms after the last change (no manual Save
  // button). `save` re-identifies on every edit (it closes over fulfil/status), so this
  // effect re-arms the timer per change, debouncing to one write once edits settle.
  useEffect(() => {
    if (!dirty || saving) return;
    const t = setTimeout(() => { void save(); }, 900);
    return () => clearTimeout(t);
  }, [dirty, saving, save]);

  // Best-effort flush if the tab is closed mid-debounce with unsaved edits.
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    const onLeave = () => { if (dirtyRef.current) void save(); };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [save]);

  // Unlock a submitted preorder → revert to draft so the customer can edit & resubmit,
  // and reset all fulfilment back to pending (a fresh start for the amended order).
  const unlock = useCallback(async () => {
    const resetLines = (submission?.lines ?? []).map((l) => ({
      rowId: l.rowId,
      confirmedQty: null,
      lineStatus: "pending" as LineStatus,
    }));
    setFulfil(() => {
      const m: Record<string, Fulfil> = {};
      for (const l of submission?.lines ?? []) m[l.rowId] = { lineStatus: "pending", confirmedQty: null };
      return m;
    });
    setStatus("draft");
    await save("draft", resetLines);
  }, [save, submission]);

  // Push the saved confirmed lines to Metakocka as a sales order (one-shot).
  const createSalesOrder = useCallback(async () => {
    setCreatingSO(true);
    setSoError(null);
    try {
      const r = await fetch(`/api/admin/preorder/submissions/${submissionId}/sales-order`, {
        method: "POST",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Failed to create sales order");
      setSubmission(data.submission);
      setSoDialogOpen(false);
    } catch (e) {
      setSoError(e instanceof Error ? e.message : "Failed to create sales order");
    } finally {
      setCreatingSO(false);
    }
  }, [submissionId]);

  // Delete this partner's submission entirely, then return to the campaign overview.
  const deleteSubmission = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/preorder/submissions/${submissionId}`, { method: "DELETE" });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error ?? "Delete failed");
      }
      router.push(`/preorder/${campaignId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }, [submissionId, campaignId, router]);

  const isLocked = status === "submitted" || status === "confirmed";

  // Dismiss a customer's unlock request without unlocking.
  const dismissRequest = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/preorder/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissUnlockRequest: true }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Failed");
      setSubmission(data.submission);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }, [submissionId]);

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-4">
        <div className="h-6 w-56 rounded skeleton" />
        <div className="h-96 rounded-xl skeleton" />
      </div>
    );
  }
  if (error || !campaign || !submission) {
    return (
      <div className="p-8">
        <Link href={`/preorder/${campaignId}`} className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to overview
        </Link>
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</div>
      </div>
    );
  }

  const setLine = (rowId: string, patch: Partial<Fulfil>) =>
    setFulfil((prev) => ({
      ...prev,
      [rowId]: { confirmedQty: prev[rowId]?.confirmedQty ?? null, lineStatus: prev[rowId]?.lineStatus ?? "pending", ...patch },
    }));

  // Mark every ordered line confirmed (confirming its ordered quantity).
  const confirmAll = () =>
    setFulfil((prev) => {
      const next = { ...prev };
      for (const l of submission?.lines ?? []) {
        const ordered = quantities[l.rowId] || 0;
        next[l.rowId] = {
          lineStatus: "confirmed",
          confirmedQty: prev[l.rowId]?.confirmedQty ?? ordered,
        };
      }
      return next;
    });

  // Reset all fulfilment to match the customer's order (pending, confirmed = ordered).
  const resetFulfilment = () =>
    setFulfil((prev) => {
      const next = { ...prev };
      for (const l of submission?.lines ?? []) {
        next[l.rowId] = { lineStatus: "pending", confirmedQty: null };
      }
      return next;
    });

  const renderFulfilCell = (rowId: string) => {
    const qty = quantities[rowId] || 0;
    if (qty <= 0) return null;
    const f = fulfil[rowId] ?? { confirmedQty: null, lineStatus: "pending" as LineStatus };
    return (
      <div className="flex items-center gap-2">
        <ConfirmedStepper
          value={f.confirmedQty}
          ordered={qty}
          onChange={(n) => setLine(rowId, { confirmedQty: n })}
        />
        <StatusPicker value={f.lineStatus} onChange={(s) => setLine(rowId, { lineStatus: s })} />
      </div>
    );
  };

  const t = submission.terms;

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 md:px-6 h-14">
          <Link href={`/preorder/${campaignId}`} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground truncate leading-tight">{submission.partnerName}</h1>
            <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
              <span className="truncate">{campaign.title}</span>
              {isLocked && (
                <span className="inline-flex items-center gap-1 shrink-0">
                  <span className="text-muted-foreground/40">·</span>
                  <Lock className="w-3 h-3" /> Locked to customer
                </span>
              )}
            </div>
          </div>
          <div className="flex-1" />
          <span
            className="hidden sm:inline-flex text-[11px] text-muted-foreground items-center gap-1 min-w-[68px] justify-end"
            title="Changes save automatically"
          >
            {saving ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
            ) : dirty ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved</>
            ) : savedAt ? (
              <><Check className="w-3.5 h-3.5 text-lime-600" /> Saved</>
            ) : null}
          </span>

          {/* Fulfilment helpers, grouped */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <Button variant="ghost" size="sm" onClick={confirmAll} disabled={saving} className="h-8 rounded-none border-0" title="Confirm every ordered line">
              <CheckCheck className="w-3.5 h-3.5" /> Confirm all
            </Button>
            <span className="w-px self-stretch bg-border" />
            <Button variant="ghost" size="sm" onClick={resetFulfilment} disabled={saving} className="h-8 rounded-none border-0 text-muted-foreground" title="Reset all fulfilment to match the customer's order">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
          </div>

          <SubmissionStatusPicker value={status} onChange={setStatus} />

          <MoreMenu>
            {(close) => (
              <>
                {isLocked && (
                  <MenuItem
                    icon={LockOpen}
                    label="Unlock for customer"
                    onClick={() => { close(); unlock(); }}
                  />
                )}
                <MenuItem
                  icon={Trash2}
                  label="Delete submission"
                  destructive
                  onClick={() => { close(); setDeleteDialogOpen(true); }}
                />
              </>
            )}
          </MoreMenu>
        </div>
        <div className="px-4 md:px-6 pb-2">
          <TabBar tabs={filledTabs} activeId={activeTabId} onSelect={setActiveTabId} quantities={quantities} />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="min-w-0">
            {submission.unlockRequest && (
              <div className="mb-4 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
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
                    <Button size="xs" variant="outline" onClick={dismissRequest} disabled={saving}>Dismiss</Button>
                    {isLocked && (
                      <Button size="xs" onClick={unlock} disabled={saving}><LockOpen className="w-3 h-3" /> Unlock</Button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {activeTab && (
              <PreorderGridTab
                tab={activeTab}
                quantities={quantities}
                currency={currency}
                readOnly
                onlyFilled
                extraHeader={<th className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-2 text-left w-40">Fulfilment</th>}
                renderExtraCell={renderFulfilCell}
              />
            )}
          </div>

          <aside className="lg:sticky lg:top-4 space-y-3">
            <OrderSummaryPanel campaign={campaign} quantities={quantities} currency={currency} confirmed={confirmedTotals} />

            {/* Metakocka sales order */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-2.5 text-[12px]">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Metakocka</div>
              {submission.mkSalesOrder ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-lime-700 dark:text-lime-300 font-medium">
                    <Check className="w-4 h-4 shrink-0" /> Sales order created
                  </div>
                  <Link
                    href={`/documents/${encodeURIComponent(submission.partnerMkId)}/order/${encodeURIComponent(submission.mkSalesOrder.mkId)}`}
                    className="flex w-fit items-center gap-1.5 font-mono text-foreground hover:text-lime-600"
                  >
                    {submission.mkSalesOrder.countCode} <ExternalLink className="w-3 h-3 shrink-0" />
                  </Link>
                  {submission.mkSalesOrder.createdAt && (
                    <div className="text-[11px] text-muted-foreground">
                      {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(submission.mkSalesOrder.createdAt))}
                      {submission.mkSalesOrder.createdBy ? ` · ${submission.mkSalesOrder.createdBy}` : ""}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-muted-foreground">
                    Push the {savedConfirmed.lines} confirmed line{savedConfirmed.lines === 1 ? "" : "s"} ({savedConfirmed.qty} pcs) to Metakocka as a sales order.
                  </p>
                  {savedConfirmedDiscount > 0 && (
                    <div className="rounded-lg bg-lime-50 dark:bg-lime-950/30 border border-lime-200/60 dark:border-lime-800/50 px-2.5 py-2 space-y-0.5">
                      <div className="font-medium text-lime-700 dark:text-lime-300">
                        Volume discount −{fmtMoney(savedConfirmedDiscount, currency)}
                      </div>
                      {savedConfirmedTabs
                        .filter((t) => t.discount > 0)
                        .map((t) => (
                          <div key={t.tabId} className="text-muted-foreground">
                            {t.tabName}: {t.tier?.name || "Tier"} −{t.discountPct}% on {fmtMoney(t.amount, currency)}
                          </div>
                        ))}
                      <p className="text-[11px] text-muted-foreground pt-0.5">
                        Applied to each line&rsquo;s price on the order — the tier is re-checked against the
                        confirmed lines, not what was originally ordered.
                      </p>
                    </div>
                  )}
                  {dirty && (
                    <p className="text-amber-600 dark:text-amber-400">Save your changes first — the order uses saved confirmed lines.</p>
                  )}
                  {soError && <p className="text-destructive">{soError}</p>}
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={savedConfirmed.lines === 0 || dirty || saving}
                    onClick={() => { setSoError(null); setSoDialogOpen(true); }}
                    title={savedConfirmed.lines === 0 ? "Confirm at least one line first" : "Create a Metakocka sales order"}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" /> Create sales order
                  </Button>
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

      <Dialog open={soDialogOpen} onOpenChange={(o) => !o && setSoDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-lime-600" /> Create Metakocka sales order
            </DialogTitle>
          </DialogHeader>
          <div className="text-[13px] text-muted-foreground space-y-2">
            <p>
              This creates a <strong className="text-foreground">real sales order in Metakocka</strong> for{" "}
              <strong className="text-foreground">{submission.partnerName}</strong> with the{" "}
              <strong className="text-foreground">{savedConfirmed.lines}</strong> confirmed line
              {savedConfirmed.lines === 1 ? "" : "s"} ({savedConfirmed.qty} pcs).
            </p>
            <p>
              Order title: <span className="font-medium text-foreground">{campaign.season?.trim() || campaign.title}</span>.
            </p>
            {savedConfirmedDiscount > 0 && (
              <p>
                Line prices include the volume discount the confirmed lines earn —{" "}
                <strong className="text-lime-700 dark:text-lime-300">−{fmtMoney(savedConfirmedDiscount, currency)}</strong>{" "}
                across{" "}
                {savedConfirmedTabs
                  .filter((t) => t.discount > 0)
                  .map((t) => `${t.tabName} (${t.tier?.name || "tier"} −${t.discountPct}%)`)
                  .join(", ")}
                .
              </p>
            )}
          </div>
          {soError && <p className="text-[12px] text-destructive">{soError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setSoDialogOpen(false)} disabled={creatingSO}>Cancel</Button>
            <Button size="sm" onClick={createSalesOrder} disabled={creatingSO}>
              {creatingSO ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
              Create sales order
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={(o) => !o && setDeleteDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" /> Delete submission
            </DialogTitle>
          </DialogHeader>
          <div className="text-[13px] text-muted-foreground space-y-2">
            <p>
              Permanently delete <strong className="text-foreground">{submission.partnerName}</strong>&rsquo;s
              submission for <strong className="text-foreground">{campaign.title}</strong>? This can&rsquo;t be undone.
            </p>
            <p>The partner can then start a fresh preorder for this campaign.</p>
            {submission.mkSalesOrder && (
              <p className="text-amber-600 dark:text-amber-400">
                Note: the Metakocka sales order ({submission.mkSalesOrder.countCode}) already created from it is
                <strong> not</strong> deleted.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={deleteSubmission} disabled={deleting}>
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Lightweight overflow menu (no dropdown lib in the project): a toggle button + a
// positioned panel that closes on outside-click / Escape. Keeps rare actions
// (Unlock, Delete) out of the crowded toolbar.
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
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        aria-expanded={open}
      >
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

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
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

// Confirmed-quantity stepper. Empty = "same as ordered" (shows ordered qty as placeholder).
function ConfirmedStepper({
  value,
  ordered,
  onChange,
}: {
  value: number | null;
  ordered: number;
  onChange: (n: number | null) => void;
}) {
  const cur = value ?? ordered;
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-background overflow-hidden h-7">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, cur - 1))}
        className="w-7 h-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition-colors"
        disabled={cur <= 0}
        aria-label="Decrease confirmed quantity"
      >
        <Minus className="w-3 h-3" />
      </button>
      <input
        type="number"
        min={0}
        value={value ?? ""}
        placeholder={String(ordered)}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="no-spinner h-full w-9 border-x border-border bg-transparent text-center tabular-nums text-[12px] font-medium focus:outline-none focus:bg-muted/40"
        title="Confirmed quantity"
      />
      <button
        type="button"
        onClick={() => onChange(cur + 1)}
        className="w-7 h-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Increase confirmed quantity"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

// Custom submission-status picker (Radix Select with a coloured pill trigger), matching
// the per-line fulfilment picker.
function SubmissionStatusPicker({ value, onChange }: { value: SubmissionStatus; onChange: (s: SubmissionStatus) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SubmissionStatus)}>
      <SelectTrigger
        size="sm"
        className={cn(
          "h-8 w-[132px] gap-1.5 rounded-md border-0 pl-2.5 pr-2 text-[12px] font-medium shadow-none [&_svg]:opacity-60 *:data-[slot=select-value]:gap-1.5",
          SUB_STATUS_STYLE[value],
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {(Object.keys(SUBMISSION_STATUS_LABELS) as SubmissionStatus[]).map((s) => (
          <SelectItem key={s} value={s} className="text-[12px]">
            <span className="inline-flex items-center gap-2">
              <span className={cn("w-1.5 h-1.5 rounded-full", SUB_STATUS_DOT[s])} />
              {SUBMISSION_STATUS_LABELS[s]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Beautifully styled fulfilment-status picker (Radix Select with a coloured pill trigger).
function StatusPicker({ value, onChange }: { value: LineStatus; onChange: (s: LineStatus) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as LineStatus)}>
      <SelectTrigger
        size="sm"
        className={cn(
          "h-7 w-[128px] gap-1.5 rounded-full border-0 pl-2.5 pr-2 text-[11px] font-medium shadow-none [&_svg]:opacity-60 *:data-[slot=select-value]:gap-1.5",
          LINE_STATUS_PILL[value],
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {(Object.keys(LINE_STATUS_LABELS) as LineStatus[]).map((s) => (
          <SelectItem key={s} value={s} className="text-[12px]">
            <span className="inline-flex items-center gap-2">
              <span className={cn("w-1.5 h-1.5 rounded-full", LINE_STATUS_DOT[s])} />
              {LINE_STATUS_LABELS[s]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
