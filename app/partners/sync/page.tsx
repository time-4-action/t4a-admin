"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  Play,
  Loader2,
  AlertTriangle,
  Package,
  Rss,
  Store,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  CircleDashed,
  ChevronRight,
  Download,
  Sparkles,
  ShoppingBag,
} from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { humanizeCron } from "@/lib/cron";
import type {
  SyncStatus,
  PnvSyncRun,
  PnvSyncStats,
  OwnSourceFeedStatus,
} from "@/types/partner";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function relativeTime(value?: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const past = diff >= 0;
  const min = Math.round(Math.abs(diff) / 60000);
  const fmt = (n: number, u: string) => (past ? `${n}${u} ago` : `in ${n}${u}`);
  if (min < 1) return past ? "just now" : "now";
  if (min < 60) return fmt(min, "m");
  const hr = Math.round(min / 60);
  if (hr < 24) return fmt(hr, "h");
  const day = Math.round(hr / 24);
  if (day < 30) return fmt(day, "d");
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

function fmtDuration(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function statsSummary(stats?: PnvSyncStats | null): string {
  if (!stats) return "—";
  const p = stats.totalProcessed ?? 0;
  return `${p.toLocaleString()} product${p === 1 ? "" : "s"} processed`;
}

function statsBreakdown(stats?: PnvSyncStats | null): string {
  if (!stats) return "";
  return `${stats.created ?? 0} new · ${stats.updated ?? 0} updated · ${stats.deactivated ?? 0} removed`;
}

type Tone = "ok" | "error" | "running" | "idle" | "warn";

const TONE: Record<Tone, { dot: string; text: string; label: string }> = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "Healthy" },
  error: { dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", label: "Error" },
  running: { dot: "bg-amber-400 animate-pulse", text: "text-amber-600 dark:text-amber-400", label: "Running" },
  warn: { dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", label: "Paused" },
  idle: { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "Idle" },
};

function StatusPill({ tone, label }: { tone: Tone; label?: string }) {
  const t = TONE[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", t.dot)} />
      <span className={t.text}>{label ?? t.label}</span>
    </span>
  );
}

function resultIcon(result?: string | null, className = "w-3.5 h-3.5") {
  if (result === "ok") return <CheckCircle2 className={cn(className, "text-emerald-500")} />;
  if (result === "error") return <XCircle className={cn(className, "text-rose-500")} />;
  return <CircleDashed className={cn(className, "text-muted-foreground")} />;
}

type Accent = "indigo" | "violet" | "sky";
const ACCENT_ICON: Record<Accent, string> = {
  indigo: "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400",
  violet: "bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400",
  sky: "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400",
};

function Card({
  icon: Icon,
  title,
  description,
  accent,
  pill,
  children,
  footer,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  accent: Accent;
  pill?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={cn("w-8 h-8 rounded-lg border flex items-center justify-center shrink-0", ACCENT_ICON[accent])}>
              <Icon className="w-4 h-4" />
            </span>
            <h2 className="text-[13px] font-medium text-foreground truncate">{title}</h2>
          </div>
          {pill}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex-1">{children}</div>
      {footer}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium tabular-nums text-right truncate">{value}</span>
    </div>
  );
}

// ── run-details modal ─────────────────────────────────────────────────────────

function StageTile({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

function NumberTile({ value, label, tint }: { value: number; label: string; tint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-3 py-2.5 text-center">
      <p className={cn("text-lg font-semibold tabular-nums leading-none", tint ?? "text-foreground")}>{value.toLocaleString()}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function RunDetailsModal({ run, onClose }: { run: PnvSyncRun | null; onClose: () => void }) {
  const s = run?.stats;
  const aiRuns = s?.aiRuns ?? [];
  const aiTotal = aiRuns.reduce((sum, a) => sum + (a.categorized ?? 0), 0);
  return (
    <Dialog open={!!run} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {run && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {resultIcon(run.result, "w-4 h-4")}
                Catalogue refresh
              </DialogTitle>
              <DialogDescription>
                {run.trigger === "manual" ? "Started manually" : "Ran automatically on schedule"} · {fmtDate(run.startedAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* summary row */}
              <div className="grid grid-cols-3 gap-2 text-[12px]">
                <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Result</p>
                  <p className={cn("font-medium mt-0.5", run.result === "error" ? "text-rose-600 dark:text-rose-400" : run.result === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                    {run.result === "ok" ? "Success" : run.result === "error" ? "Failed" : run.result}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Duration</p>
                  <p className="font-medium mt-0.5 tabular-nums">{fmtDuration(run.durationMs)}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Finished</p>
                  <p className="font-medium mt-0.5">{run.finishedAt ? relativeTime(run.finishedAt) : "—"}</p>
                </div>
              </div>

              {run.error && (
                <div className="rounded-lg border border-rose-300/40 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300 break-words">
                  {run.error}
                </div>
              )}

              {/* stage 1 — catalogue */}
              <StageTile icon={Download} title="1 · Product catalogue">
                {s ? (
                  <div className="grid grid-cols-4 gap-2">
                    <NumberTile value={s.totalProcessed ?? 0} label="Processed" />
                    <NumberTile value={s.created ?? 0} label="New" tint="text-emerald-600 dark:text-emerald-400" />
                    <NumberTile value={s.updated ?? 0} label="Updated" tint="text-sky-600 dark:text-sky-400" />
                    <NumberTile value={s.deactivated ?? 0} label="Removed" tint="text-rose-600 dark:text-rose-400" />
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground">No catalogue figures recorded.</p>
                )}
              </StageTile>

              {/* stage 2 — AI categorization */}
              <StageTile icon={Sparkles} title="2 · AI categorization">
                {aiRuns.length ? (
                  <p className="text-[12px] text-foreground">
                    {aiTotal.toLocaleString()} product{aiTotal === 1 ? "" : "s"} categorized across {aiRuns.length} category set{aiRuns.length === 1 ? "" : "s"}
                    {aiRuns.some((a) => a.error) && (
                      <span className="text-rose-600 dark:text-rose-400"> · some sets failed</span>
                    )}
                  </p>
                ) : (
                  <p className="text-[12px] text-muted-foreground">No AI category sets to process.</p>
                )}
              </StageTile>

              {/* stage 3 — shopify */}
              <StageTile icon={ShoppingBag} title="3 · Shopify push">
                <p className="text-[12px] text-muted-foreground">
                  After the catalogue refresh, updated products are pushed to every connected Shopify store. Per-store
                  progress is tracked on each partner&apos;s page.
                </p>
              </StageTile>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── page ────────────────────────────────────────────────────────────────────

export default function CatalogueSyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [feedBusy, setFeedBusy] = useState<Record<string, boolean>>({});
  const [openRun, setOpenRun] = useState<PnvSyncRun | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/partners/sync", { cache: "no-store" });
      const data = await r.json();
      if (!mounted.current) return;
      if (!r.ok) {
        setError(data?.error ?? "Couldn't load sync status");
        return;
      }
      setError(null);
      setStatus(data as SyncStatus);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Couldn't load sync status");
    } finally {
      if (mounted.current) {
        setLoading(false);
        setStarting(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const isRunning = status?.pnv.isRunning ?? false;
  useEffect(() => {
    if (!isRunning && !starting) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [isRunning, starting, load]);

  const runNow = useCallback(async () => {
    setStarting(true);
    setRunError(null);
    try {
      const r = await fetch("/api/partners/sync/run", { method: "POST" });
      const data = await r.json();
      if (!r.ok) {
        setRunError(data?.error ?? "Failed to start the refresh");
        setStarting(false);
        return;
      }
      await load();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Failed to start the refresh");
      setStarting(false);
    }
  }, [load]);

  const runFeed = useCallback(
    async (feedId: string) => {
      setFeedBusy((b) => ({ ...b, [feedId]: true }));
      try {
        await fetch(`/api/partners/sync/own-sources/${encodeURIComponent(feedId)}/run`, { method: "POST" });
        await load();
      } finally {
        if (mounted.current) {
          setFeedBusy((b) => ({ ...b, [feedId]: false }));
          setTimeout(() => mounted.current && load(), 4000);
        }
      }
    },
    [load],
  );

  const pnv = status?.pnv;
  const own = status?.ownSources;
  const cleanup = status?.shopifyCleanup;
  const running = isRunning || starting;

  const pnvTone: Tone = running
    ? "running"
    : !pnv?.enabled
      ? "idle"
      : pnv?.lastResult === "error"
        ? "error"
        : pnv?.lastResult === "ok"
          ? "ok"
          : "idle";

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">
              Catalogue Sync
            </h1>
            {pnv ? <StatusPill tone={pnvTone} /> : loading && <Skeleton className="h-[16.5px] w-14 rounded-full" />}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => load()}
              disabled={loading}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={runNow}
              disabled={running}
              className="h-8 text-xs gap-1.5"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {running ? "Running…" : "Run now"}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-4 md:p-8 space-y-6">
        <p className="text-[12px] text-muted-foreground max-w-3xl -mt-1">
          This is the engine that keeps your product catalogue up to date. It downloads products, refreshes their stock
          and prices, and sends them to your connected stores — automatically on a schedule, or right now with one click.
        </p>

        {error && (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
        {runError && (
          <div role="alert" className="rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-[12px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {runError}
          </div>
        )}

        {/* ── status cards ── */}
        {loading && !status ? (
          <SyncCardsSkeleton />
        ) : (
          status && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* PNV catalogue refresh */}
              <Card
                icon={Package}
                title="Product Catalogue"
                description="Pulls your full product list from PNV, fills in live stock & prices from Metakocka, then pushes everything to your connected Shopify stores."
                accent="indigo"
                pill={<StatusPill tone={pnvTone} />}
                footer={
                  pnv?.runs?.length ? (
                    <button
                      type="button"
                      onClick={() => setOpenRun(pnv.runs[0])}
                      className="flex items-center justify-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline pt-1"
                    >
                      View last run details
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  ) : undefined
                }
              >
                <div className="divide-y divide-border/60">
                  <Stat
                    label="Runs"
                    value={pnv?.enabled ? <span title={pnv?.schedule ?? undefined}>{humanizeCron(pnv?.schedule)}</span> : "Only when you press Run"}
                  />
                  <Stat label="Next run" value={pnv?.enabled ? <span title={fmtDate(pnv?.nextRunAt)}>{relativeTime(pnv?.nextRunAt)}</span> : "—"} />
                  <Stat label="Last run" value={<span title={fmtDate(pnv?.lastFinishedAt)}>{relativeTime(pnv?.lastFinishedAt)}</span>} />
                  <Stat label="Took" value={fmtDuration(pnv?.lastDurationMs)} />
                  <Stat
                    label="Last outcome"
                    value={
                      pnv?.lastResult === "error" ? (
                        <span className="text-rose-600 dark:text-rose-400">Failed</span>
                      ) : pnv?.lastStats ? (
                        statsSummary(pnv.lastStats)
                      ) : (
                        "—"
                      )
                    }
                  />
                </div>
              </Card>

              {/* Own Sources */}
              <Card
                icon={Rss}
                title="Partner Supplier Feeds"
                description="Extra product feeds your partners connect themselves (so-called Own Sources). Each imports on its own schedule, or only when run manually."
                accent="violet"
                pill={<StatusPill tone={own?.enabled ? "ok" : "idle"} label={own?.enabled ? "Enabled" : "Disabled"} />}
              >
                <div className="divide-y divide-border/60">
                  <Stat label="Connected feeds" value={own?.feeds.length ?? 0} />
                  <Stat label="On a schedule" value={own?.feeds.filter((f) => f.scheduleEnabled).length ?? 0} />
                  <Stat label="Need attention" value={own?.feeds.filter((f) => f.health.lastResult && f.health.lastResult !== "ok").length ?? 0} />
                  <Stat
                    label="Last import"
                    value={
                      <span title={fmtDate(own?.feeds[0]?.health.lastImportAt)}>
                        {relativeTime(own?.feeds[0]?.health.lastImportAt)}
                      </span>
                    }
                  />
                </div>
              </Card>

              {/* Shopify pending cleanup */}
              <Card
                icon={Store}
                title="Shopify Connection Cleanup"
                description="Automatic housekeeping. When a store begins connecting to Shopify but never finishes, this safely removes the leftover half-finished connection so no access is left open."
                accent="sky"
                pill={<StatusPill tone="ok" label="Active" />}
              >
                <div className="divide-y divide-border/60">
                  <Stat label="Checks every" value={cleanup ? `${Math.round(cleanup.intervalMs / 60000)} min` : "—"} />
                  <Stat label="Removes after" value={cleanup ? `${Math.round(cleanup.pendingTtlMs / 60000)} min unfinished` : "—"} />
                  <Stat label="Last checked" value={<span title={fmtDate(cleanup?.lastSweepAt)}>{relativeTime(cleanup?.lastSweepAt)}</span>} />
                  <Stat label="Removed last time" value={cleanup?.lastRemoved ?? "—"} />
                </div>
              </Card>
            </div>
          )
        )}

        {/* ── PNV run history ── */}
        {loading && !status && <RunHistorySkeleton />}
        {status && (
          <section className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Catalogue run history</h2>
            </div>
            <div className="bg-surface border border-border rounded-xl overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">When</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">How</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Outcome</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Took</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Products</TableHead>
                    <TableHead className="h-9 w-[40px] pr-5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pnv?.runs ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-[12px] text-muted-foreground py-8">
                        No runs yet — press <span className="font-medium text-foreground">Run now</span> to start one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pnv!.runs.map((run: PnvSyncRun) => (
                      <TableRow
                        key={run._id}
                        className="border-b border-border/60 cursor-pointer hover:bg-muted/40"
                        onClick={() => setOpenRun(run)}
                      >
                        <TableCell className="pl-5 py-2.5 text-[12px] text-foreground" title={fmtDate(run.startedAt)}>
                          {fmtDate(run.startedAt)}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className={cn(
                            "text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border",
                            run.trigger === "manual"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/50"
                              : "bg-muted text-muted-foreground border-border",
                          )}>
                            {run.trigger === "manual" ? "Manual" : "Scheduled"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-[12px]">
                            {resultIcon(run.result)}
                            <span className={run.result === "error" ? "text-rose-600 dark:text-rose-400" : "text-foreground"}>
                              {run.result === "ok" ? "Success" : run.result === "error" ? "Failed" : run.result}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-[12px] text-muted-foreground tabular-nums">
                          {fmtDuration(run.durationMs)}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {run.stats ? (
                            <div className="leading-tight">
                              <p className="text-[12px] text-foreground">{statsSummary(run.stats)}</p>
                              <p className="text-[10px] text-muted-foreground">{statsBreakdown(run.stats)}</p>
                            </div>
                          ) : (
                            <span className="text-[12px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-5 py-2.5 text-right">
                          <ChevronRight className="w-4 h-4 text-muted-foreground/60 inline" />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {/* ── Own Sources feeds ── */}
        {status && (own?.feeds.length ?? 0) > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <Rss className="w-3.5 h-3.5 text-muted-foreground" />
              <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Partner supplier feeds</h2>
            </div>
            <div className="bg-surface border border-border rounded-xl overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">Feed</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Runs</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Next run</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Last import</TableHead>
                    <TableHead className="h-9 w-[90px] pr-5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {own!.feeds.map((feed: OwnSourceFeedStatus) => {
                    const tone: Tone = feed.isRunning
                      ? "running"
                      : feed.status === "paused"
                        ? "warn"
                        : feed.health.lastResult && feed.health.lastResult !== "ok"
                          ? "error"
                          : feed.health.lastResult === "ok"
                            ? "ok"
                            : "idle";
                    return (
                      <TableRow key={feed.feedId} className="border-b border-border/60">
                        <TableCell className="pl-5 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", TONE[tone].dot)} />
                            <div className="min-w-0">
                              <p className="text-[12px] font-medium text-foreground truncate">{feed.brand}</p>
                              {feed.ownerEmail && <p className="text-[10px] text-muted-foreground truncate">{feed.ownerEmail}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-[12px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            {feed.scheduleEnabled ? (feed.frequency ?? "On a schedule") : "Manual only"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-[12px] text-muted-foreground" title={fmtDate(feed.nextRunAt)}>
                          {feed.scheduleEnabled ? relativeTime(feed.nextRunAt) : "—"}
                        </TableCell>
                        <TableCell className="py-2.5 text-[12px]">
                          <span className="inline-flex items-center gap-1.5">
                            {resultIcon(feed.health.lastResult)}
                            <span className="text-muted-foreground" title={fmtDate(feed.health.lastImportAt)}>
                              {relativeTime(feed.health.lastImportAt)}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="pr-5 py-2.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] gap-1.5"
                            disabled={feed.isRunning || feedBusy[feed.feedId]}
                            onClick={() => runFeed(feed.feedId)}
                          >
                            {feed.isRunning || feedBusy[feed.feedId] ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                            Run
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </div>

      <RunDetailsModal run={openRun} onClose={() => setOpenRun(null)} />
    </div>
  );
}

// ── skeleton twins ────────────────────────────────────────────────────────────
// The three status cards and the run-history table, with their static chrome
// (titles, descriptions, stat labels, table headers) rendered for real and only
// the live values shimmering.

const PILL = <Skeleton className="h-[16.5px] w-14 rounded-full" />;

function StatSkeleton({ label, w, delay }: { label: string; w: string; delay: number }) {
  return <Stat label={label} value={<SkeletonLine lh="h-[18px]" w={w} className="justify-end" delay={delay} />} />;
}

function SyncCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card
        icon={Package}
        title="Product Catalogue"
        description="Pulls your full product list from PNV, fills in live stock & prices from Metakocka, then pushes everything to your connected Shopify stores."
        accent="indigo"
        pill={PILL}
        footer={
          <div className="flex items-center justify-center pt-1">
            <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-32" delay={200} />
          </div>
        }
      >
        <div className="divide-y divide-border/60">
          <StatSkeleton label="Runs" w="w-24" delay={0} />
          <StatSkeleton label="Next run" w="w-16" delay={40} />
          <StatSkeleton label="Last run" w="w-16" delay={80} />
          <StatSkeleton label="Took" w="w-12" delay={120} />
          <StatSkeleton label="Last outcome" w="w-28" delay={160} />
        </div>
      </Card>
      <Card
        icon={Rss}
        title="Partner Supplier Feeds"
        description="Extra product feeds your partners connect themselves (so-called Own Sources). Each imports on its own schedule, or only when run manually."
        accent="violet"
        pill={PILL}
      >
        <div className="divide-y divide-border/60">
          <StatSkeleton label="Connected feeds" w="w-6" delay={60} />
          <StatSkeleton label="On a schedule" w="w-6" delay={100} />
          <StatSkeleton label="Need attention" w="w-6" delay={140} />
          <StatSkeleton label="Last import" w="w-16" delay={180} />
        </div>
      </Card>
      <Card
        icon={Store}
        title="Shopify Connection Cleanup"
        description="Automatic housekeeping. When a store begins connecting to Shopify but never finishes, this safely removes the leftover half-finished connection so no access is left open."
        accent="sky"
        pill={PILL}
      >
        <div className="divide-y divide-border/60">
          <StatSkeleton label="Checks every" w="w-12" delay={120} />
          <StatSkeleton label="Removes after" w="w-24" delay={160} />
          <StatSkeleton label="Last checked" w="w-16" delay={200} />
          <StatSkeleton label="Removed last time" w="w-6" delay={240} />
        </div>
      </Card>
    </div>
  );
}

function RunHistorySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-0.5">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Catalogue run history</h2>
      </div>
      <div className="bg-surface border border-border rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-border">
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">When</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">How</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Outcome</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Took</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Products</TableHead>
              <TableHead className="h-9 w-[40px] pr-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, i) => (
              <TableRow key={i} className="border-b border-border/60">
                <TableCell className="pl-5 py-2.5"><SkeletonLine lh="h-[18px]" w="w-32" delay={stagger(i, 60)} /></TableCell>
                <TableCell className="py-2.5"><Skeleton className="h-[21px] w-[72px] rounded" delay={stagger(i, 60, 20)} /></TableCell>
                <TableCell className="py-2.5">
                  <div className="inline-flex items-center gap-1.5">
                    <Skeleton className="w-3.5 h-3.5 rounded-full" delay={stagger(i, 60, 40)} />
                    <SkeletonLine lh="h-[18px]" w="w-14" delay={stagger(i, 60, 50)} />
                  </div>
                </TableCell>
                <TableCell className="py-2.5"><SkeletonLine lh="h-[18px]" w="w-10" delay={stagger(i, 60, 60)} /></TableCell>
                <TableCell className="py-2.5">
                  <div className="leading-tight">
                    <SkeletonLine lh="h-[15px]" w="w-28" delay={stagger(i, 60, 70)} />
                    <SkeletonLine lh="h-[12.5px]" h="h-2.5" w="w-40" delay={stagger(i, 60, 80)} />
                  </div>
                </TableCell>
                <TableCell className="pr-5 py-2.5 text-right">
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 inline" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
