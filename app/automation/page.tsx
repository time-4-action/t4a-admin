"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  Play,
  Loader2,
  AlertTriangle,
  Warehouse,
  Boxes,
  Clock,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Pencil,
  CalendarClock,
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { humanizeCron } from "@/lib/cron";
import type { AutomationStatus, MkRun, MkSyncState, SyncType } from "@/types/automation";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(parseSqlDate(value));
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

// The service stores SQLite timestamps ("YYYY-MM-DD HH:MM:SS", UTC). Normalise to ISO so
// the browser parses them as UTC, not local time. ISO strings pass through untouched.
function parseSqlDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.replace(" ", "T") + "Z";
  }
  return value;
}

function relativeTime(value?: string | null): string {
  if (!value) return "Never";
  const d = new Date(parseSqlDate(value));
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

type Tone = "ok" | "error" | "running" | "idle";
const TONE: Record<Tone, { dot: string; text: string; label: string }> = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "Healthy" },
  error: { dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", label: "Error" },
  running: { dot: "bg-amber-400 animate-pulse", text: "text-amber-600 dark:text-amber-400", label: "Running" },
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

function resultIcon(result?: string | null) {
  if (result === "ok") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (result === "error") return <XCircle className="w-3.5 h-3.5 text-rose-500" />;
  if (result === "running") return <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />;
  return <CircleDashed className="w-3.5 h-3.5 text-muted-foreground" />;
}

function stateTone(s?: MkSyncState, starting?: boolean): Tone {
  if (s?.isRunning || starting) return "running";
  if (s?.lastRun?.status === "error") return "error";
  if (s?.lastRun?.status === "ok") return "ok";
  return "idle";
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium tabular-nums text-right truncate">{value}</span>
    </div>
  );
}

// ── cron editor ───────────────────────────────────────────────────────────────

const PRESETS: { label: string; cron: string }[] = [
  { label: "Every 15 min", cron: "*/15 * * * *" },
  { label: "Every 30 min", cron: "*/30 * * * *" },
  { label: "Hourly", cron: "0 * * * *" },
  { label: "Every 2 hours", cron: "0 */2 * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily 03:00", cron: "0 3 * * *" },
];

function CronEditorModal({
  open,
  title,
  initial,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (cron: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  const parts = value.trim().split(/\s+/);
  const looksValid = parts.length === 5 && parts.every(Boolean);
  const preview = looksValid ? humanizeCron(value) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            {title}
          </DialogTitle>
          <DialogDescription>Pick how often this sync should run automatically.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.cron}
                type="button"
                onClick={() => setValue(p.cron)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded-lg border transition-colors",
                  value.trim() === p.cron
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/50"
                    : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Cron expression</label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0 * * * *"
              className="mt-1 font-mono text-xs"
              spellCheck={false}
            />
            <p className={cn("mt-1.5 text-[12px]", preview ? "text-foreground" : "text-rose-600 dark:text-rose-400")}>
              {preview ? (
                <>
                  <CalendarClock className="w-3 h-3 inline mr-1 -mt-0.5 text-muted-foreground" />
                  {preview}
                </>
              ) : (
                "Enter 5 space-separated fields (minute hour day month weekday)."
              )}
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-300/40 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => onSave(value.trim())}
            disabled={saving || !looksValid}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── sync card ─────────────────────────────────────────────────────────────────

function SyncCard({
  icon: Icon,
  title,
  description,
  itemLabel,
  state,
  starting,
  onRun,
  onEdit,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  itemLabel: string;
  state?: MkSyncState;
  starting: boolean;
  onRun: () => void;
  onEdit: () => void;
}) {
  const tone = stateTone(state, starting);
  const running = state?.isRunning || starting;
  const last = state?.lastRun;

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg border bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </span>
            <h2 className="text-[13px] font-medium text-foreground truncate">{title}</h2>
          </div>
          <StatusPill tone={tone} />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>

      <div className="divide-y divide-border/60">
        <div className="flex items-center justify-between gap-3 py-1 text-[12px]">
          <span className="text-muted-foreground">Runs</span>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-foreground font-medium truncate" title={state?.schedule}>
              {state ? humanizeCron(state.schedule) : "—"}
            </span>
            <button
              type="button"
              onClick={onEdit}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Edit schedule"
              aria-label="Edit schedule"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </span>
        </div>
        <Stat label="Next run" value={<span title={fmtDate(state?.nextRun)}>{relativeTime(state?.nextRun)}</span>} />
        <Stat label="Last run" value={<span title={fmtDate(last?.finished_at ?? last?.started_at)}>{relativeTime(last?.finished_at ?? last?.started_at)}</span>} />
        <Stat label="Took" value={fmtDuration(last?.duration_ms)} />
        <Stat
          label="Last outcome"
          value={
            running ? (
              <span className="text-amber-600 dark:text-amber-400">Running…</span>
            ) : last?.status === "error" ? (
              <span className="text-rose-600 dark:text-rose-400">Failed</span>
            ) : last?.status === "ok" ? (
              `${(last.item_count ?? 0).toLocaleString()} ${itemLabel}`
            ) : (
              "—"
            )
          }
        />
      </div>

      {last?.status === "error" && last.error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400 break-words border-t border-border pt-2">{last.error}</p>
      )}

      <Button size="sm" className="h-8 text-xs gap-1.5 w-full" onClick={onRun} disabled={running}>
        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        {running ? "Running…" : "Run now"}
      </Button>
    </div>
  );
}

// ── page ────────────────────────────────────────────────────────────────────

export default function AutomationPage() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [starting, setStarting] = useState<Record<SyncType, boolean>>({ warehouse: false, products: false });
  const [editing, setEditing] = useState<SyncType | null>(null);
  const [savingCron, setSavingCron] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/automation/status", { cache: "no-store" });
      const data = await r.json();
      if (!mounted.current) return;
      if (!r.ok || data?.reachable === false) {
        setError(data?.error ?? "Couldn't reach the automation service");
        setStatus(data?.reachable === false ? null : status);
        return;
      }
      setError(null);
      setStatus(data as AutomationStatus);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Couldn't load automation status");
    } finally {
      if (mounted.current) {
        setLoading(false);
        setStarting({ warehouse: false, products: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const anyRunning = !!(status?.warehouse.isRunning || status?.products.isRunning);
  const anyStarting = starting.warehouse || starting.products;
  useEffect(() => {
    if (!anyRunning && !anyStarting) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [anyRunning, anyStarting, load]);

  const runNow = useCallback(
    async (type: SyncType) => {
      setStarting((s) => ({ ...s, [type]: true }));
      setActionError(null);
      try {
        const r = await fetch(`/api/automation/${type}/run`, { method: "POST" });
        const data = await r.json();
        if (!r.ok) {
          setActionError(data?.error ?? "Failed to start the sync");
          setStarting((s) => ({ ...s, [type]: false }));
          return;
        }
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to start the sync");
        setStarting((s) => ({ ...s, [type]: false }));
      }
    },
    [load],
  );

  const saveCron = useCallback(
    async (cron: string) => {
      if (!editing) return;
      setSavingCron(true);
      setCronError(null);
      try {
        const r = await fetch(`/api/automation/schedules/${editing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cron }),
        });
        const data = await r.json();
        if (!r.ok) {
          setCronError(data?.error ?? "Failed to save the schedule");
          return;
        }
        setEditing(null);
        await load();
      } catch (e) {
        setCronError(e instanceof Error ? e.message : "Failed to save the schedule");
      } finally {
        setSavingCron(false);
      }
    },
    [editing, load],
  );

  const overallTone: Tone = anyRunning || anyStarting
    ? "running"
    : status && (status.warehouse.lastRun?.status === "error" || status.products.lastRun?.status === "error")
      ? "error"
      : status
        ? "ok"
        : "idle";

  // Merge both run lists for the combined history table, newest first.
  const allRuns: MkRun[] = status
    ? [...status.runs.warehouse, ...status.runs.products].sort((a, b) => {
        const ta = new Date(parseSqlDate(a.started_at ?? "")).getTime() || 0;
        const tb = new Date(parseSqlDate(b.started_at ?? "")).getTime() || 0;
        return tb - ta;
      })
    : [];

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">
              Warehouse &amp; Products Sync
            </h1>
            {status && <StatusPill tone={overallTone} />}
          </div>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="h-8 text-xs gap-1.5">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-4 md:p-8 space-y-6">
        <p className="text-[12px] text-muted-foreground max-w-3xl -mt-1">
          Keeps Metakocka in sync with the CREAGLOBE company. <span className="text-foreground font-medium">Warehouse sync</span> copies
          available stock across warehouses; <span className="text-foreground font-medium">products sync</span> mirrors product data
          between the two systems. Each runs on its own schedule — edit it, watch past runs, or run one right now.
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
              <SyncCard
                icon={Warehouse}
                title="Warehouse Sync"
                description="Reads available stock from the T4A and ProMode (Germany) warehouses and writes the combined free quantities into the CREAGLOBE warehouse in Metakocka."
                itemLabel="items synced"
                state={status.warehouse}
                starting={starting.warehouse}
                onRun={() => runNow("warehouse")}
                onEdit={() => { setCronError(null); setEditing("warehouse"); }}
              />
              <SyncCard
                icon={Boxes}
                title="Products Sync"
                description="Compares the product catalogues of the T4A and CREAGLOBE companies and mirrors changes both ways — updating existing products and creating any that are missing."
                itemLabel="products changed"
                state={status.products}
                starting={starting.products}
                onRun={() => runNow("products")}
                onEdit={() => { setCronError(null); setEditing("products"); }}
              />
            </div>
          )
        )}

        {/* ── run history ── */}
        {status && (
          <section className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Run history</h2>
            </div>
            <div className="bg-surface border border-border rounded-xl overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">When</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">What</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">How</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Outcome</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Took</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pr-5">Items</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allRuns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-[12px] text-muted-foreground py-8">
                        No runs yet — press <span className="font-medium text-foreground">Run now</span> on a sync above.
                      </TableCell>
                    </TableRow>
                  ) : (
                    allRuns.map((run) => (
                      <TableRow key={`${run.type}-${run.id}`} className="border-b border-border/60">
                        <TableCell className="pl-5 py-2.5 text-[12px] text-foreground" title={fmtDate(run.started_at)}>
                          {fmtDate(run.started_at)}
                        </TableCell>
                        <TableCell className="py-2.5 text-[12px] text-foreground capitalize">{run.type}</TableCell>
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
                            {resultIcon(run.status)}
                            <span className={run.status === "error" ? "text-rose-600 dark:text-rose-400" : "text-foreground"}>
                              {run.status === "ok" ? "Success" : run.status === "error" ? "Failed" : run.status === "running" ? "Running" : run.status}
                            </span>
                          </span>
                          {run.status === "error" && run.error && (
                            <span className="block text-[10px] text-rose-500/80 truncate max-w-[260px]" title={run.error}>
                              {run.error}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-[12px] text-muted-foreground tabular-nums">{fmtDuration(run.duration_ms)}</TableCell>
                        <TableCell className="pr-5 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                          {run.item_count ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </div>

      <CronEditorModal
        open={editing !== null}
        title={editing === "warehouse" ? "Edit schedule — Warehouse sync" : "Edit schedule — Products sync"}
        initial={(editing && status?.[editing]?.schedule) || ""}
        saving={savingCron}
        error={cronError}
        onClose={() => setEditing(null)}
        onSave={saveCron}
      />
    </div>
  );
}
