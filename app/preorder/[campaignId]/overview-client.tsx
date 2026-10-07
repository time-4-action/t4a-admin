"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Clock,
  Users,
  Wallet,
  CheckCircle2,
  UserRoundSearch,
  Link2,
  Eye,
  AlertTriangle,
  Globe2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { fmtMoney } from "@/app/preorder/preorder-shared";
import { CampaignHeader } from "@/app/preorder/[campaignId]/campaign-nav";
import { CampaignStatusBadge } from "@/app/preorder/preorder-badges";
import { PreordersTable, PreordersTableSkeleton } from "@/app/preorder/[campaignId]/submissions/submissions-client";
import {
  totalsNet,
  type PreorderCampaignAdmin,
  type PreorderSubmissionSummary,
  type PreorderAccessSummary,
} from "@/types/preorder";

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

export default function OverviewClient({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<PreorderCampaignAdmin | null>(null);
  const [subs, setSubs] = useState<PreorderSubmissionSummary[]>([]);
  const [unlocked, setUnlocked] = useState<PreorderAccessSummary[]>([]);
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
        setUnlocked(s?.unlocked ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [campaignId]);


  const currency = campaign?.currency ?? "EUR";

  const kpis = useMemo(() => {
    const submitted = subs.filter((s) => s.status === "submitted" || s.status === "confirmed");
    const totalQty = submitted.reduce((n, s) => n + s.totals.qty, 0);
    // Values are what the partner actually pays — net of the tabs' volume discounts.
    const totalAmount = submitted.reduce((n, s) => n + totalsNet(s.totals), 0);
    const registered = subs.filter((s) => s.mkState === "created" || s.mkState === "legacy").length;
    const published = subs.filter((s) => s.published).length;
    const failures = subs.filter((s) => s.mkState === "failed").length;
    // Everyone with access = submitters (all hold access) + unlocked-not-started.
    const unlockedCount = subs.length + unlocked.length;
    const drafts = subs.length - submitted.length;
    return { count: subs.length, submitted: submitted.length, drafts, totalQty, totalAmount, registered, published, failures, unlockedCount };
  }, [subs, unlocked]);

  if (loading) return <OverviewSkeleton campaignId={campaignId} />;

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

  const marketCount = campaign.markets?.length ?? 0;

  return (
    <div className="flex flex-col h-full">
      <CampaignHeader
        campaignId={campaignId}
        active="overview"
        title={campaign.title}
        meta={
          <>
            <CampaignStatusBadge status={campaign.status} />
            {campaign.deadline && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtDate(campaign.deadline)}</span>}
            {marketCount > 0 && (
              <span className="inline-flex items-center gap-1"><Globe2 className="w-3 h-3" /> {marketCount} market{marketCount === 1 ? "" : "s"}</span>
            )}
          </>
        }
        actions={
          <>
            <Link href={`/preorder/${campaignId}/preview?pick=1`} title="Open the B2B portal as a customer and fill this campaign for them">
              <Button variant="outline" size="sm" className="h-8"><UserRoundSearch className="w-3.5 h-3.5" /> View as customer</Button>
            </Link>
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="space-y-5">
          {/* Integration failures only surface when there are some. */}
          {kpis.failures > 0 && (
            <Link
              href={`/preorder/${campaignId}/submissions?stage=failures`}
              className="flex items-center gap-2.5 rounded-xl border border-rose-300 dark:border-rose-800/60 bg-rose-50/70 dark:bg-rose-950/20 px-4 py-2.5 text-[12px] text-rose-800 dark:text-rose-200 hover:bg-rose-100/70 dark:hover:bg-rose-950/40 transition-colors"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span className="font-medium">
                {kpis.failures} preorder{kpis.failures === 1 ? "" : "s"} failed to register in Metakocka
              </span>
              <span className="text-rose-700/80 dark:text-rose-300/80">— retry from the preorder page.</span>
              <ArrowRight className="w-3.5 h-3.5 ml-auto shrink-0" />
            </Link>
          )}

          {/* The funnel: who has access → who submitted → what they asked for → what is confirmed back. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              icon={Link2}
              label="Unlocked"
              value={String(kpis.unlockedCount)}
              sub={kpis.unlockedCount === 0 ? "no one has opened the invite yet" : `${unlocked.length} not started`}
            />
            <Kpi
              icon={CheckCircle2}
              label="Submitted"
              value={String(kpis.submitted)}
              sub={kpis.drafts > 0 ? `${kpis.drafts} still drafting` : "no open drafts"}
            />
            <Kpi
              icon={Wallet}
              label="Requested"
              value={fmtMoney(kpis.totalAmount, currency)}
              sub={`${kpis.totalQty} item${kpis.totalQty === 1 ? "" : "s"} across submitted preorders`}
            />
            <Kpi
              icon={Eye}
              label="Published"
              value={String(kpis.published)}
              sub={`${kpis.registered} in Metakocka`}
              accent
            />
          </div>

          {/* Latest preorders */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground">Latest preorders</span>
              <span className="text-[11px] text-muted-foreground">most recent 10</span>
              <Link href={`/preorder/${campaignId}/submissions`} className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-lime-700 dark:text-lime-400 hover:underline">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <PreordersTable
              campaignId={campaignId}
              currency={currency}
              subs={subs}
              unlocked={unlocked}
              limit={10}
              emptyHint="No one has unlocked this preorder yet. Copy the invite link and share it with customers."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Structural twin of the loaded overview: same sticky header, KPI grid and table;
// static chrome (buttons, labels, headers) renders for real.
const KPI_META: { icon: React.ElementType; label: string; accent?: boolean }[] = [
  { icon: Link2, label: "Unlocked" },
  { icon: CheckCircle2, label: "Submitted" },
  { icon: Wallet, label: "Requested" },
  { icon: Eye, label: "Published", accent: true },
];

function OverviewSkeleton({ campaignId }: { campaignId: string }) {
  return (
    <div className="flex flex-col h-full">
      <CampaignHeader
        campaignId={campaignId}
        active="overview"
        title={<SkeletonLine lh="h-[19px]" h="h-3.5" w="w-48" />}
        meta={<><Skeleton className="h-[16.5px] w-12 rounded-full" delay={40} /><Skeleton className="h-2.5 w-24" delay={60} /></>}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-8" disabled><UserRoundSearch className="w-3.5 h-3.5" /> View as customer</Button>
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {KPI_META.map(({ icon: Icon, label, accent }, i) => (
              <div key={label} className={cn("rounded-xl border px-4 py-3.5", accent ? "border-lime-300 dark:border-lime-800/60 bg-lime-50/60 dark:bg-lime-950/20" : "border-border bg-surface")}>
                <div className={cn("flex items-center gap-1.5 text-[11px]", accent ? "text-lime-700 dark:text-lime-400" : "text-muted-foreground")}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                </div>
                {/* text-[24px] leading-none → 24px, then the 11px sub-line */}
                <Skeleton className="h-6 w-16 mt-1.5" delay={stagger(i, 60)} />
                <Skeleton className="h-2.5 w-24 mt-2" delay={stagger(i, 60, 30)} />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground">Latest preorders</span>
              <span className="text-[11px] text-muted-foreground">most recent 10</span>
            </div>
            <PreordersTableSkeleton rows={5} />
          </div>
        </div>
      </div>
    </div>
  );
}

// One funnel step: label, the headline number, and a one-line context under it.
function Kpi({ icon: Icon, label, value, sub, accent }: { icon: React.ElementType; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3.5",
        accent ? "border-lime-300 dark:border-lime-800/60 bg-lime-50/60 dark:bg-lime-950/20" : "border-border bg-surface",
      )}
    >
      <div className={cn("flex items-center gap-1.5 text-[11px]", accent ? "text-lime-700 dark:text-lime-400" : "text-muted-foreground")}>
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-[24px] font-bold tabular-nums text-foreground mt-1.5 leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-2 truncate">{sub}</div>
    </div>
  );
}
