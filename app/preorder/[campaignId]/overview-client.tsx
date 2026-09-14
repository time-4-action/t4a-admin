"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Clock,
  Users,
  Package,
  Wallet,
  CheckCircle2,
  UserPlus,
  Link2,
  Check,
  ShoppingCart,
  Eye,
  AlertTriangle,
  Globe2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { fmtMoney } from "@/app/preorder/preorder-shared";
import { CampaignNav } from "@/app/preorder/[campaignId]/campaign-nav";
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
    const registered = subs.filter((s) => s.mkState === "created" || s.mkState === "legacy").length;
    const published = subs.filter((s) => s.published).length;
    const failures = subs.filter((s) => s.mkState === "failed").length;
    // Everyone with access = submitters (all hold access) + unlocked-not-started.
    const unlockedCount = subs.length + unlocked.length;
    return { count: subs.length, submitted: submitted.length, totalQty, totalAmount, registered, published, failures, unlockedCount };
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
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 md:px-6 h-14">
          <Link href="/preorder" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground truncate leading-tight">{campaign.title}</h1>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <CampaignStatusBadge status={campaign.status} />
              {campaign.deadline && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtDate(campaign.deadline)}</span>}
              {marketCount > 0 && (
                <span className="inline-flex items-center gap-1"><Globe2 className="w-3 h-3" /> {marketCount} market{marketCount === 1 ? "" : "s"}</span>
              )}
            </div>
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="h-8" onClick={copyInvite} disabled={!inviteUrl} title={inviteUrl ?? "Invite link"}>
            {copied ? <><Check className="w-3.5 h-3.5 text-lime-600" /> Copied</> : <><Link2 className="w-3.5 h-3.5" /> Copy invite link</>}
          </Button>
          <Link href={`/preorder/${campaignId}/preview?fill=1`}>
            <Button variant="outline" size="sm" className="h-8"><UserPlus className="w-3.5 h-3.5" /> Fill for customer</Button>
          </Link>
        </div>
        <div className="px-4 md:px-6 pb-2">
          <CampaignNav campaignId={campaignId} active="overview" compact />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <Kpi icon={Link2} label="Unlocked" value={String(kpis.unlockedCount)} />
            <Kpi icon={Users} label="Preorders" value={String(kpis.count)} />
            <Kpi icon={CheckCircle2} label="Submitted" value={String(kpis.submitted)} />
            <Kpi icon={Package} label="Items" value={String(kpis.totalQty)} />
            <Kpi icon={Wallet} label="Requested value" value={fmtMoney(kpis.totalAmount, currency)} />
            <Kpi icon={ShoppingCart} label="In Metakocka" value={String(kpis.registered)} />
            <Kpi icon={Eye} label="Published" value={String(kpis.published)} accent />
            <Kpi icon={AlertTriangle} label="Integration failures" value={String(kpis.failures)} danger={kpis.failures > 0} />
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
  { icon: Users, label: "Preorders" },
  { icon: CheckCircle2, label: "Submitted" },
  { icon: Package, label: "Items" },
  { icon: Wallet, label: "Requested value" },
  { icon: ShoppingCart, label: "In Metakocka" },
  { icon: Eye, label: "Published", accent: true },
  { icon: AlertTriangle, label: "Integration failures" },
];

function OverviewSkeleton({ campaignId }: { campaignId: string }) {
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
          <Button variant="outline" size="sm" className="h-8" disabled><UserPlus className="w-3.5 h-3.5" /> Fill for customer</Button>
        </div>
        <div className="px-4 md:px-6 pb-2">
          <CampaignNav campaignId={campaignId} active="overview" compact />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
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

function Kpi({ icon: Icon, label, value, accent, danger }: { icon: React.ElementType; label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        danger
          ? "border-rose-300 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/20"
          : accent
            ? "border-lime-300 dark:border-lime-800/60 bg-lime-50/60 dark:bg-lime-950/20"
            : "border-border bg-surface",
      )}
    >
      <div className={cn("flex items-center gap-1.5 text-[11px]", danger ? "text-rose-700 dark:text-rose-400" : accent ? "text-lime-700 dark:text-lime-400" : "text-muted-foreground")}>
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-[20px] font-bold tabular-nums text-foreground mt-1 leading-none">{value}</div>
    </div>
  );
}
