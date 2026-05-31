"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WarrantyStatusBadge } from "@/components/warranty-status-badge";
import {
  ASSIGNEES,
  REJECTED_KEY,
  WARRANTY_STATUSES,
  WARRANTY_STATUS_LABELS,
  WARRANTY_TYPE_LABELS,
  isRejected,
  type Assignee,
  type ListWarrantyResult,
  type RejectedKey,
  type WarrantyStatus,
  type WarrantySubmission,
} from "@/types/warranty";
import {
  Search,
  ShieldCheck,
  ChevronRight,
  Settings,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | WarrantyStatus | RejectedKey;
type AssigneeFilter = "all" | "unassigned" | Assignee;
const ASSIGNEE_NONE = "__none__";

// Dot colour per status for the count strip — mirrors the status badge palette.
const STATUS_DOT: Record<StatusFilter, string> = {
  all: "bg-foreground",
  open: "bg-slate-400",
  in_review: "bg-amber-400",
  decided: "bg-sky-400",
  to_send_new_product: "bg-violet-400",
  [REJECTED_KEY]: "bg-rose-500",
  finished: "bg-emerald-500",
};

// Insert the synthetic "Rejected" pill right before "Finished" so it reads as
// the terminal branch of the decision split.
const STATUS_FILTERS: StatusFilter[] = [
  "all",
  ...WARRANTY_STATUSES.filter((s) => s !== "finished"),
  REJECTED_KEY,
  "finished",
];

function statusFilterLabel(s: StatusFilter): string {
  if (s === "all") return "All";
  if (s === REJECTED_KEY) return "Rejected";
  return WARRANTY_STATUS_LABELS[s];
}

function filterToQuery(s: StatusFilter): URLSearchParams {
  const qs = new URLSearchParams();
  if (s === "all") return qs;
  if (s === REJECTED_KEY) {
    qs.set("warrantyType", "denied");
    return qs;
  }
  qs.set("status", s);
  return qs;
}

function joinName(name: string, surname: string): string {
  return [name, surname].filter((x) => x?.trim()).join(" ").trim();
}

function fmtSubmitted(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function ClaimsPage() {
  const [items, setItems] = useState<WarrantySubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [assignee, setAssignee] = useState<AssigneeFilter>("all");
  const [countsLoading, setCountsLoading] = useState(true);
  const [counts, setCounts] = useState<Record<StatusFilter, number>>({
    all: 0,
    open: 0,
    in_review: 0,
    decided: 0,
    to_send_new_product: 0,
    [REJECTED_KEY]: 0,
    finished: 0,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = filterToQuery(status);
    if (assignee !== "all") qs.set("assignee", assignee);
    if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim());
    // The virtualized table renders the full window cheaply, so pull a wide cap.
    qs.set("limit", "2000");
    fetch(`/api/warranty/submissions?${qs.toString()}`)
      .then(async (r) => {
        const data = (await r.json()) as ListWarrantyResult | { error: string };
        if (cancelled) return;
        if (!r.ok || "error" in data) {
          setError("error" in data ? data.error : "Couldn't load claims");
          setItems([]);
          setTotal(0);
        } else {
          setItems(data.items);
          setTotal(data.total);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load claims");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, assignee, debouncedSearch]);

  // Pill counts: one unfiltered fetch, counted client-side. The backend
  // ignores ?warrantyType so we have to assign Rejected locally.
  useEffect(() => {
    let cancelled = false;
    setCountsLoading(true);
    const qs = new URLSearchParams();
    if (assignee !== "all") qs.set("assignee", assignee);
    qs.set("limit", "2000");
    fetch(`/api/warranty/submissions?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : { items: [], total: 0 }))
      .then((d: { items?: WarrantySubmission[]; total?: number }) => {
        if (cancelled) return;
        const all = d.items ?? [];
        const next: Record<StatusFilter, number> = {
          all: d.total ?? all.length,
          open: 0,
          in_review: 0,
          decided: 0,
          to_send_new_product: 0,
          finished: 0,
          [REJECTED_KEY]: 0,
        };
        for (const it of all) {
          if (isRejected(it)) next[REJECTED_KEY]++;
          else next[it.status]++;
        }
        setCounts(next);
      })
      .finally(() => {
        if (!cancelled) setCountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [items.length, assignee]);

  const filtered = useMemo(() => {
    if (status === REJECTED_KEY) return items.filter((it) => isRejected(it));
    if (status === "all") return items;
    return items.filter((it) => !isRejected(it));
  }, [items, status]);

  const headerCount = counts[status] || total;

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">
              Warranty claims
            </h1>
            {headerCount > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0 tabular-nums">
                {headerCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search claims…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search claims"
                className="pl-8 h-8 w-40 md:w-56 text-xs bg-background"
              />
            </div>
            <Link
              href="/warranty/settings"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Settings className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden sm:inline">Email settings</span>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 md:px-8 pb-3 flex-wrap">
          <div className="relative sm:hidden flex-1 basis-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search claims…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search claims"
              className="pl-8 h-8 text-xs bg-background w-full"
            />
          </div>

          {/* Per-status count strip — doubles as the status filter. Click a
              card to scope the table to that status; the active card is filled. */}
          <WarrantyCountStrip
            counts={counts}
            loading={countsLoading}
            active={status}
            onSelect={setStatus}
          />

          <Select
            value={assignee}
            onValueChange={(v) => setAssignee(v as AssigneeFilter)}
          >
            <SelectTrigger className="h-8 text-[11px] w-[140px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start" sideOffset={4}>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {ASSIGNEES.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Body: flex column. The table virtualizes its own rows; the board
          scrolls horizontally with each column scrolling its cards
          independently. Either way the inner surface owns the scroll. */}
      <div className="flex-1 min-h-0 p-4 md:p-8 flex flex-col">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive"
          >
            {error}
          </div>
        )}

        <ClaimsTable
          items={filtered}
          loading={loading}
          onAssigneeChange={(updated) =>
            setItems((prev) =>
              prev.map((p) =>
                p.submissionId === updated.submissionId ? updated : p,
              ),
            )
          }
        />
      </div>
    </div>
  );
}

// Horizontal strip of per-status count cards. Each card is a filter toggle:
// click to scope the table to that status, click the active one again to clear.
function WarrantyCountStrip({
  counts,
  loading,
  active,
  onSelect,
}: {
  counts: Record<StatusFilter, number>;
  loading: boolean;
  active: StatusFilter;
  onSelect: (s: StatusFilter) => void;
}) {
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto flex-1 min-w-0 py-0.5">
      {STATUS_FILTERS.map((s) => {
        const isActive = active === s;
        const isRejected = s === REJECTED_KEY;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onSelect(isActive && s !== "all" ? "all" : s)}
            aria-pressed={isActive}
            title={statusFilterLabel(s)}
            className={cn(
              "group flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors select-none whitespace-nowrap shrink-0",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? isRejected
                  ? "border-rose-400 bg-rose-50 dark:bg-rose-950/40"
                  : "border-foreground/40 bg-muted"
                : "border-border bg-background hover:border-foreground/30 hover:bg-muted/40",
            )}
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                STATUS_DOT[s],
                !isActive && "opacity-70",
              )}
              aria-hidden
            />
            <span className="flex flex-col items-start leading-none gap-0.5">
              {loading ? (
                <span className="h-3.5 w-6 rounded skeleton" />
              ) : (
                <span
                  className={cn(
                    "text-[13px] font-semibold tabular-nums leading-none",
                    isActive
                      ? isRejected
                        ? "text-rose-700 dark:text-rose-300"
                        : "text-foreground"
                      : "text-foreground",
                  )}
                >
                  {counts[s]}
                </span>
              )}
              <span className="text-[9px] uppercase tracking-wide font-medium text-muted-foreground leading-none">
                {statusFilterLabel(s)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const ROW_HEIGHT_ESTIMATE = 56;

function ClaimsTable({
  items,
  loading,
  onAssigneeChange,
}: {
  items: WarrantySubmission[];
  loading: boolean;
  onAssigneeChange: (updated: WarrantySubmission) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const skeletonCount = 8;
  const count = loading ? skeletonCount : items.length;

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems[0]?.start ?? 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  const empty = !loading && items.length === 0;

  return (
    <div
      ref={parentRef}
      className="flex-1 min-h-0 bg-surface border border-border rounded-xl overflow-auto"
    >
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-surface">
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">Received</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Claim</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Customer</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Product</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Assignee</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Type</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Status</TableHead>
            <TableHead className="h-9 w-[40px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {paddingTop > 0 && (
            <tr aria-hidden style={{ height: paddingTop }}>
              <td colSpan={8} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            if (loading) {
              const i = virtualRow.index;
              return (
                <TableRow
                  key={`sk-${i}`}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="border-b border-border/60"
                >
                  <TableCell className="pl-5 py-3">
                    <div className="h-3 w-24 rounded skeleton" style={{ animationDelay: `${i * 80}ms` }} />
                  </TableCell>
                  <TableCell><div className="h-3 w-20 rounded skeleton" style={{ animationDelay: `${i * 80 + 20}ms` }} /></TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <div className="h-3 w-28 rounded skeleton" style={{ animationDelay: `${i * 80 + 40}ms` }} />
                      <div className="h-2.5 w-36 rounded skeleton" style={{ animationDelay: `${i * 80 + 60}ms` }} />
                    </div>
                  </TableCell>
                  <TableCell><div className="h-3 w-32 rounded skeleton" style={{ animationDelay: `${i * 80 + 50}ms` }} /></TableCell>
                  <TableCell><div className="h-3 w-16 rounded skeleton" style={{ animationDelay: `${i * 80 + 70}ms` }} /></TableCell>
                  <TableCell><div className="h-3 w-16 rounded skeleton" style={{ animationDelay: `${i * 80 + 80}ms` }} /></TableCell>
                  <TableCell><div className="h-5 w-20 rounded-full skeleton" style={{ animationDelay: `${i * 80 + 90}ms` }} /></TableCell>
                  <TableCell />
                </TableRow>
              );
            }
            const item = items[virtualRow.index];
            return (
              <ClaimRow
                key={item.submissionId}
                item={item}
                onAssigneeChange={onAssigneeChange}
                rowRef={rowVirtualizer.measureElement}
                rowIndex={virtualRow.index}
              />
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden style={{ height: paddingBottom }}>
              <td colSpan={8} />
            </tr>
          )}
          {empty && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-[13px] text-muted-foreground py-16">
                <ShieldCheck className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" aria-hidden />
                No claims match your filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ClaimRow({
  item,
  onAssigneeChange,
  rowRef,
  rowIndex,
}: {
  item: WarrantySubmission;
  onAssigneeChange: (updated: WarrantySubmission) => void;
  rowRef?: (el: HTMLElement | null) => void;
  rowIndex?: number;
}) {
  const fullName = joinName(item.name, item.surname);
  const shortId = item.submissionId.slice(0, 8);
  const href = `/warranty/${encodeURIComponent(item.submissionId)}`;
  return (
    <TableRow
      ref={rowRef}
      data-index={rowIndex}
      className="border-b border-border/60 hover:bg-muted/30 transition-colors group"
    >
      <TableCell className="pl-5 py-3 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
        <Link href={href} className="block focus-visible:outline-none focus-visible:underline">{fmtSubmitted(item.submittedAt)}</Link>
      </TableCell>
      <TableCell className="text-[12px] font-mono text-muted-foreground">
        <Link href={href} className="hover:text-foreground transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:underline">
          #{shortId}
          {item.notes.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <MessageSquare className="w-2.5 h-2.5" aria-hidden />
              {item.notes.length}
            </span>
          )}
        </Link>
      </TableCell>
      <TableCell>
        <Link href={href} className="min-w-0 block focus-visible:outline-none">
          <div className="text-[13px] font-medium text-foreground group-hover:underline truncate leading-tight">
            {fullName || "—"}
          </div>
          <span className="text-[11px] text-muted-foreground block truncate leading-tight">
            {item.email}
          </span>
        </Link>
      </TableCell>
      <TableCell>
        <Link href={href} className="block focus-visible:outline-none">
          <span className="text-[13px] text-foreground truncate block max-w-[240px]">{item.productName || "—"}</span>
          {item.serialNumber && (
            <span className="text-[10px] font-mono text-muted-foreground truncate block max-w-[240px]">
              {item.serialNumber}
            </span>
          )}
        </Link>
      </TableCell>
      <TableCell>
        <InlineAssigneePicker item={item} onChange={onAssigneeChange} />
      </TableCell>
      <TableCell className="text-[12px] text-foreground whitespace-nowrap">
        {item.warrantyType ? (
          <span
            className={cn(
              "text-[11px] font-medium",
              item.warrantyType === "denied"
                ? "text-destructive"
                : "text-foreground",
            )}
          >
            {WARRANTY_TYPE_LABELS[item.warrantyType]}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <WarrantyStatusBadge status={item.status} rejected={isRejected(item)} />
      </TableCell>
      <TableCell className="pr-4">
        <Link
          href={href}
          aria-label={`Open claim ${shortId}`}
          className="flex items-center justify-end text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:text-foreground"
          title="Open"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </TableCell>
    </TableRow>
  );
}

function InlineAssigneePicker({
  item,
  onChange,
}: {
  item: WarrantySubmission;
  onChange: (updated: WarrantySubmission) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(next: Assignee | null) {
    setSaving(true);
    setError(false);
    const res = await fetch(
      `/api/warranty/submissions/${encodeURIComponent(item.submissionId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignee: next }),
      },
    );
    setSaving(false);
    if (!res.ok) {
      setError(true);
      setTimeout(() => setError(false), 2500);
      return;
    }
    const updated = (await res.json()) as WarrantySubmission;
    onChange(updated);
  }

  return (
    <Select
      value={item.assignee ?? ASSIGNEE_NONE}
      onValueChange={(v) => save(v === ASSIGNEE_NONE ? null : (v as Assignee))}
      disabled={saving}
    >
      <SelectTrigger
        className={cn(
          "h-7 w-[140px] text-[12px] gap-1.5 px-2",
          error && "border-destructive ring-destructive/30",
        )}
      >
        {saving ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
            Saving…
          </span>
        ) : item.assignee ? (
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-muted border border-border/60 flex items-center justify-center text-[9px] font-bold">
              {item.assignee[0]}
            </span>
            {item.assignee}
          </span>
        ) : (
          <span className="text-muted-foreground italic">Unassigned</span>
        )}
      </SelectTrigger>
      <SelectContent position="popper" align="start" sideOffset={4}>
        <SelectItem value={ASSIGNEE_NONE}>Unassigned</SelectItem>
        {ASSIGNEES.map((a) => (
          <SelectItem key={a} value={a}>
            {a}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

