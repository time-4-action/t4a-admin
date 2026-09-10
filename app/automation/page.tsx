"use client";
import { RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RunDetailsModal,
  RunHistoryTable,
  RunHistoryTableSkeleton,
  StatusPill,
  useAutomation,
  mergeRuns,
  overallTone,
} from "./automation-shared";

// Automation overview — a description plus the combined run history across all
// syncs. The per-sync pages (/automation/warehouse, /products, /customers) hold
// the status cards, schedules and Run now controls.
export default function AutomationOverviewPage() {
  const { status, loading, error, actionError, anyStarting, load, openRun, setOpenRun } = useAutomation();

  const tone = overallTone(status, anyStarting);
  const allRuns = mergeRuns(status);

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">Automation</h1>
            {status ? <StatusPill tone={tone} /> : loading && <Skeleton className="h-[16.5px] w-14 rounded-full" />}
          </div>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="h-8 text-xs gap-1.5">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-4 md:p-8 space-y-6">
        <p className="text-[12px] text-muted-foreground max-w-3xl -mt-1">
          Bridges the two Metakocka companies (T4A and CREAGLOBE). <span className="text-foreground font-medium">Warehouse sync</span> reads
          available stock from the T4A warehouse and writes it into its matching virtual warehouse in CREAGLOBE.{" "}
          <span className="text-foreground font-medium">Products sync</span> mirrors the product catalogue one way — T4A is the source of
          truth, CREAGLOBE is updated to match. <span className="text-foreground font-medium">Customers sync</span> does the same for
          customers (partners), matched by tax number then name.{" "}
          <span className="text-foreground font-medium">Pricelists sync</span> copies product prices, but only for the
          price-list pairs someone has explicitly mapped — a list&apos;s code does not mean the same thing in both
          companies. Open a sync from the menu for its status, schedule and controls.
        </p>

        {error && (
          <div role="alert" className="rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-[12px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
        {actionError && (
          <div role="alert" className="rounded-xl border border-rose-300/40 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {actionError}
          </div>
        )}

        {/* ── combined run history ── */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-0.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Run history</h2>
          </div>
          {loading && !status ? (
            <RunHistoryTableSkeleton showType rows={6} />
          ) : (
            <RunHistoryTable runs={allRuns} onOpen={setOpenRun} showType />
          )}
        </section>
      </div>

      <RunDetailsModal run={openRun} onClose={() => setOpenRun(null)} />
    </div>
  );
}
