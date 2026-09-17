"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { HeaderFilter } from "@/components/ui/header-filter";
import { ChevronRight, Users, LockOpen, Mail, Search, AlertTriangle, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { fmtMoney } from "@/app/preorder/preorder-shared";
import { CampaignStatusBadge, SubmissionStageBadge, VisibilityBadge } from "@/app/preorder/preorder-badges";
import { CampaignHeader } from "@/app/preorder/[campaignId]/campaign-nav";
import { Flag } from "@/components/flag";
import {
  SUBMISSION_STAGE_LABELS,
  totalsNet,
  totalsDiscount,
  type PreorderCampaign,
  type PreorderSubmissionSummary,
  type PreorderAccessSummary,
  type SubmissionStage,
} from "@/types/preorder";

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

type StageFilter = "all" | SubmissionStage | "failures" | "invited";

const STAGE_FILTERS: { value: StageFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "submitted", label: "Submitted" },
  { value: "registering", label: "Registering" },
  { value: "registered", label: "Registered" },
  { value: "published", label: "Published" },
  { value: "failures", label: "Integration failures" },
  { value: "invited", label: "Invited, not started" },
];

// The preorders table — shared by the full Preorders page and the overview (which
// shows the latest few with a "view all" link).
// Column filters (Stage, Market) live in the headings when `filters` is given —
// the full page passes them, the overview's short list does not.
export type PreorderTableFilters = {
  stage: StageFilter;
  onStage: (s: StageFilter) => void;
  market: string;
  onMarket: (m: string) => void;
  markets: string[];
  failures: number;
};

export function PreordersTable({
  campaignId,
  currency,
  subs,
  unlocked,
  limit,
  emptyHint,
  filters,
}: {
  campaignId: string;
  currency: string;
  subs: PreorderSubmissionSummary[];
  unlocked: PreorderAccessSummary[];
  limit?: number;
  emptyHint?: string;
  filters?: PreorderTableFilters;
}) {
  const th = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9";
  const rows = limit ? subs.slice(0, limit) : subs;
  const invited = limit ? unlocked.slice(0, Math.max(0, limit - rows.length)) : unlocked;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-b border-border">
          <TableHead className={cn(th, "pl-5")}>Partner</TableHead>
          <TableHead className={th}>
            {filters ? (
              <HeaderFilter
                label="Market"
                value={filters.market}
                onChange={filters.onMarket}
                options={[{ value: "none", label: "No market" }, ...filters.markets.map((m) => ({ value: m, label: m }))]}
              />
            ) : (
              "Market"
            )}
          </TableHead>
          <TableHead className={th}>
            {filters ? (
              <HeaderFilter
                label="Stage"
                value={filters.stage}
                onChange={(v) => filters.onStage(v as StageFilter)}
                options={STAGE_FILTERS.filter((f) => f.value !== "all").map((f) => ({
                  value: f.value,
                  label: f.value === "failures" ? <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"><AlertTriangle className="w-3 h-3" /> {f.label}</span> : f.label,
                  count: f.value === "failures" && filters.failures > 0 ? filters.failures : undefined,
                }))}
              />
            ) : (
              "Stage"
            )}
          </TableHead>
          <TableHead className={cn(th, "text-right")}>Requested</TableHead>
          <TableHead className={th}>Metakocka</TableHead>
          <TableHead className={th}>Visibility</TableHead>
          <TableHead className={th}>Submitted</TableHead>
          <TableHead className="h-9 w-[40px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => (
          <TableRow key={s.id} className="border-b border-border/60 hover:bg-muted/30 group">
            <TableCell className="pl-5 py-2.5">
              <Link href={`/preorder/${campaignId}/submissions/${s.id}`} className="block min-w-0 focus-visible:outline-none">
                <div className="text-[13px] font-medium text-foreground group-hover:underline truncate">{s.partnerName}</div>
                {s.partnerEmail && <div className="text-[11px] text-muted-foreground truncate">{s.partnerEmail}</div>}
              </Link>
            </TableCell>
            <TableCell className="text-[12px] whitespace-nowrap">
              <span className="text-muted-foreground inline-flex items-center gap-1">{s.countryIso ? <><Flag iso={s.countryIso} /> {s.countryIso}</> : "—"}</span>
              {s.marketName && <span className="ml-1.5 text-foreground">{s.marketName}</span>}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <SubmissionStageBadge stage={s.stage} />
                {s.hasUnlockRequest && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-medium" title="Customer requested changes">
                    <LockOpen className="w-2.5 h-2.5" /> Change req.
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums text-[12px] font-medium whitespace-nowrap">
              <span className="text-muted-foreground font-normal">{s.totals.qty} × </span>
              {fmtMoney(totalsNet(s.totals), currency)}
              {totalsDiscount(s.totals) > 0 && (
                <div className="text-[10px] font-normal text-lime-700 dark:text-lime-400">−{fmtMoney(totalsDiscount(s.totals), currency)} volume</div>
              )}
            </TableCell>
            <TableCell className="text-[12px] whitespace-nowrap">
              {s.mkCountCode && s.mkId ? (
                <Link href={`/documents/${encodeURIComponent(s.partnerMkId)}/order/${encodeURIComponent(s.mkId)}`} className="inline-flex items-center gap-1 font-mono text-foreground hover:text-lime-600">
                  {s.mkCountCode} <ExternalLink className="w-3 h-3" />
                </Link>
              ) : s.mkState === "failed" ? (
                <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400" title={s.failedError ?? ""}>
                  <AlertTriangle className="w-3 h-3" /> failed
                </span>
              ) : s.mkState === "pending" ? (
                <span className="text-sky-600 dark:text-sky-400">registering…</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
              {s.allocatedQty != null && s.mkCountCode && (
                <div className="text-[10px] text-muted-foreground tabular-nums">{s.allocatedQty} of {s.totals.qty} items</div>
              )}
            </TableCell>
            <TableCell>{s.mkCountCode ? <VisibilityBadge published={s.published} /> : <span className="text-[12px] text-muted-foreground">—</span>}</TableCell>
            <TableCell className="text-[12px] text-muted-foreground whitespace-nowrap">{fmtDate(s.submittedAt)}</TableCell>
            <TableCell className="pr-4">
              <Link href={`/preorder/${campaignId}/submissions/${s.id}`} className="flex items-center justify-end text-muted-foreground hover:text-foreground" aria-label="Open">
                <ChevronRight className="w-4 h-4" />
              </Link>
            </TableCell>
          </TableRow>
        ))}
        {invited.map((u) => (
          <TableRow key={`u-${u.partnerMkId}`} className="border-b border-border/60">
            <TableCell className="pl-5 py-2.5">
              <div className="text-[13px] font-medium text-foreground truncate">{u.partnerName}</div>
              {u.partnerEmail && <div className="text-[11px] text-muted-foreground truncate">{u.partnerEmail}</div>}
            </TableCell>
            <TableCell className="text-[12px] text-muted-foreground">{u.countryIso ? <span className="inline-flex items-center gap-1"><Flag iso={u.countryIso} /> {u.countryIso}</span> : "—"}</TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 text-[11px] font-medium">
                <Mail className="w-2.5 h-2.5" /> Invited
              </span>
            </TableCell>
            <TableCell className="text-right text-[12px] text-muted-foreground">—</TableCell>
            <TableCell className="text-[12px] text-muted-foreground">—</TableCell>
            <TableCell className="text-[12px] text-muted-foreground">—</TableCell>
            <TableCell className="text-[12px] text-muted-foreground">not started</TableCell>
            <TableCell className="pr-4" />
          </TableRow>
        ))}
        {rows.length === 0 && invited.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-[13px] text-muted-foreground py-14">
              <Users className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
              {emptyHint ?? "No preorders match."}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export function PreordersTableSkeleton({ rows = 6 }: { rows?: number }) {
  const th = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9";
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-b border-border">
          <TableHead className={cn(th, "pl-5")}>Partner</TableHead>
          <TableHead className={th}>Market</TableHead>
          <TableHead className={th}>Stage</TableHead>
          <TableHead className={cn(th, "text-right")}>Requested</TableHead>
          <TableHead className={th}>Metakocka</TableHead>
          <TableHead className={th}>Visibility</TableHead>
          <TableHead className={th}>Submitted</TableHead>
          <TableHead className="h-9 w-[40px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i} className="border-b border-border/60">
            <TableCell className="pl-5 py-2.5">
              <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-36" delay={stagger(i, 60)} />
              <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-44" delay={stagger(i, 60, 20)} />
            </TableCell>
            <TableCell><SkeletonLine lh="h-[18px]" w="w-20" delay={stagger(i, 60, 30)} /></TableCell>
            <TableCell><Skeleton className="h-[20.5px] w-24 rounded-full" delay={stagger(i, 60, 40)} /></TableCell>
            <TableCell><SkeletonLine lh="h-[18px]" w="w-20" className="justify-end" delay={stagger(i, 60, 60)} /></TableCell>
            <TableCell><SkeletonLine lh="h-[18px]" w="w-16" delay={stagger(i, 60, 80)} /></TableCell>
            <TableCell><Skeleton className="h-[20.5px] w-28 rounded-full" delay={stagger(i, 60, 100)} /></TableCell>
            <TableCell><SkeletonLine lh="h-[18px]" w="w-20" delay={stagger(i, 60, 120)} /></TableCell>
            <TableCell className="pr-4"><div className="flex items-center justify-end"><ChevronRight className="w-4 h-4 text-muted-foreground/30" /></div></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const STAGE_VALUES = new Set<string>(STAGE_FILTERS.map((f) => f.value));

export default function SubmissionsClient({ campaignId, initialStage }: { campaignId: string; initialStage?: string }) {
  const [campaign, setCampaign] = useState<PreorderCampaign | null>(null);
  const [subs, setSubs] = useState<PreorderSubmissionSummary[]>([]);
  const [unlocked, setUnlocked] = useState<PreorderAccessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<StageFilter>(initialStage && STAGE_VALUES.has(initialStage) ? (initialStage as StageFilter) : "all");
  const [market, setMarket] = useState<string>("all");

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

  const markets = useMemo(() => Array.from(new Set(subs.map((s) => s.marketName).filter((m): m is string => !!m))).sort(), [subs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const bySearch = (name: string, email?: string) => !needle || name.toLowerCase().includes(needle) || (email ?? "").toLowerCase().includes(needle);
    let rows = subs.filter((s) => bySearch(s.partnerName, s.partnerEmail));
    if (market !== "all") rows = rows.filter((s) => (market === "none" ? !s.marketName : s.marketName === market));
    if (stage === "failures") rows = rows.filter((s) => s.mkState === "failed");
    else if (stage !== "all" && stage !== "invited") rows = rows.filter((s) => s.stage === stage);
    const inv = stage === "all" || stage === "invited" ? unlocked.filter((u) => bySearch(u.partnerName, u.partnerEmail)) : [];
    return { rows: stage === "invited" ? [] : rows, invited: market === "all" ? inv : [] };
  }, [subs, unlocked, q, stage, market]);

  const failures = subs.filter((s) => s.mkState === "failed").length;

  return (
    <div className="flex flex-col h-full">
      <CampaignHeader
        campaignId={campaignId}
        active="preorders"
        title={campaign ? campaign.title : <SkeletonLine lh="h-[19px]" h="h-3.5" w="w-48" />}
        meta={campaign ? <><CampaignStatusBadge status={campaign.status} /> Preorders</> : <Skeleton className="h-2.5 w-24" delay={40} />}
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</div>
        ) : (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex flex-wrap items-center gap-2">
              <div className="text-[13px] font-semibold text-foreground mr-2">
                Preorders{!loading && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground tabular-nums">{subs.length} · {unlocked.length} invited</span>}
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search partner…" className="h-8 w-56 pl-8 text-[12px]" />
              </div>
              {(stage !== "all" || market !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setStage("all");
                    setMarket("all");
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" /> Reset filters
                </button>
              )}
              {failures > 0 && stage !== "failures" && (
                <button onClick={() => setStage("failures")} className="ml-auto inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 px-2 py-0.5 text-[11px] font-medium">
                  <AlertTriangle className="w-3 h-3" /> {failures} integration failure{failures === 1 ? "" : "s"}
                </button>
              )}
            </div>
            {loading ? (
              <PreordersTableSkeleton />
            ) : (
              <PreordersTable
                campaignId={campaignId}
                currency={campaign?.currency ?? "EUR"}
                subs={filtered.rows}
                unlocked={filtered.invited}
                filters={{ stage, onStage: setStage, market, onMarket: setMarket, markets, failures }}
                emptyHint={subs.length === 0 && unlocked.length === 0 ? "No one has unlocked this preorder yet. Copy the invite link from the overview and share it." : `No preorders match ${stage !== "all" ? SUBMISSION_STAGE_LABELS[stage as SubmissionStage] ?? stage : "the search"}.`}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
