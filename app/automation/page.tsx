"use client";
import Link from "next/link";
import { RefreshCw, AlertTriangle, Warehouse, Boxes, Clock, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CronEditorModal,
  RunDetailsModal,
  RunHistoryTable,
  StatusPill,
  SyncCard,
  useAutomation,
  mergeRuns,
  overallTone,
} from "./automation-shared";

// Automation overview — both syncs at a glance plus a combined run history. Each sync also
// has its own dedicated page (/automation/warehouse, /automation/products) linked from here
// and the nav.
export default function AutomationOverviewPage() {
  const {
    status,
    loading,
    error,
    actionError,
    starting,
    anyStarting,
    load,
    runNow,
    editing,
    setEditing,
    savingCron,
    cronError,
    startEditing,
    saveCron,
    openRun,
    setOpenRun,
  } = useAutomation();

  const tone = overallTone(status, anyStarting);
  const allRuns = mergeRuns(status);

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">Automation</h1>
            {status && <StatusPill tone={tone} />}
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
          customers (partners), matched by tax number then name. Open a sync for its own page, edit a schedule, or run one right now.
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

        {loading && !status ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-4 space-y-3">
                <div className="h-8 w-40 rounded skeleton" style={{ animationDelay: `${i * 80}ms` }} />
                <div className="h-3 w-full rounded skeleton" style={{ animationDelay: `${i * 80 + 30}ms` }} />
                <div className="h-3 w-3/4 rounded skeleton" style={{ animationDelay: `${i * 80 + 60}ms` }} />
                <div className="h-8 w-full rounded skeleton" style={{ animationDelay: `${i * 80 + 120}ms` }} />
              </div>
            ))}
          </div>
        ) : (
          status && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <SyncCard
                  icon={Warehouse}
                  title="Warehouse Sync"
                  description="Reads available (free) stock from the T4A warehouse and writes it into its matching virtual warehouse inside the CREAGLOBE Metakocka company. The ProMode / Germany source is retired."
                  itemLabel="items synced"
                  state={status.warehouse}
                  starting={starting.warehouse}
                  onRun={() => runNow("warehouse")}
                  onEdit={() => startEditing("warehouse")}
                  onViewDetails={setOpenRun}
                />
                <Link href="/automation/warehouse" className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1">
                  Open warehouse page <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-1.5">
                <SyncCard
                  icon={Boxes}
                  title="Products Sync"
                  description="Mirrors the product catalogue one way — T4A is the source of truth and CREAGLOBE is updated to match: differing fields are overwritten and any missing products are created. T4A is never modified."
                  itemLabel="products changed"
                  state={status.products}
                  starting={starting.products}
                  onRun={() => runNow("products")}
                  onEdit={() => startEditing("products")}
                  onViewDetails={setOpenRun}
                />
                <Link href="/automation/products" className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1">
                  Open products page <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-1.5">
                <SyncCard
                  icon={Users}
                  title="Customers Sync"
                  description="Mirrors customers (partners) one way — T4A is the source of truth and CREAGLOBE is updated to match. Matched by tax number then name; missing customers are created, existing ones updated."
                  itemLabel="customers changed"
                  state={status.customers}
                  starting={starting.customers}
                  onRun={() => runNow("customers")}
                  onEdit={() => startEditing("customers")}
                  onViewDetails={setOpenRun}
                />
                <Link href="/automation/customers" className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1">
                  Open customers page <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )
        )}

        {/* ── combined run history ── */}
        {status && (
          <section className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Run history</h2>
            </div>
            <RunHistoryTable runs={allRuns} onOpen={setOpenRun} showType />
          </section>
        )}
      </div>

      <CronEditorModal
        open={editing !== null}
        title={`Edit schedule — ${editing === "warehouse" ? "Warehouse sync" : editing === "customers" ? "Customers sync" : "Products sync"}`}
        initial={(editing && status?.[editing]?.schedule) || ""}
        saving={savingCron}
        error={cronError}
        onClose={() => setEditing(null)}
        onSave={saveCron}
      />

      <RunDetailsModal run={openRun} onClose={() => setOpenRun(null)} />
    </div>
  );
}
