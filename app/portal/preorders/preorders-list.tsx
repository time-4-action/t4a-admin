"use client";

// The customer's preorder campaigns as a table card — the same look as their
// invoices / orders lists: stat tiles, toolbar with a count, proportional grid
// columns, one row per campaign.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Clock, ChevronRight, CheckCircle2, PencilLine, PackageCheck, AlertTriangle, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { fmtMoney } from "@/app/preorder/preorder-shared";
import { SUBMISSION_STATUS_LABELS, type PreorderCampaignSummary, type SubmissionStatus, type SubmissionStage } from "@/types/preorder";
import type { PortalAccount } from "@/types/portal-agent";

type MyCampaign = PreorderCampaignSummary & {
  mySubmissionStatus: SubmissionStatus | null;
  myStage: SubmissionStage | null;
  myItems: number;
  myTotal: number;
  mySubmittedAt: string | null;
  myUpdatedAt: string | null;
  // Portal agents: the account this row is for (one row per campaign per account).
  account?: PortalAccount;
};

// The fill page of a row — an agent's client row carries its account explicitly.
export function preorderHref(campaignId: string, account?: PortalAccount | null): string {
  const base = `/portal/preorders/${campaignId}`;
  return account && !account.own ? `${base}?account=${encodeURIComponent(account.mkId)}` : base;
}

// Customer-facing wording for the stage — never Metakocka terminology.
function stagePill(stage: SubmissionStage | null, status: SubmissionStatus | null, campaignOpen: boolean): { label: string; cls: string; icon: React.ReactNode } {
  if (!status) {
    return campaignOpen
      ? { label: "Open — not started", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300", icon: <PencilLine className="w-3 h-3" /> }
      : { label: "Closed", cls: "bg-muted text-muted-foreground", icon: <Clock className="w-3 h-3" /> };
  }
  if (stage === "published") {
    return { label: "Order confirmed", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300", icon: <PackageCheck className="w-3 h-3" /> };
  }
  if (stage === "registration-failed") {
    return { label: "Submitted · action needed", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", icon: <AlertTriangle className="w-3 h-3" /> };
  }
  if (status === "submitted" || status === "confirmed") {
    return { label: SUBMISSION_STATUS_LABELS[status], cls: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300", icon: <CheckCircle2 className="w-3 h-3" /> };
  }
  return { label: "Draft — not submitted", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", icon: <PencilLine className="w-3 h-3" /> };
}

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

const GRID = "grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,1.4fr)_minmax(0,1fr)_24px] items-center gap-x-4";

export function PreordersList({ scope = "", multiAccount = false }: { scope?: string; multiAccount?: boolean }) {
  const [campaigns, setCampaigns] = useState<MyCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/portal/preorder/campaigns${scope ? `?account=${encodeURIComponent(scope)}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        setCampaigns(data.campaigns ?? []);
      })
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, [scope]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return campaigns.filter(
      (c) =>
        !needle ||
        c.title.toLowerCase().includes(needle) ||
        (c.season ?? "").toLowerCase().includes(needle) ||
        (c.account?.name ?? "").toLowerCase().includes(needle),
    );
  }, [campaigns, q]);

  const openToFill = campaigns.filter((c) => c.status === "open" && (!c.mySubmissionStatus || c.mySubmissionStatus === "draft")).length;
  const submitted = campaigns.filter((c) => c.mySubmissionStatus === "submitted" || c.mySubmissionStatus === "confirmed").length;
  const confirmed = campaigns.filter((c) => c.myStage === "published").length;
  const currency = campaigns[0]?.currency ?? "EUR";
  const th = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground";

  return (
    <>
      {/* Stat tiles — the same strip the invoice list opens with. */}
      <div className="grid grid-cols-3 rounded-2xl border border-border bg-surface overflow-hidden divide-x divide-border/60">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Open to fill</p>
          {loading ? <Skeleton className="h-[22px] w-8 mt-0.5" /> : <p className="text-[15px] font-bold text-foreground tabular-nums mt-0.5">{openToFill}</p>}
          <p className="text-[10px] text-muted-foreground mt-0.5">campaigns waiting for your quantities</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Submitted</p>
          {loading ? <Skeleton className="h-[22px] w-8 mt-0.5" delay={40} /> : <p className="text-[15px] font-bold text-lime-700 dark:text-lime-400 tabular-nums mt-0.5">{submitted}</p>}
          <p className="text-[10px] text-muted-foreground mt-0.5">locked, being processed</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Confirmed</p>
          {loading ? <Skeleton className="h-[22px] w-8 mt-0.5" delay={80} /> : <p className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">{confirmed}</p>}
          <p className="text-[10px] text-muted-foreground mt-0.5">order confirmed by us</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60">
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search preorders…" className="h-8 pl-8 text-xs bg-background" />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex-1" />
          <span className="text-[11px] text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{loading ? "…" : rows.length}</span> preorder{rows.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className={cn(GRID, "px-4 py-2 border-b border-border/60 bg-muted/20")}>
          <span className={th}>Preorder</span>
          <span className={cn(th, "hidden md:block")}>Deadline</span>
          <span className={cn(th, "hidden md:block text-center")}>Items</span>
          <span className={cn(th, "hidden md:block")}>Status</span>
          <span className={cn(th, "text-right")}>Amount</span>
          <span />
        </div>

        {loading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={cn(GRID, "px-4 py-3")}>
                <div>
                  <SkeletonLine lh="h-[20px]" h="h-3.5" w="w-44" delay={stagger(i)} />
                  <SkeletonLine lh="h-[16px]" h="h-2.5" w="w-24" delay={stagger(i, 80, 20)} />
                </div>
                <SkeletonLine lh="h-[18px]" w="w-24" delay={stagger(i, 80, 40)} />
                <SkeletonLine lh="h-[18px]" w="w-6 mx-auto" delay={stagger(i, 80, 60)} />
                <Skeleton className="h-5 w-28 rounded-full" delay={stagger(i, 80, 80)} />
                <SkeletonLine lh="h-[18px]" w="w-20 ml-auto" delay={stagger(i, 80, 100)} />
                <span />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <ShoppingCart className="w-6 h-6 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-[14px] font-medium text-foreground">{q ? "No preorder matches." : "No preorders yet"}</p>
            {!q && (
              <p className="text-[13px] text-muted-foreground mt-1">Preorders are unlocked by invitation. Open the link your rep shared with you to add one here.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {rows.map((c) => {
              const pill = stagePill(c.myStage, c.mySubmissionStatus, c.status === "open");
              const hasAmount = !!c.mySubmissionStatus && c.myItems > 0;
              return (
                <Link key={`${c.id}:${c.account?.mkId ?? ""}`} href={preorderHref(c.id, c.account)} className={cn(GRID, "group px-4 py-3 hover:bg-muted/30 transition-colors")}>
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="w-9 h-9 rounded-lg bg-lime-600/10 flex items-center justify-center shrink-0">
                      <ShoppingCart className="w-4 h-4 text-lime-600 dark:text-lime-500" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate">{c.title}</p>
                      {multiAccount && c.account && (
                        <p className="text-[11px] font-medium text-teal-700 dark:text-teal-300 truncate">
                          {c.account.name}
                          {c.account.own && <span className="font-normal opacity-70"> (you)</span>}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground truncate">
                        {c.season ? `${c.season}` : ""}
                        {c.mySubmittedAt ? `${c.season ? " · " : ""}submitted ${fmtDate(c.mySubmittedAt)}` : c.myUpdatedAt && c.mySubmissionStatus === "draft" ? `${c.season ? " · " : ""}draft saved ${fmtDate(c.myUpdatedAt)}` : ""}
                      </p>
                      <span className={cn("md:hidden mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", pill.cls)}>{pill.icon}{pill.label}</span>
                    </div>
                  </div>
                  <p className="hidden md:block text-[13px] text-muted-foreground tabular-nums truncate">
                    {c.deadline ? <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtDate(c.deadline)}</span> : "—"}
                  </p>
                  <p className="hidden md:block text-center text-[13px] text-muted-foreground tabular-nums">{hasAmount ? c.myItems : "—"}</p>
                  <div className="hidden md:block">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", pill.cls)}>{pill.icon}{pill.label}</span>
                  </div>
                  <p className="text-right text-[13px] font-semibold text-foreground tabular-nums">{hasAmount ? fmtMoney(c.myTotal, c.currency || currency) : "—"}</p>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all justify-self-end" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
