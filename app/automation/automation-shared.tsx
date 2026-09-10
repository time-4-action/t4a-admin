"use client";
// Shared building blocks for the Automation section. The overview (`/automation`) and the
// dedicated per-sync pages (`/automation/warehouse`, `/automation/products`) all render the
// same cards, modals and history table off the same data hook, so they live here to avoid
// three copies drifting apart.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Pencil,
  CalendarClock,
  ArrowRight,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Clock,
  FlaskConical,
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
import {
  parseRunDetails,
  type AutomationStatus,
  type CustomerChange,
  type MkRun,
  type MkSyncState,
  type SyncType,
} from "@/types/automation";

// ── date / duration helpers ─────────────────────────────────────────────────

export function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(parseSqlDate(value));
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

// The service stores SQLite timestamps ("YYYY-MM-DD HH:MM:SS", UTC). Normalise to ISO so
// the browser parses them as UTC, not local time. ISO strings pass through untouched.
export function parseSqlDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.replace(" ", "T") + "Z";
  }
  return value;
}

export function relativeTime(value?: string | null): string {
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

export function fmtDuration(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

// ── status tone ─────────────────────────────────────────────────────────────

export type Tone = "ok" | "error" | "running" | "idle";
export const TONE: Record<Tone, { dot: string; text: string; label: string }> = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "Healthy" },
  error: { dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", label: "Error" },
  running: { dot: "bg-amber-400 animate-pulse", text: "text-amber-600 dark:text-amber-400", label: "Running" },
  idle: { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "Idle" },
};

export function StatusPill({ tone, label }: { tone: Tone; label?: string }) {
  const t = TONE[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", t.dot)} />
      <span className={t.text}>{label ?? t.label}</span>
    </span>
  );
}

export function resultIcon(result?: string | null) {
  if (result === "ok") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (result === "error") return <XCircle className="w-3.5 h-3.5 text-rose-500" />;
  if (result === "running") return <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />;
  return <CircleDashed className="w-3.5 h-3.5 text-muted-foreground" />;
}

export function stateTone(s?: MkSyncState, starting?: boolean): Tone {
  if (s?.isRunning || starting) return "running";
  if (s?.lastRun?.status === "error") return "error";
  if (s?.lastRun?.status === "ok") return "ok";
  return "idle";
}

// Roll a whole status object up to a single tone for the page header.
export function overallTone(status: AutomationStatus | null, anyStarting: boolean): Tone {
  const anyRunning = !!(
    status?.warehouse.isRunning ||
    status?.products.isRunning ||
    status?.customers.isRunning ||
    status?.pricelists.isRunning
  );
  if (anyRunning || anyStarting) return "running";
  if (!status) return "idle";
  if (
    status.warehouse.lastRun?.status === "error" ||
    status.products.lastRun?.status === "error" ||
    status.customers.lastRun?.status === "error" ||
    status.pricelists.lastRun?.status === "error"
  )
    return "error";
  return "ok";
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium tabular-nums text-right truncate">{value}</span>
    </div>
  );
}

// ── cron editor ─────────────────────────────────────────────────────────────

const PRESETS: { label: string; cron: string }[] = [
  { label: "Every 15 min", cron: "*/15 * * * *" },
  { label: "Every 30 min", cron: "*/30 * * * *" },
  { label: "Hourly", cron: "0 * * * *" },
  { label: "Every 2 hours", cron: "0 */2 * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily 03:00", cron: "0 3 * * *" },
];

export function CronEditorModal({
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

// ── run details modal ───────────────────────────────────────────────────────

// changes<Name> → "Updated in <Name>", newIn<Name> → "Created in <Name>".
const PRICELIST_BUCKET_LABELS: Record<string, string> = {
  added: "Prices added",
  updated: "Prices updated",
  unchanged: "Already in line",
  blockedByLimit: "Blocked by limit",
  extraInCreaglobe: "Extra in CREAGLOBE",
  skippedMissingProduct: "Product not in CREAGLOBE",
};

function bucketLabel(key: string): string {
  if (PRICELIST_BUCKET_LABELS[key]) return PRICELIST_BUCKET_LABELS[key];
  if (key.startsWith("changes")) return `Updated in ${key.slice("changes".length)}`;
  if (key.startsWith("newIn")) return `Created in ${key.slice("newIn".length)}`;
  return key;
}

// A plural helper for the customer change summaries.
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// Turns one customer change record into a readable "what changed" line.
function customerChangeSummary(c: CustomerChange): string {
  if (c.action === "create") {
    const parts: string[] = [];
    if (c.contactsAdded) parts.push(plural(c.contactsAdded, "contact", "contacts"));
    if (c.addressesAdded) parts.push(plural(c.addressesAdded, "address", "addresses"));
    return parts.length ? `New customer with ${parts.join(", ")}` : "New customer";
  }
  const parts: string[] = [];
  if (c.fields.length) parts.push(`fields: ${c.fields.join(", ")}`);
  if (c.billing === "updated") parts.push("billing address updated");
  else if (c.billing === "added") parts.push("billing address added");
  if (c.addressesUpdated) parts.push(`${plural(c.addressesUpdated, "address", "addresses")} updated`);
  if (c.addressesAdded) parts.push(`${plural(c.addressesAdded, "address", "addresses")} added`);
  if (c.contactsAdded) parts.push(`${plural(c.contactsAdded, "contact", "contacts")} added`);
  return parts.length ? parts.join(" · ") : "no field changes";
}

// A small "DRY RUN" badge shown wherever a run is only a preview (nothing written).
export function DryRunBadge() {
  return (
    <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/50">
      Dry run
    </span>
  );
}

// True when a run's details mark it as a dry run (customer or pricelist preview).
export function isDryRun(run: MkRun): boolean {
  const d = parseRunDetails(run.details);
  return (d?.type === "customers" || d?.type === "pricelists") && d.dryRun === true;
}

export function RunDetailsModal({ run, onClose }: { run: MkRun | null; onClose: () => void }) {
  const details = parseRunDetails(run?.details);
  const warehouseErrorCount = details?.type === "warehouse" ? details.errorCount ?? 0 : 0;
  const productErrorCount = details?.type === "products" ? details.errorCount : 0;
  const customerErrorCount = details?.type === "customers" ? details.errorCount : 0;
  const pricelistErrorCount = details?.type === "pricelists" ? details.errorCount : 0;
  const title =
    run?.type === "warehouse"
      ? "Warehouse sync"
      : run?.type === "customers"
        ? "Customers sync"
        : run?.type === "pricelists"
          ? "Pricelists sync"
          : "Products sync";
  return (
    <Dialog open={!!run} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {run && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {resultIcon(run.status)}
                {title}
                {isDryRun(run) && <DryRunBadge />}
              </DialogTitle>
              <DialogDescription>
                {run.trigger === "manual" ? "Started manually" : "Ran automatically on schedule"} · {fmtDate(run.started_at)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 max-h-[60vh] overflow-auto">
              {/* summary */}
              <div className="grid grid-cols-3 gap-2 text-[12px]">
                <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Result</p>
                  <p className={cn("font-medium mt-0.5", run.status === "error" ? "text-rose-600 dark:text-rose-400" : run.status === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                    {run.status === "ok" ? "Success" : run.status === "error" ? "Failed" : run.status}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Duration</p>
                  <p className="font-medium mt-0.5 tabular-nums">{fmtDuration(run.duration_ms)}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Items</p>
                  <p className="font-medium mt-0.5 tabular-nums">{run.item_count ?? "—"}</p>
                </div>
              </div>

              {/* A fatal error (the sync threw before completing) — shown only when there is no
                  per-item error list to display instead. */}
              {run.status === "error" && run.error && productErrorCount === 0 && warehouseErrorCount === 0 && customerErrorCount === 0 && pricelistErrorCount === 0 && (
                <div className="rounded-lg border border-rose-300/40 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300 break-words">
                  {run.error}
                </div>
              )}

              {/* warehouse breakdown — each source written to its own CREAGLOBE warehouse */}
              {details?.type === "warehouse" && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Warehouses written</p>
                  {details.warehouses.map((w, i) => (
                    <div key={i} className="rounded-lg border border-border bg-background/50 px-3 py-2 flex items-center gap-2 text-[12px]">
                      <span className="text-foreground font-medium">{w.source}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">{w.target}</span>
                      <span className="ml-auto tabular-nums font-medium text-foreground">{w.count ?? "—"} items</span>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">
                    Stock is read from the T4A warehouse and written into its matching virtual warehouse in CREAGLOBE.
                    The ProMode / Germany source is retired.
                  </p>
                </div>
              )}

              {/* warehouse per-product errors (sync_stock error_list) */}
              {details?.type === "warehouse" && warehouseErrorCount > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                    {warehouseErrorCount} product{warehouseErrorCount === 1 ? "" : "s"} failed to sync
                    {details.errors && details.errors.length < warehouseErrorCount && ` (showing first ${details.errors.length})`}
                  </p>
                  <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                    {(details.errors ?? []).map((e, i) => (
                      <div key={i} className="px-3 py-2 text-[12px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          {e.product_code && <span className="font-mono text-foreground">{e.product_code}</span>}
                          {e.warehouse_id && <span className="text-[10px] text-muted-foreground">wh {e.warehouse_id}</span>}
                        </div>
                        <p className="text-rose-600 dark:text-rose-400 mt-0.5 break-words">{e.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* product change buckets. Sync is one-way (T4A → CREAGLOBE), so the T4A-side
                  buckets are always 0 — drop empty buckets so we only show the CREAGLOBE
                  changes and don't imply T4A was written to. */}
              {details?.type === "products" && (() => {
                const shownBuckets = details.buckets.filter((b) => b.count > 0);
                return (
                <>
                  {shownBuckets.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Changes applied</p>
                      <div className="grid grid-cols-2 gap-2">
                        {shownBuckets.map((b) => (
                          <div key={b.key} className="rounded-lg border border-border bg-background/50 px-3 py-2 flex items-center justify-between text-[12px]">
                            <span className="text-muted-foreground truncate">{bucketLabel(b.key)}</span>
                            <span className="tabular-nums font-medium text-foreground">{b.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* the actual per-item errors */}
                  {details.errorCount > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                        {details.errorCount} item error{details.errorCount === 1 ? "" : "s"}
                        {details.errors.length < details.errorCount && ` (showing first ${details.errors.length})`}
                      </p>
                      <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                        {details.errors.map((e, i) => (
                          <div key={i} className="px-3 py-2 text-[12px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              {e.product_code && <span className="font-mono text-foreground">{e.product_code}</span>}
                              {e.action && (
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1">{e.action}</span>
                              )}
                              {e.system && <span className="text-[10px] text-muted-foreground">in {e.system}</span>}
                            </div>
                            <p className="text-rose-600 dark:text-rose-400 mt-0.5 break-words">{e.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    run.status === "ok" && (
                      <p className="text-[12px] text-emerald-600 dark:text-emerald-400">All changes applied without errors.</p>
                    )
                  )}
                </>
                );
              })()}

              {/* customer (partner) sync: source/target counts, change buckets, per-item errors */}
              {details?.type === "customers" && (
                <>
                  {details.dryRun && (
                    <div className="rounded-lg border border-indigo-300/40 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2 text-[12px] text-indigo-700 dark:text-indigo-300">
                      Preview run — this computed the plan but did <span className="font-medium">not</span> write anything to CREAGLOBE.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div className="rounded-lg border border-border bg-background/50 px-3 py-2 flex items-center justify-between">
                      <span className="text-muted-foreground">In T4A (source)</span>
                      <span className="tabular-nums font-medium text-foreground">{details.counts.source ?? "—"}</span>
                    </div>
                    <div className="rounded-lg border border-border bg-background/50 px-3 py-2 flex items-center justify-between">
                      <span className="text-muted-foreground">In CREAGLOBE (target)</span>
                      <span className="tabular-nums font-medium text-foreground">{details.counts.target ?? "—"}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {details.dryRun ? "Would apply" : "Changes applied"}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {details.buckets.map((b) => (
                        <div key={b.key} className="rounded-lg border border-border bg-background/50 px-3 py-2 text-[12px]">
                          <p className="text-muted-foreground text-[10px] uppercase tracking-wide truncate" title={b.key}>{b.key}</p>
                          <p className="tabular-nums font-medium text-foreground mt-0.5">{b.count}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* what updated where — per customer */}
                  {(details.changes?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {details.dryRun ? "What would change, per customer" : "What changed, per customer"}
                        {details.changeCount != null &&
                          details.changes!.length < details.changeCount &&
                          ` (showing first ${details.changes!.length} of ${details.changeCount})`}
                      </p>
                      <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden max-h-72 overflow-y-auto">
                        {details.changes!.map((c, i) => (
                          <div key={i} className="px-3 py-2 text-[12px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={cn(
                                  "text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border",
                                  c.action === "create"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50"
                                    : "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/50",
                                )}
                              >
                                {c.action === "create" ? "Created" : "Updated"}
                              </span>
                              <span className="font-medium text-foreground">{c.partner ?? "—"}</span>
                              {c.tax_id_number && <span className="text-[10px] font-mono text-muted-foreground">{c.tax_id_number}</span>}
                              {c.via && <span className="text-[10px] text-muted-foreground">matched by {c.via}</span>}
                            </div>
                            <p className="text-muted-foreground mt-0.5">
                              {customerChangeSummary(c)} <span className="text-foreground/50">→ CREAGLOBE</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {details.errorCount > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                        {details.errorCount} customer{details.errorCount === 1 ? "" : "s"} failed to sync
                        {details.errors.length < details.errorCount && ` (showing first ${details.errors.length})`}
                      </p>
                      <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                        {details.errors.map((e, i) => (
                          <div key={i} className="px-3 py-2 text-[12px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              {e.partner && <span className="font-medium text-foreground">{e.partner}</span>}
                              {e.tax_id_number && <span className="text-[10px] font-mono text-muted-foreground">{e.tax_id_number}</span>}
                              {e.action && (
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1">{e.action}</span>
                              )}
                            </div>
                            <p className="text-rose-600 dark:text-rose-400 mt-0.5 break-words">{e.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    run.status === "ok" && (
                      <p className="text-[12px] text-emerald-600 dark:text-emerald-400">
                        {details.dryRun ? "Plan computed without errors." : "All changes applied without errors."}
                      </p>
                    )
                  )}
                </>
              )}

              {/* pricelist (price) sync: per mapped list pair, blocked moves, per-item errors */}
              {details?.type === "pricelists" && (
                <>
                  {details.dryRun && (
                    <div className="rounded-lg border border-indigo-300/40 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2 text-[12px] text-indigo-700 dark:text-indigo-300">
                      Preview run — this computed the plan but did <span className="font-medium">not</span> write any price to CREAGLOBE.
                    </div>
                  )}

                  {details.noMappings && (
                    <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
                      No price lists are mapped yet, so this run did nothing. Map a T4A list to a
                      CREAGLOBE list on the Pricelists page first.
                    </div>
                  )}

                  {!details.noMappings && (
                    <div className="grid grid-cols-3 gap-2">
                      {details.buckets
                        .filter((b) => b.count > 0)
                        .map((b) => (
                          <div
                            key={b.key}
                            className={cn(
                              "rounded-lg border px-3 py-2 text-[12px]",
                              b.key === "blockedByLimit"
                                ? "border-amber-300/50 bg-amber-50 dark:bg-amber-950/30"
                                : "border-border bg-background/50",
                            )}
                          >
                            <p className="text-muted-foreground text-[10px] uppercase tracking-wide truncate" title={b.key}>
                              {bucketLabel(b.key)}
                            </p>
                            <p
                              className={cn(
                                "tabular-nums font-medium mt-0.5",
                                b.key === "blockedByLimit"
                                  ? "text-amber-700 dark:text-amber-300"
                                  : "text-foreground",
                              )}
                            >
                              {b.count}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}

                  {(details.counts.blocked ?? 0) > 0 && (
                    <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
                      <span className="font-medium">{details.counts.blocked} price change(s) were refused</span> for
                      moving further than the mapping&apos;s allowed percentage. Nothing was written for those rows —
                      check the pair really holds the same kind of price on both sides (net vs gross), then raise or
                      clear the limit.
                    </div>
                  )}

                  {(details.warnings?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        Needs attention
                      </p>
                      <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 divide-y divide-amber-300/30 overflow-hidden">
                        {details.warnings!.map((w, i) => (
                          <div key={i} className="px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
                            {w.list && <span className="font-medium">{w.list}: </span>}
                            {w.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* per mapped list pair */}
                  {details.perList.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Per price list</p>
                      <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                        {details.perList.map((L, i) => (
                          <div key={i} className="px-3 py-2 text-[12px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-foreground">{L.source.title ?? L.source.code}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">T4A {L.source.code}</span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground/60" />
                              <span className="text-[10px] font-mono text-muted-foreground">CG {L.target.code}</span>
                              {L.target.title && L.target.title !== L.source.title && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400">({L.target.title})</span>
                              )}
                            </div>
                            {L.skipped ? (
                              <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                                {L.skipped === "source-list-not-found"
                                  ? "Skipped — the T4A list has no products on it, or its code changed."
                                  : "Skipped — the CREAGLOBE list was not seen. It is empty or does not exist."}
                              </p>
                            ) : (
                              <p className="text-muted-foreground mt-0.5 tabular-nums">
                                {L.added} added · {L.updated} updated · {L.unchanged} already in line
                                {L.blocked > 0 && (
                                  <span className="text-amber-700 dark:text-amber-300"> · {L.blocked} blocked</span>
                                )}
                                {L.extra > 0 && <span> · {L.extra} extra in CREAGLOBE (left alone)</span>}
                                {L.skippedMissingProduct > 0 && <span> · {L.skippedMissingProduct} product not in CREAGLOBE</span>}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* what changed, per product */}
                  {(details.changes?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {details.dryRun ? "What would change, per product" : "What changed, per product"}
                        {details.changeCount != null &&
                          details.changes!.length < details.changeCount &&
                          ` (showing first ${details.changes!.length} of ${details.changeCount})`}
                      </p>
                      <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden max-h-72 overflow-y-auto">
                        {details.changes!.map((c, i) => (
                          <div key={i} className="px-3 py-2 text-[12px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={cn(
                                  "text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border",
                                  c.action === "add"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50"
                                    : c.action === "blocked"
                                      ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50"
                                      : "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/50",
                                )}
                              >
                                {c.action === "add" ? "Added" : c.action === "blocked" ? "Blocked" : "Updated"}
                              </span>
                              <span className="font-mono text-foreground">{c.productCode}</span>
                              <span className="text-[10px] text-muted-foreground truncate max-w-[14rem]">{c.list}</span>
                            </div>
                            <p
                              className={cn(
                                "mt-0.5 break-words",
                                c.action === "blocked" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                              )}
                            >
                              {c.summary}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {details.errorCount > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                        {details.errorCount} price update{details.errorCount === 1 ? "" : "s"} failed
                        {details.errors.length < details.errorCount && ` (showing first ${details.errors.length})`}
                      </p>
                      <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                        {details.errors.map((e, i) => (
                          <div key={i} className="px-3 py-2 text-[12px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              {e.product_code && <span className="font-mono text-foreground">{e.product_code}</span>}
                              {e.list && <span className="text-[10px] text-muted-foreground">list {e.list}</span>}
                              {e.scope === "mapping" && (
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1">
                                  mapping
                                </span>
                              )}
                              {e.system && <span className="text-[10px] text-muted-foreground">in {e.system}</span>}
                            </div>
                            <p className="text-rose-600 dark:text-rose-400 mt-0.5 break-words">{e.message}</p>
                            {e.payload && (
                              <pre className="mt-1 text-[10px] font-mono text-muted-foreground bg-muted/40 rounded p-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                                {e.payload}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    run.status === "ok" &&
                    !details.noMappings && (
                      <p className="text-[12px] text-emerald-600 dark:text-emerald-400">
                        {details.dryRun ? "Plan computed without errors." : "All price changes applied without errors."}
                      </p>
                    )
                  )}
                </>
              )}

              {!details && (
                <div className="rounded-lg border border-border bg-background/50 px-3 py-2 text-[12px] text-muted-foreground">
                  {run.status === "error"
                    ? "This run was recorded before per-item error capture was added, so the individual failures weren't saved. Run the sync again to see exactly which items failed and why."
                    : "No detailed breakdown was recorded for this run."}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── sync card ───────────────────────────────────────────────────────────────

export function SyncCard({
  icon: Icon,
  title,
  description,
  itemLabel,
  state,
  starting,
  onRun,
  onEdit,
  onViewDetails,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  itemLabel: string;
  state?: MkSyncState;
  starting: boolean;
  onRun: () => void;
  onEdit: () => void;
  onViewDetails: (run: MkRun) => void;
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
              <button
                type="button"
                onClick={() => last && onViewDetails(last)}
                className="text-rose-600 dark:text-rose-400 hover:underline"
              >
                Failed{last.error ? ` · ${last.error}` : ""}
              </button>
            ) : last?.status === "ok" ? (
              <span className="inline-flex items-center gap-1.5">
                {`${(last.item_count ?? 0).toLocaleString()} ${itemLabel}`}
                {isDryRun(last) && <DryRunBadge />}
              </span>
            ) : (
              "—"
            )
          }
        />
      </div>

      <div className="flex items-center gap-2 mt-auto pt-1">
        <Button size="sm" className="h-8 text-xs gap-1.5 flex-1" onClick={onRun} disabled={running}>
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {running ? "Running…" : "Run now"}
        </Button>
        {last && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => onViewDetails(last)}
            title="View last run details"
          >
            Details
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── run history table ───────────────────────────────────────────────────────

export function RunHistoryTable({
  runs,
  onOpen,
  showType = true,
}: {
  runs: MkRun[];
  onOpen: (run: MkRun) => void;
  showType?: boolean;
}) {
  const colSpan = showType ? 7 : 6;
  return (
    <div className="bg-surface border border-border rounded-xl overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">When</TableHead>
            {showType && <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">What</TableHead>}
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">How</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Outcome</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Took</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Items</TableHead>
            <TableHead className="h-9 w-[40px] pr-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center text-[12px] text-muted-foreground py-8">
                No runs yet — press <span className="font-medium text-foreground">Run now</span> above.
              </TableCell>
            </TableRow>
          ) : (
            runs.map((run) => (
              <TableRow
                key={`${run.type}-${run.id}`}
                className="border-b border-border/60 cursor-pointer hover:bg-muted/40"
                onClick={() => onOpen(run)}
              >
                <TableCell className="pl-5 py-2.5 text-[12px] text-foreground" title={fmtDate(run.started_at)}>
                  {fmtDate(run.started_at)}
                </TableCell>
                {showType && <TableCell className="py-2.5 text-[12px] text-foreground capitalize">{run.type}</TableCell>}
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
                    {isDryRun(run) && <DryRunBadge />}
                  </span>
                  {run.status === "error" && run.error && (
                    <span className="block text-[10px] text-rose-500/80 truncate max-w-[260px]" title={run.error}>
                      {run.error}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-2.5 text-[12px] text-muted-foreground tabular-nums">{fmtDuration(run.duration_ms)}</TableCell>
                <TableCell className="py-2.5 text-[12px] text-muted-foreground tabular-nums">
                  {run.item_count ?? "—"}
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
  );
}

// ── data hook ───────────────────────────────────────────────────────────────

// Fetches the combined automation status (both syncs + their run history), exposes the
// run-now / edit-schedule actions, and polls while anything is running. Shared by the
// overview and both per-sync pages — each page renders whichever slice it needs.
export function useAutomation() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [starting, setStarting] = useState<Record<SyncType, boolean>>({ warehouse: false, products: false, customers: false, pricelists: false });
  const [editing, setEditing] = useState<SyncType | null>(null);
  const [savingCron, setSavingCron] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<MkRun | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/automation/status", { cache: "no-store" });
      const data = await r.json();
      if (!mounted.current) return;
      if (!r.ok || data?.reachable === false) {
        // Keep any previously loaded status on a transient blip; just surface the error.
        setError(data?.error ?? "Couldn't reach the automation service");
        return;
      }
      setError(null);
      setStatus(data as AutomationStatus);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Couldn't load automation status");
    } finally {
      if (mounted.current) {
        setLoading(false);
        setStarting({ warehouse: false, products: false, customers: false, pricelists: false });
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

  const anyRunning = !!(
    status?.warehouse.isRunning ||
    status?.products.isRunning ||
    status?.customers.isRunning ||
    status?.pricelists.isRunning
  );
  const anyStarting = starting.warehouse || starting.products || starting.customers || starting.pricelists;
  useEffect(() => {
    if (!anyRunning && !anyStarting) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [anyRunning, anyStarting, load]);

  const runNow = useCallback(
    async (type: SyncType, opts?: { dryRun?: boolean }) => {
      setStarting((s) => ({ ...s, [type]: true }));
      setActionError(null);
      try {
        const url = opts?.dryRun ? `/api/automation/${type}/run?dryRun=true` : `/api/automation/${type}/run`;
        const r = await fetch(url, { method: "POST" });
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

  const startEditing = useCallback((type: SyncType) => {
    setCronError(null);
    setEditing(type);
  }, []);

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

  return {
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
  };
}

// Merge both run lists for the combined history table, newest first.
export function mergeRuns(status: AutomationStatus | null): MkRun[] {
  if (!status) return [];
  return [
    ...status.runs.warehouse,
    ...status.runs.products,
    ...status.runs.customers,
    ...status.runs.pricelists,
  ].sort((a, b) => {
    const ta = new Date(parseSqlDate(a.started_at ?? "")).getTime() || 0;
    const tb = new Date(parseSqlDate(b.started_at ?? "")).getTime() || 0;
    return tb - ta;
  });
}

// ── single-sync page ────────────────────────────────────────────────────────

// The dedicated page for one sync (warehouse OR products): its card, an explanatory panel,
// and a run history scoped to just that sync. The overview page composes the cards itself;
// this keeps the two per-sync routes to a one-line render.
export function SingleSyncPage({
  type,
  title,
  icon: Icon,
  description,
  itemLabel,
  howItWorks,
  previewable = false,
  extra,
}: {
  type: SyncType;
  title: string;
  icon: React.ElementType;
  description: string;
  itemLabel: string;
  howItWorks: React.ReactNode;
  // When true, show a "Preview (dry run)" action that computes the plan without writing.
  previewable?: boolean;
  // Page-specific content rendered between the cards and the run history (the pricelist
  // page puts its price-list mapping editor here).
  extra?: React.ReactNode;
}) {
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

  const state = status?.[type];
  const runs = status?.runs[type] ?? [];
  const tone = stateTone(state, starting[type] || anyStarting);

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Link href="/automation" className="text-[12px] text-muted-foreground hover:text-foreground shrink-0">
              Automation
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">{title}</h1>
            {status && <StatusPill tone={tone} />}
          </div>
          <div className="flex items-center gap-2">
            {previewable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => runNow(type, { dryRun: true })}
                disabled={starting[type] || state?.isRunning}
                className="h-8 text-xs gap-1.5"
                title="Compute the plan without writing to CREAGLOBE"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                Preview (dry run)
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="h-8 text-xs gap-1.5">
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-4 md:p-8 space-y-6">
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
            <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <div className="h-8 w-40 rounded skeleton" />
              <div className="h-3 w-full rounded skeleton" />
              <div className="h-3 w-3/4 rounded skeleton" />
              <div className="h-8 w-full rounded skeleton" />
            </div>
          </div>
        ) : (
          status && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <SyncCard
                icon={Icon}
                title={title}
                description={description}
                itemLabel={itemLabel}
                state={state}
                starting={starting[type]}
                onRun={() => runNow(type)}
                onEdit={() => startEditing(type)}
                onViewDetails={setOpenRun}
              />
              <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
                <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">How it works</h2>
                <div className="text-[12px] leading-relaxed text-muted-foreground space-y-2">{howItWorks}</div>
              </div>
            </div>
          )
        )}

        {extra}

        {status && (
          <section className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Run history</h2>
            </div>
            <RunHistoryTable runs={runs} onOpen={setOpenRun} showType={false} />
          </section>
        )}
      </div>

      <CronEditorModal
        open={editing !== null}
        title={`Edit schedule — ${title}`}
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
