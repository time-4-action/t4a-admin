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
  Link2,
  Copy,
  Check,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { fmtMoney } from "@/app/preorder/preorder-shared";
import {
  CAMPAIGN_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  totalsNet,
  totalsDiscount,
  type PreorderCampaign,
  type PreorderSubmissionSummary,
  type PreorderAccessSummary,
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
  const [unlocked, setUnlocked] = useState<PreorderAccessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/preorder/campaigns/${campaignId}`).then((r) => r.json()),
      fetch(`/api/admin/preorder/campaigns/${campaignId}/submissions`).then((r) => r.json()),
    ])
      .then(([c, s]) => {
        if (c?.campaign) setCampaign(c.campaign);
        else setError(c?.error ?? "Campaign not found");
        setSubs(s?.submissions ?? []);
        setUnlocked(s?.unlocked ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [campaignId]);

  // The magic invite link (token ensured server-side); URL built from the browser origin.
  useEffect(() => {
    fetch(`/api/admin/preorder/campaigns/${campaignId}/invite`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.path) setInviteUrl(`${window.location.origin}${d.path}`);
      })
      .catch(() => {});
  }, [campaignId]);

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const currency = campaign?.currency ?? "EUR";

  const kpis = useMemo(() => {
    const submitted = subs.filter((s) => s.status === "submitted" || s.status === "confirmed");
    const totalQty = submitted.reduce((n, s) => n + s.totals.qty, 0);
    // Values are what the partner actually pays — net of the tabs' volume discounts.
    const totalAmount = submitted.reduce((n, s) => n + totalsNet(s.totals), 0);
    const confirmedAmount = subs.reduce((n, s) => n + totalsNet(s.confirmedTotals), 0);
    // Everyone with access = submitters (all hold access) + unlocked-not-started.
    const unlockedCount = subs.length + unlocked.length;
    return { count: subs.length, submitted: submitted.length, totalQty, totalAmount, confirmedAmount, unlockedCount };
  }, [subs, unlocked]);

  if (loading) return <OverviewSkeleton />;

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
          <Button variant="outline" size="sm" className="h-8" onClick={copyInvite} disabled={!inviteUrl} title={inviteUrl ?? "Invite link"}>
            {copied ? <><Check className="w-3.5 h-3.5 text-lime-600" /> Copied</> : <><Link2 className="w-3.5 h-3.5" /> Copy invite link</>}
          </Button>
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={Link2} label="Unlocked" value={String(kpis.unlockedCount)} />
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
                    <TableCell className="text-right tabular-nums text-[12px] font-medium">
                      {fmtMoney(totalsNet(s.totals), currency)}
                      {totalsDiscount(s.totals) > 0 && (
                        <div className="text-[10px] font-normal text-lime-700 dark:text-lime-400">
                          −{fmtMoney(totalsDiscount(s.totals), currency)} volume
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[12px] font-medium text-lime-700 dark:text-lime-400">
                      {totalsNet(s.confirmedTotals) > 0 ? fmtMoney(totalsNet(s.confirmedTotals), currency) : <span className="text-muted-foreground font-normal">—</span>}
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground whitespace-nowrap">{fmtDate(s.submittedAt)}</TableCell>
                    <TableCell className="pr-4">
                      <Link href={`/preorder/${campaignId}/submissions/${s.id}`} className="flex items-center justify-end text-muted-foreground hover:text-foreground" aria-label="Open">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Partners who unlocked the link but haven't started a preorder. */}
                {unlocked.map((u) => (
                  <TableRow key={`u-${u.partnerMkId}`} className="border-b border-border/60">
                    <TableCell className="pl-5 py-2.5">
                      <div className="text-[13px] font-medium text-foreground truncate">{u.partnerName}</div>
                      {u.partnerEmail && <div className="text-[11px] text-muted-foreground truncate">{u.partnerEmail}</div>}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 text-[11px] font-medium">
                        <Mail className="w-2.5 h-2.5" /> Invited
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-[12px] text-muted-foreground">—</TableCell>
                    <TableCell className="text-right text-[12px] text-muted-foreground">—</TableCell>
                    <TableCell className="text-right text-[12px] text-muted-foreground">—</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">not started</TableCell>
                    <TableCell className="pr-4" />
                  </TableRow>
                ))}
                {subs.length === 0 && unlocked.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-[13px] text-muted-foreground py-14">
                      <Users className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
                      No one has unlocked this preorder yet. Copy the invite link and share it with customers.
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

// Structural twin of the loaded overview below: same sticky header, KPI grid
// and table; static chrome (buttons, labels, headers) renders for real.
const KPI_META: { icon: React.ElementType; label: string; accent?: boolean }[] = [
  { icon: Link2, label: "Unlocked" },
  { icon: Users, label: "Preorders" },
  { icon: CheckCircle2, label: "Submitted" },
  { icon: Package, label: "Items" },
  { icon: Wallet, label: "Ordered value" },
  { icon: CheckCircle2, label: "Confirmed value", accent: true },
];

function OverviewSkeleton() {
  const th = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9";
  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 md:px-6 h-14">
          <Link href="/preorder" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            {/* text-[15px] leading-tight → 18.75px; pill row text-[11px] → 19.5px */}
            <SkeletonLine lh="h-[19px]" h="h-3.5" w="w-48" />
            <div className="flex items-center gap-2 h-[19.5px]">
              <Skeleton className="h-[19.5px] w-12 rounded-full" delay={40} />
              <Skeleton className="h-2.5 w-24" delay={60} />
            </div>
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="h-8" disabled><Link2 className="w-3.5 h-3.5" /> Copy invite link</Button>
          <Button variant="ghost" size="sm" className="h-8" disabled><Eye className="w-3.5 h-3.5" /> Preview</Button>
          <Button variant="outline" size="sm" className="h-8" disabled><UserPlus className="w-3.5 h-3.5" /> Fill for customer</Button>
          <Button variant="outline" size="sm" className="h-8" disabled><Pencil className="w-3.5 h-3.5" /> Edit sheet</Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {KPI_META.map(({ icon: Icon, label, accent }, i) => (
              <div key={label} className={cn("rounded-xl border p-3", accent ? "border-lime-300 dark:border-lime-800/60 bg-lime-50/60 dark:bg-lime-950/20" : "border-border bg-surface")}>
                <div className={cn("flex items-center gap-1.5 text-[11px]", accent ? "text-lime-700 dark:text-lime-400" : "text-muted-foreground")}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                </div>
                {/* text-[20px] leading-none → 20px */}
                <Skeleton className="h-5 w-16 mt-1" delay={stagger(i, 60)} />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border text-[13px] font-semibold text-foreground">Preorders</div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border">
                  <TableHead className={cn(th, "pl-5")}>Partner</TableHead>
                  <TableHead className={th}>Status</TableHead>
                  <TableHead className={cn(th, "text-right")}>Items</TableHead>
                  <TableHead className={cn(th, "text-right")}>Ordered</TableHead>
                  <TableHead className={cn(th, "text-right")}>Confirmed</TableHead>
                  <TableHead className={th}>Submitted</TableHead>
                  <TableHead className="h-9 w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/60">
                    <TableCell className="pl-5 py-2.5">
                      <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-36" delay={stagger(i, 60)} />
                      <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-44" delay={stagger(i, 60, 20)} />
                    </TableCell>
                    <TableCell><Skeleton className="h-[20.5px] w-20 rounded-full" delay={stagger(i, 60, 40)} /></TableCell>
                    <TableCell><SkeletonLine lh="h-[18px]" w="w-6" className="justify-end" delay={stagger(i, 60, 60)} /></TableCell>
                    <TableCell><SkeletonLine lh="h-[18px]" w="w-16" className="justify-end" delay={stagger(i, 60, 80)} /></TableCell>
                    <TableCell><SkeletonLine lh="h-[18px]" w="w-16" className="justify-end" delay={stagger(i, 60, 100)} /></TableCell>
                    <TableCell><SkeletonLine lh="h-[18px]" w="w-20" delay={stagger(i, 60, 120)} /></TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end">
                        <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
