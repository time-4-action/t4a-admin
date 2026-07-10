"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Pencil,
  Clock,
  ChevronRight,
  Users,
  Package,
  Wallet,
  CheckCircle2,
  Eye,
  UserPlus,
  LockOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/app/preorder/preorder-shared";
import {
  CAMPAIGN_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  type PreorderCampaign,
  type PreorderSubmissionSummary,
  type SubmissionStatus,
} from "@/types/preorder";

const SUB_STATUS_STYLE: Record<SubmissionStatus, string> = {
  draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  submitted: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  closed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

export default function OverviewClient({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<PreorderCampaign | null>(null);
  const [subs, setSubs] = useState<PreorderSubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/preorder/campaigns/${campaignId}`).then((r) => r.json()),
      fetch(`/api/admin/preorder/campaigns/${campaignId}/submissions`).then((r) => r.json()),
    ])
      .then(([c, s]) => {
        if (c?.campaign) setCampaign(c.campaign);
        else setError(c?.error ?? "Campaign not found");
        setSubs(s?.submissions ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [campaignId]);

  const currency = campaign?.currency ?? "EUR";

  const kpis = useMemo(() => {
    const submitted = subs.filter((s) => s.status === "submitted" || s.status === "confirmed");
    const totalQty = submitted.reduce((n, s) => n + s.totals.qty, 0);
    const totalAmount = submitted.reduce((n, s) => n + s.totals.amount, 0);
    const confirmedAmount = subs.reduce((n, s) => n + (s.confirmedTotals?.amount ?? 0), 0);
    return { count: subs.length, submitted: submitted.length, totalQty, totalAmount, confirmedAmount };
  }, [subs]);

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-4">
        <div className="h-6 w-56 rounded skeleton" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl skeleton" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <div className="h-64 rounded-xl skeleton" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="p-8">
        <Link href="/preorder" className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to campaigns
        </Link>
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 md:px-6 h-14">
          <Link href="/preorder" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground truncate leading-tight">{campaign.title}</h1>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 font-medium",
                campaign.status === "open" ? "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300"
                : campaign.status === "closed" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>
                {CAMPAIGN_STATUS_LABELS[campaign.status]}
              </span>
              {campaign.deadline && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtDate(campaign.deadline)}</span>}
            </div>
          </div>
          <div className="flex-1" />
          <Link href={`/preorder/${campaignId}/preview`}>
            <Button variant="ghost" size="sm" className="h-8"><Eye className="w-3.5 h-3.5" /> Preview</Button>
          </Link>
          <Link href={`/preorder/${campaignId}/preview?fill=1`}>
            <Button variant="outline" size="sm" className="h-8"><UserPlus className="w-3.5 h-3.5" /> Fill for customer</Button>
          </Link>
          <Link href={`/preorder/${campaignId}/edit`}>
            <Button variant="outline" size="sm" className="h-8"><Pencil className="w-3.5 h-3.5" /> Edit sheet</Button>
          </Link>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Kpi icon={Users} label="Preorders" value={String(kpis.count)} />
            <Kpi icon={CheckCircle2} label="Submitted" value={String(kpis.submitted)} />
            <Kpi icon={Package} label="Items" value={String(kpis.totalQty)} />
            <Kpi icon={Wallet} label="Ordered value" value={fmtMoney(kpis.totalAmount, currency)} />
            <Kpi icon={CheckCircle2} label="Confirmed value" value={fmtMoney(kpis.confirmedAmount, currency)} accent />
          </div>

          {/* Submissions table */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border text-[13px] font-semibold text-foreground">Preorders</div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border">
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">Partner</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 text-right">Items</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 text-right">Ordered</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 text-right">Confirmed</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Submitted</TableHead>
                  <TableHead className="h-9 w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((s) => (
                  <TableRow key={s.id} className="border-b border-border/60 hover:bg-muted/30 group">
                    <TableCell className="pl-5 py-2.5">
                      <Link href={`/preorder/${campaignId}/submissions/${s.id}`} className="block min-w-0 focus-visible:outline-none">
                        <div className="text-[13px] font-medium text-foreground group-hover:underline truncate">{s.partnerName}</div>
                        {s.partnerEmail && <div className="text-[11px] text-muted-foreground truncate">{s.partnerEmail}</div>}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", SUB_STATUS_STYLE[s.status])}>
                          {SUBMISSION_STATUS_LABELS[s.status]}
                        </span>
                        {s.hasUnlockRequest && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-medium" title="Customer requested changes">
                            <LockOpen className="w-2.5 h-2.5" /> Change req.
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[12px]">{s.totals.qty}</TableCell>
                    <TableCell className="text-right tabular-nums text-[12px] font-medium">{fmtMoney(s.totals.amount, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums text-[12px] font-medium text-lime-700 dark:text-lime-400">
                      {s.confirmedTotals.amount > 0 ? fmtMoney(s.confirmedTotals.amount, currency) : <span className="text-muted-foreground font-normal">—</span>}
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground whitespace-nowrap">{fmtDate(s.submittedAt)}</TableCell>
                    <TableCell className="pr-4">
                      <Link href={`/preorder/${campaignId}/submissions/${s.id}`} className="flex items-center justify-end text-muted-foreground hover:text-foreground" aria-label="Open">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {subs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-[13px] text-muted-foreground py-14">
                      <Users className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
                      No preorders submitted yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", accent ? "border-lime-300 dark:border-lime-800/60 bg-lime-50/60 dark:bg-lime-950/20" : "border-border bg-surface")}>
      <div className={cn("flex items-center gap-1.5 text-[11px]", accent ? "text-lime-700 dark:text-lime-400" : "text-muted-foreground")}>
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-[20px] font-bold tabular-nums text-foreground mt-1 leading-none">{value}</div>
    </div>
  );
}
