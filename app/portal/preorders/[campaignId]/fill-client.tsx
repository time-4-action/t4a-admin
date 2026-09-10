"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
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
} from "lucide-react";
import { fmtMoney } from "@/app/preorder/preorder-shared";
import { computeConfirmedTotals } from "@/types/preorder";
import { cn } from "@/lib/utils";
import {
  TabBar,
  TabTierBanner,
  PreorderGridTab,
  PreorderGuidedTab,
  OrderSummaryPanel,
  PreorderReviewModal,
} from "@/app/preorder/preorder-shared";
import {
  LINE_STATUS_LABELS,
  type PreorderCampaign,
  type PreorderSubmission,
  type PreorderTerms,
  type LineStatus,
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

export default function FillClient({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<PreorderCampaign | null>(null);
  const [submission, setSubmission] = useState<PreorderSubmission | null>(null);
  const [partnerName, setPartnerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [terms, setTerms] = useState<PreorderTerms>({});
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("guided");
  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [status, setStatus] = useState<PreorderSubmission["status"]>("draft");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNote, setRequestNote] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/preorder/campaigns/${campaignId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error === "no-account" ? "no-account" : "not-found");
        setCampaign(data.campaign);
        setSubmission(data.submission);
        setPartnerName(data.partner?.name ?? data.submission?.partnerName ?? "");
        setActiveTabId(data.campaign.tabs[0]?.id ?? null);
        const qmap: Record<string, number> = {};
        for (const l of data.submission.lines ?? []) qmap[l.rowId] = l.qty;
        setQuantities(qmap);
        setTerms(data.submission.terms ?? {});
        setStatus(data.submission.status);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "error"))
      .finally(() => setLoading(false));
  }, [campaignId]);

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

  // Per-line admin fulfilment info (status + confirmed qty), shown on the locked view.
  const lineInfo = useMemo(() => {
    const m: Record<string, { lineStatus: LineStatus; confirmedQty: number | null }> = {};
    for (const l of submission?.lines ?? []) {
      m[l.rowId] = { lineStatus: l.lineStatus ?? "pending", confirmedQty: l.confirmedQty ?? null };
    }
    return m;
  }, [submission]);

  const filledTabs = useMemo(
    () =>
      (campaign?.tabs ?? []).filter((t) =>
        t.groups.some((g) => g.rows.some((r) => (quantities[r.id] || 0) > 0)),
      ),
    [campaign, quantities],
  );

  // On the locked view, show what the admin has confirmed alongside the ordered total.
  const confirmedTotals = useMemo(
    () => (campaign && locked ? computeConfirmedTotals(campaign, quantities, lineInfo) : undefined),
    [campaign, locked, quantities, lineInfo],
  );

  // On the locked view keep the active tab on one that actually has items.
  useEffect(() => {
    if (!locked || filledTabs.length === 0) return;
    if (!activeTabId || !filledTabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(filledTabs[0].id);
    }
  }, [locked, filledTabs, activeTabId]);

  const tabsForBar = locked ? filledTabs : campaign?.tabs ?? [];
  const activeTab = useMemo(
    () => campaign?.tabs.find((t) => t.id === activeTabId) ?? null,
    [campaign, activeTabId],
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
        if (r.status === 409) throw new Error("This preorder is locked. Please contact us to make changes.");
        if (!r.ok) throw new Error(data?.error ?? "Save failed");
        setSubmission(data.submission);
        setStatus(data.submission.status);
        setFlash(action === "submit" ? "Preorder submitted — thank you!" : "Draft saved");
        setTimeout(() => setFlash(null), 3500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setBusy(null);
      }
    },
    [campaign, campaignId, quantities, terms],
  );

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
      setSubmission(data.submission);
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
      <div className="p-6 md:p-8 space-y-4">
        <div className="h-6 w-56 rounded skeleton" />
        <div className="h-96 rounded-xl skeleton" />
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
  if (error === "not-found" || !campaign) {
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

  const renderStatusCell = (rowId: string) => {
    const info = lineInfo[rowId];
    if (!info) return null;
    return (
      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", LINE_STATUS_PILL[info.lineStatus])}>
        {LINE_STATUS_LABELS[info.lineStatus]}
      </span>
    );
  };

  // Qty column on the locked view: "ordered / confirmed". Confirmed is 0 unless the line
  // is actually confirmed; coloured amber when it differs from what was ordered.
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
              {campaign.deadline && (
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Deadline {fmtDate(campaign.deadline)}</span>
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
            <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              <button onClick={() => setMode("grid")} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-[12px]", mode === "grid" ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
                <Table2 className="w-3.5 h-3.5" /> Grid
              </button>
              <button onClick={() => setMode("guided")} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-[12px]", mode === "guided" ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
                <LayoutGrid className="w-3.5 h-3.5" /> Store
              </button>
            </div>
          )}
        </div>
        <div className="px-4 md:px-6 pb-2">
          <TabBar tabs={tabsForBar} activeId={activeTabId} onSelect={setActiveTabId} quantities={quantities} />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* Sheet */}
          <div className="min-w-0">
            {locked && (
              <div className="mb-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                This preorder is submitted and locked. You&rsquo;re viewing what you ordered and its current status. Contact us if you need changes.
              </div>
            )}
            {activeTab && (
              <TabTierBanner
                tab={activeTab}
                quantities={quantities}
                currency={campaign.currency}
                className="mb-4"
              />
            )}
            {!activeTab ? (
              <div className="text-center text-[13px] text-muted-foreground py-16">
                {locked ? "No items in this preorder." : "This sheet has no tabs yet."}
              </div>
            ) : locked ? (
              <PreorderGridTab
                tab={activeTab}
                quantities={quantities}
                currency={campaign.currency}
                readOnly
                onlyFilled
                qtyHeader="Qty / Conf."
                renderQty={renderQtyCell}
                extraHeader={<th className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-2 text-left w-32">Status</th>}
                renderExtraCell={renderStatusCell}
              />
            ) : mode === "grid" ? (
              <PreorderGridTab tab={activeTab} quantities={quantities} onQty={setQty} currency={campaign.currency} />
            ) : (
              <PreorderGuidedTab tab={activeTab} quantities={quantities} onQty={setQty} currency={campaign.currency} />
            )}

            {/* Details */}
            <section className="mt-6 rounded-xl border border-border bg-surface p-4">
              <h2 className="text-[13px] font-semibold text-foreground mb-3">Your details</h2>
              {locked ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  <ViewRow label="Name" value={partnerName} />
                  <ViewRow label="Country" value={terms.country} />
                  <ViewRow label="Invoice address" value={terms.invoiceAddress} />
                  <ViewRow label="Shipping address" value={terms.shippingAddress} />
                  <ViewRow label="Phone" value={terms.phone} />
                  <ViewRow label="Requested delivery" value={terms.deliveryDate ? fmtDate(terms.deliveryDate) : ""} />
                  {terms.comment && <ViewRow label="Comment" value={terms.comment} className="sm:col-span-2" />}
                </dl>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Name" value={partnerName} readOnly />
                  <Field label="Country" value={terms.country ?? ""} onChange={(v) => setTerms((t) => ({ ...t, country: v }))} />
                  <Field label="Invoice address" value={terms.invoiceAddress ?? ""} onChange={(v) => setTerms((t) => ({ ...t, invoiceAddress: v }))} className="sm:col-span-2" />
                  <Field label="Shipping address" value={terms.shippingAddress ?? ""} onChange={(v) => setTerms((t) => ({ ...t, shippingAddress: v }))} className="sm:col-span-2" />
                  <Field label="Phone" value={terms.phone ?? ""} onChange={(v) => setTerms((t) => ({ ...t, phone: v }))} />
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Requested delivery</label>
                    <Input
                      type="date"
                      value={terms.deliveryDate ? terms.deliveryDate.slice(0, 10) : ""}
                      onChange={(e) => setTerms((t) => ({ ...t, deliveryDate: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                      className="mt-1 h-9 text-[12px]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-medium text-muted-foreground">Comment</label>
                    <textarea
                      value={terms.comment ?? ""}
                      onChange={(e) => setTerms((t) => ({ ...t, comment: e.target.value }))}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] focus:border-ring focus:outline-none"
                      placeholder="Anything we should know about this order…"
                    />
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-4 space-y-3">
            <OrderSummaryPanel campaign={campaign} quantities={quantities} currency={campaign.currency} confirmed={confirmedTotals} />
            {locked ? (
              <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
                <div className="text-[12px] text-muted-foreground flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  This preorder is submitted and locked.
                </div>
                {submission?.unlockRequest ? (
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
                ) : (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => { setRequestNote(""); setRequestOpen(true); }}>
                    <LockOpen className="w-3.5 h-3.5" /> Request changes
                  </Button>
                )}
                {flash && <p className="text-[12px] text-lime-600 dark:text-lime-400 text-center pt-1">{flash}</p>}
                {error && error !== "no-account" && error !== "not-found" && (
                  <p className="text-[12px] text-destructive text-center pt-1">{error}</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
                <Button className="w-full" onClick={() => setReviewOpen(true)} disabled={busy !== null}>
                  <Eye className="w-4 h-4" /> Preview &amp; submit
                </Button>
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

function Field({
  label,
  value,
  onChange,
  readOnly,
  className,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <Input
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn("mt-1 h-9 text-[12px]", readOnly && "bg-muted/50 text-muted-foreground")}
      />
    </div>
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
