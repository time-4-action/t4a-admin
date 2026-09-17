"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { HeaderFilter } from "@/components/ui/header-filter";
import {
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  FileText,
  ReceiptText,
  ClipboardList,
  Calendar,
  Package,
  ArrowLeftRight,
  Wrench,
  FileMinus,
  Building2,
  Globe,
  Image as ImageIcon,
  Truck,
  MapPin,
  X,
} from "lucide-react";
import {
  DOC_KIND_LABELS,
  isBillKind,
  type DocDetail,
  type DocKind,
  type DocLine,
  type DocSummary,
  type MkPartnerRef,
  type PaymentState,
} from "@/types/documents";

// Presentational + data building blocks shared by the customer B2B portal and
// the admin "Documents" browse tool. The only thing that differs between the two
// surfaces is the API/href base — everything visual lives here.

// ── formatting ───────────────────────────────────────────────────────────────

// A missing / empty amount is zero (Metakocka leaves sum fields out on a 0 document),
// never a dash — a total is always a number.
export function fmtMoney(amount?: string, currency?: string): string {
  if (amount === undefined || amount.trim() === "") amount = "0";
  const n = parseFloat(amount.replace(",", "."));
  if (!Number.isFinite(n)) return amount;
  if (currency) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
    } catch {
      /* unknown currency code — fall through */
    }
  }
  return `${n.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function toNum(s?: string): number | undefined {
  if (s === undefined) return undefined;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function amt(s?: string): number {
  return toNum(s) ?? 0;
}

export const KIND_ICON: Record<DocKind, React.ElementType> = {
  offer: FileText,
  order: ClipboardList,
  invoice: ReceiptText,
  "credit-note": FileMinus,
};

// ── payment badge ────────────────────────────────────────────────────────────

const PAYMENT_META: Record<PaymentState, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  partial: { label: "Partial", cls: "bg-amber-500/12 text-amber-600 dark:text-amber-400" },
  unpaid: { label: "Unpaid", cls: "bg-slate-500/12 text-slate-600 dark:text-slate-300" },
  overdue: { label: "Overdue", cls: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  na: { label: "—", cls: "bg-slate-500/10 text-muted-foreground" },
};

export function PaymentBadge({ state }: { state?: PaymentState }) {
  if (!state || state === "na") return null;
  const m = PAYMENT_META[state];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", m.cls)}>
      {m.label}
    </span>
  );
}

export function StatusPill({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
      {label.replace(/_/g, " ")}
    </span>
  );
}

// Webshop orders in Metakocka are numbered with a trailing slash (e.g.
// "582/2026/") — that suffix is the only reliable "this came from the online
// store" signal in the API.
export function isOnlineOrder(d: { kind: DocKind; countCode?: string }): boolean {
  return d.kind === "order" && !!d.countCode && d.countCode.trim().endsWith("/");
}

export function OnlineBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/12 text-sky-600 dark:text-sky-400 px-2 py-0.5 text-[11px] font-semibold">
      <Globe className="h-3 w-3" /> Online
    </span>
  );
}

// Sales-order fulfilment states (from MK status_desc). Fully invoiced = green,
// partly invoiced = orange, new (nothing done yet) = a fresh green tag + a light
// green row, shipped states = blue.
const ORDER_STATUS_META: Record<string, { label: string; cls: string }> = {
  invoiced: { label: "Invoiced", cls: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  invoiced_part: { label: "Partly invoiced", cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  shipped: { label: "Shipped", cls: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  shipped_part: { label: "Partly shipped", cls: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  created: { label: "New", cls: "bg-lime-500/15 text-lime-700 dark:text-lime-400" },
};

// A new order = created and not yet invoiced/shipped; the whole row gets a light
// green wash to flag it as fresh / needing attention.
export function isNewOrder(d: DocSummary): boolean {
  return d.kind === "order" && (d.statusDesc?.toLowerCase() ?? "") === "created";
}

export function OrderStatusPill({ d }: { d: DocSummary }) {
  const meta = d.statusDesc ? ORDER_STATUS_META[d.statusDesc.toLowerCase()] : undefined;
  if (!meta) return <StatusPill label={d.statusDesc || d.statusCode} />;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.cls)}>
      {meta.label}
    </span>
  );
}

// ── list ─────────────────────────────────────────────────────────────────────

type ListState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; items: DocSummary[]; total: number };

// Fetches a document list. `listUrl` may already carry query params (e.g. the
// admin partner id); we add `type` on top of whatever is there.
function useDocumentList(listUrl: string, kind: DocKind): ListState {
  const [state, setState] = useState<ListState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const u = new URL(listUrl, window.location.origin);
    u.searchParams.set("type", kind);
    fetch(u.pathname + u.search, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setState({ status: "error", error: body?.error || `Failed (${r.status})` });
          return;
        }
        setState({
          status: "ready",
          items: Array.isArray(body.items) ? body.items : [],
          total: typeof body.total === "number" ? body.total : (body.items?.length ?? 0),
        });
      })
      .catch((e) => {
        if (!cancelled) setState({ status: "error", error: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [listUrl, kind]);

  return state;
}

export function DocumentList({
  kind,
  listUrl,
  hrefBase,
}: {
  kind: DocKind;
  listUrl: string;
  hrefBase: string;
}) {
  const state = useDocumentList(listUrl, kind);
  const isBill = isBillKind(kind);
  const filters = useDocumentFilters(kind);
  const allItems = state.status === "ready" ? state.items : EMPTY_ITEMS;
  const sort = useDocumentSort(kind);
  const filtered = useMemo(
    () => sortDocuments(applyDocumentFilters(allItems, filters.value), sort.value),
    [allItems, filters.value, sort.value],
  );
  const paging = usePaging(filtered.length, filters.value);
  const pageItems = filtered.slice(paging.start, paging.start + PAGE_SIZE);

  if (state.status === "loading") return <DocumentListSkeleton kind={kind} />;

  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-6 text-[13px] text-rose-600 dark:text-rose-400">
        Couldn&apos;t load documents: {state.error}
      </div>
    );
  }

  if (state.items.length === 0) {
    const Icon = KIND_ICON[kind];
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center">
        <Icon className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-3 text-[13px] text-muted-foreground">No {DOC_KIND_LABELS[kind].plural.toLowerCase()} yet.</p>
      </div>
    );
  }

  const noun = DOC_KIND_LABELS[kind].plural.toLowerCase();

  return (
    <div className="space-y-4">
      {isBill ? <BillSummary kind={kind} items={state.items} /> : <OrderSummaryStrip items={state.items} />}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <DocumentFilterBar kind={kind} items={state.items} filters={filters} shown={filtered.length} />

        {/* Column header — the same grid as the rows below. Sort lives on the
            column headings; the status heading is the status filter itself. */}
        <div className={cn(gridCols(kind), "hidden md:grid px-4 h-9 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-muted/25")}>
          <SortHeader col="doc" sort={sort}>{DOC_KIND_LABELS[kind].singular}</SortHeader>
          <SortHeader col="issued" sort={sort}>Issued</SortHeader>
          {isBill && <SortHeader col="due" sort={sort}>Due</SortHeader>}
          <SortHeader col="items" sort={sort} align="center">Items</SortHeader>
          <StatusHeader kind={kind} items={state.items} filters={filters} />
          <SortHeader col="amount" sort={sort} align="right">Amount</SortHeader>
        </div>

        <div className="divide-y divide-border/50">
          {pageItems.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              No {noun} match these filters.{" "}
              <button type="button" onClick={filters.reset} className="text-teal-600 dark:text-teal-400 hover:underline">
                Clear filters
              </button>
            </div>
          )}
          {pageItems.map((d) => (
            <DocumentRow
              key={d.mkId}
              d={d}
              href={`${hrefBase}/${encodeURIComponent(d.mkId)}`}
              activeStatus={filters.value.status}
              onStatus={(key) => filters.set("status", filters.value.status === key ? "all" : key)}
            />
          ))}
        </div>
        <Pager total={filtered.length} paging={paging} noun={noun} />
      </div>
    </div>
  );
}

// The table grid. Every column gets a proportional share so the row reads as
// a table at any width — no single column swallows the slack. Mobile collapses
// to document + amount; the hidden columns fold into the document cell.
function gridCols(kind: DocKind): string {
  return isBillKind(kind)
    ? "grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-4"
    : "grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.5fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-x-4";
}

// Days from today to an ISO date (negative = past). Local midnight both sides.
function daysUntil(iso?: string | null): number | undefined {
  if (!iso) return undefined;
  const target = new Date(iso + "T00:00:00").getTime();
  if (!Number.isFinite(target)) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

// The due-date cell of an invoice row. It is the one thing a customer scans
// the list for, so it is set large and coloured by urgency: overdue = rose
// with the days overdue, due within a week = amber, settled = quiet.
function DueCell({ d, compact = false }: { d: DocSummary; compact?: boolean }) {
  if (!d.dueDate) return <span className="text-muted-foreground/50">—</span>;
  const settled = d.payment === "paid" || d.payment === "na";
  const days = daysUntil(d.dueDate);
  let tone = "text-foreground";
  let note: string | undefined;
  if (settled) {
    tone = "text-muted-foreground"; // the Paid pill already says it
  } else if (d.payment === "overdue" || (days !== undefined && days < 0)) {
    tone = "text-rose-600 dark:text-rose-400";
    note = days === undefined ? "Overdue" : `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`;
  } else if (days !== undefined && days <= 7) {
    tone = "text-amber-600 dark:text-amber-400";
    note = days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;
  } else if (days !== undefined) {
    note = `Due in ${days} days`;
  }
  if (compact) {
    return (
      <span className={cn("font-semibold", tone)}>
        {fmtDate(d.dueDate)}
        {note && <span className="font-normal opacity-80"> · {note}</span>}
      </span>
    );
  }
  return (
    <div className="min-w-0">
      <p className={cn("text-[15px] font-semibold tabular-nums leading-tight truncate", tone)}>{fmtDate(d.dueDate)}</p>
      {note && <p className={cn("text-[11px] leading-tight mt-0.5 truncate", tone)}>{note}</p>}
    </div>
  );
}

function DocumentRow({
  d,
  href,
  activeStatus,
  onStatus,
}: {
  d: DocSummary;
  href: string;
  activeStatus: string;
  onStatus: (key: string) => void;
}) {
  const isBill = isBillKind(d.kind);
  const fresh = isNewOrder(d);
  const key = statusKey(d);
  const status = (
    <StatusFilterTrigger active={activeStatus === key} label={statusLabel(d.kind, key)} onClick={() => onStatus(key)}>
      {isBill ? (
        <PaymentBadge state={d.payment} />
      ) : d.kind === "order" ? (
        <OrderStatusPill d={d} />
      ) : (
        <StatusPill label={d.statusDesc || d.statusCode} />
      )}
    </StatusFilterTrigger>
  );
  const remaining = isBill ? amt(d.sumAll) - amt(d.sumPaid) : 0;
  const partial = isBill && d.payment === "partial" && remaining > 0.005;

  return (
    <Link
      href={href}
      className={cn(
        gridCols(d.kind),
        "group px-4 py-3 transition-colors focus-visible:outline-none",
        fresh
          ? "bg-lime-500/[0.07] hover:bg-lime-500/[0.12] focus-visible:bg-lime-500/[0.12]"
          : "hover:bg-muted/40 focus-visible:bg-muted/40",
      )}
    >
      {/* Document */}
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate group-hover:underline">{d.countCode}</p>
        {d.title && <p className="hidden md:block text-[11px] text-muted-foreground mt-0.5 truncate">{d.title}</p>}
        {/* Folded-in columns on narrow screens */}
        <p className="md:hidden text-[11px] text-muted-foreground mt-0.5 truncate">
          {fmtDate(d.docDate)}
          {d.title ? ` · ${d.title}` : ""}
        </p>
        {isBill && (
          <p className="md:hidden text-[12px] mt-1">
            <DueCell d={d} compact />
          </p>
        )}
        <div className="md:hidden mt-1.5 flex items-center gap-1.5">
          {!isBill && isOnlineOrder(d) && <OnlineBadge />}
          {status}
        </div>
      </div>

      {/* Issued */}
      <p className="hidden md:block text-[13px] text-muted-foreground tabular-nums truncate">{fmtDate(d.docDate)}</p>

      {/* Due (bills) */}
      {isBill && (
        <div className="hidden md:block">
          <DueCell d={d} />
        </div>
      )}

      {/* Items */}
      <p className="hidden md:block text-center text-[13px] text-muted-foreground tabular-nums">{d.itemCount ?? "—"}</p>

      {/* Status */}
      <div className="hidden md:flex items-center gap-1.5 min-w-0">
        {!isBill && isOnlineOrder(d) && <OnlineBadge />}
        {status}
      </div>

      {/* Amount */}
      <div className="text-right self-start md:self-center">
        <p className="text-[13px] font-semibold text-foreground tabular-nums">{fmtMoney(d.sumAll, d.currency)}</p>
        {partial && (
          <p className="text-[11px] tabular-nums text-amber-600 dark:text-amber-400">
            {fmtMoney(remaining.toFixed(2), d.currency)} open
          </p>
        )}
      </div>
    </Link>
  );
}

// A status pill inside a row link that filters the list by that status on
// click (click again to clear). The row itself stays a plain <a>, so this is
// a span with button semantics that swallows the click before the link sees
// it; the active filter's pills get a ring so the state is visible in place.
function StatusFilterTrigger({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const fire = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };
  return (
    <span
      role="button"
      tabIndex={0}
      title={active ? "Clear status filter" : `Show only ${label.toLowerCase()}`}
      aria-pressed={active}
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") fire(e);
      }}
      className={cn(
        "inline-flex rounded-full transition-shadow hover:ring-2 hover:ring-teal-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "ring-2 ring-teal-500",
      )}
    >
      {children}
    </span>
  );
}

// ── list filters + paging ────────────────────────────────────────────────────
// Everything is client-side: the API already returns the partner's complete
// list (every MK page merged), so search / status / amount just narrow that
// array and the pager slices it. Filters reset the page to 1.

export const PAGE_SIZE = 25;
const EMPTY_ITEMS: DocSummary[] = [];

type DocFilters = { q: string; status: string };
const EMPTY_FILTERS: DocFilters = { q: "", status: "all" };

function useDocumentFilters(kind: DocKind) {
  const [value, setValue] = useState<DocFilters>(EMPTY_FILTERS);
  // A different family (invoices → orders) starts with clean filters.
  useEffect(() => setValue(EMPTY_FILTERS), [kind]);
  const set = <K extends keyof DocFilters>(k: K, v: DocFilters[K]) => setValue((f) => ({ ...f, [k]: v }));
  const active = value.q !== "" || value.status !== "all";
  return { value, set, reset: () => setValue(EMPTY_FILTERS), active };
}
type DocFiltersApi = ReturnType<typeof useDocumentFilters>;

// The status key a document is filtered by: invoices by payment state, orders
// by MK's fulfilment status, anything else by its raw status text.
function statusKey(d: DocSummary): string {
  if (isBillKind(d.kind)) return d.payment ?? "na";
  return (d.statusDesc || d.statusCode || "").toLowerCase() || "unknown";
}

function statusLabel(kind: DocKind, key: string): string {
  if (isBillKind(kind)) return key === "na" ? "Nothing due" : (PAYMENT_META[key as PaymentState]?.label ?? key);
  if (kind === "order" && ORDER_STATUS_META[key]) return ORDER_STATUS_META[key].label;
  const pretty = key.replace(/_/g, " ");
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

function applyDocumentFilters(items: DocSummary[], f: DocFilters): DocSummary[] {
  const q = f.q.trim().toLowerCase();
  return items.filter((d) => {
    if (q && !`${d.countCode} ${d.title ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.status !== "all" && statusKey(d) !== f.status) return false;
    return true;
  });
}

// ── sorting ──────────────────────────────────────────────────────────────────

type SortCol = "doc" | "issued" | "due" | "items" | "amount";
type DocSort = { col: SortCol; dir: "asc" | "desc" };
const DEFAULT_SORT: DocSort = { col: "issued", dir: "desc" };

function useDocumentSort(kind: DocKind) {
  const [value, setValue] = useState<DocSort>(DEFAULT_SORT);
  useEffect(() => setValue(DEFAULT_SORT), [kind]);
  // First click sorts the way people expect for that column (newest / largest
  // first for dates and numbers, A→Z for the number), second click flips it.
  const toggle = (col: SortCol) =>
    setValue((v) =>
      v.col === col ? { col, dir: v.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "doc" ? "asc" : "desc" },
    );
  return { value, toggle };
}
type DocSortApi = ReturnType<typeof useDocumentSort>;

function sortDocuments(items: DocSummary[], sort: DocSort): DocSummary[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const num = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? Number.NEGATIVE_INFINITY : v);
  const cmp = (a: DocSummary, b: DocSummary): number => {
    switch (sort.col) {
      case "doc":
        return a.countCode.localeCompare(b.countCode, undefined, { numeric: true });
      case "issued":
        return (a.docDate ?? "").localeCompare(b.docDate ?? "");
      case "due":
        return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
      case "items":
        return num(a.itemCount) - num(b.itemCount);
      case "amount":
        return num(toNum(a.sumAll)) - num(toNum(b.sumAll));
    }
  };
  return [...items].sort((a, b) => cmp(a, b) * dir);
}

function SortHeader({
  col,
  sort,
  align = "left",
  children,
}: {
  col: SortCol;
  sort: DocSortApi;
  align?: "left" | "center" | "right";
  children: React.ReactNode;
}) {
  const active = sort.value.col === col;
  const Icon = !active ? ArrowUpDown : sort.value.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => sort.toggle(col)}
      aria-sort={active ? (sort.value.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "group/sort inline-flex items-center gap-1 h-full min-w-0 uppercase tracking-wide transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground",
        align === "center" && "justify-center",
        align === "right" && "justify-end",
        active && "text-foreground",
      )}
    >
      <span className="truncate">{children}</span>
      <Icon
        className={cn(
          "h-3 w-3 shrink-0 transition-opacity",
          active ? "opacity-100 text-teal-500" : "opacity-0 group-hover/sort:opacity-60",
        )}
      />
    </button>
  );
}

// The "Status" heading doubles as the status filter (shared HeaderFilter look),
// listing only the statuses present, with counts.
function StatusHeader({ kind, items, filters }: { kind: DocKind; items: DocSummary[]; filters: DocFiltersApi }) {
  const statuses = useMemo(() => {
    const seen = new Map<string, number>();
    for (const d of items) seen.set(statusKey(d), (seen.get(statusKey(d)) ?? 0) + 1);
    return Array.from(seen.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);
  return (
    <div className="min-w-0 flex items-center">
      <HeaderFilter
        label="Status"
        value={filters.value.status}
        onChange={(v) => filters.set("status", v)}
        options={statuses.map(([key, n]) => ({ value: key, label: statusLabel(kind, key), count: n }))}
      />
    </div>
  );
}

function usePaging(count: number, resetKey: unknown) {
  const [page, setPage] = useState(1);
  // Any filter change (or a new list) jumps back to the first page.
  useEffect(() => setPage(1), [resetKey]);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const current = Math.min(page, pages);
  return { page: current, pages, start: (current - 1) * PAGE_SIZE, setPage };
}
type Paging = ReturnType<typeof usePaging>;

function DocumentFilterBar({
  kind,
  items,
  filters,
  shown,
}: {
  kind: DocKind;
  items: DocSummary[];
  filters: DocFiltersApi;
  shown: number;
}) {
  // Search + count only; the status filter sits in the table header.
  const f = filters.value;
  const noun = DOC_KIND_LABELS[kind].plural.toLowerCase();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // "/" focuses the search from anywhere on the page; Esc clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searching = f.q.trim().length > 0;

  return (
    <div className="px-3 py-2.5 border-b border-border/60 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-96">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          placeholder={`Search ${noun} by number, product or reference…`}
          value={f.q}
          onChange={(e) => filters.set("q", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              filters.set("q", "");
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={`Search ${noun}`}
          className="h-9 w-full rounded-lg bg-background pl-9 pr-16 text-[13px] shadow-none focus-visible:ring-2"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searching ? (
            <button
              type="button"
              onClick={() => {
                filters.set("q", "");
                inputRef.current?.focus();
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted/60 px-1.5 font-mono text-[10px] text-muted-foreground" title="Press / to search">
              /
            </kbd>
          )}
        </div>
      </div>

      {filters.active && !searching && (
        <button
          type="button"
          onClick={filters.reset}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" /> Clear filters
        </button>
      )}

      <p className="ml-auto text-[12px] text-muted-foreground tabular-nums">
        {searching ? (
          <>
            <span className="font-semibold text-foreground">{shown}</span> {shown === 1 ? "result" : "results"} for <span className="text-foreground">&ldquo;{f.q.trim()}&rdquo;</span>
          </>
        ) : filters.active ? (
          <>
            <span className="font-semibold text-foreground">{shown}</span> of {items.length} {noun}
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground">{items.length}</span> {noun}
          </>
        )}
      </p>
    </div>
  );
}

// Footer under the table: "1–25 of 132" + prev / next. Hidden when the
// (filtered) list fits on one page so a short list stays a plain table.
function Pager({ total, paging, noun }: { total: number; paging: Paging; noun: string }) {
  if (total <= PAGE_SIZE) return null;
  const from = paging.start + 1;
  const to = Math.min(total, paging.start + PAGE_SIZE);
  const btn =
    "inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border/60 bg-muted/20">
      <p className="text-[12px] text-muted-foreground tabular-nums">
        {from}–{to} of {total} {noun}
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={paging.page <= 1} onClick={() => paging.setPage(paging.page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </button>
        <span className="text-[12px] text-muted-foreground tabular-nums px-1.5">
          Page {paging.page} of {paging.pages}
        </span>
        <button
          type="button"
          className={btn}
          disabled={paging.page >= paging.pages}
          onClick={() => paging.setPage(paging.page + 1)}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// Overview strip above a bill list: total invoiced, paid, and outstanding
// (with unpaid / overdue counts). Money tiles only render when every bill
// shares one currency; otherwise counts are shown to avoid summing across
// currencies. Credit notes are the mirror image — the amount credited, how
// much of it has been refunded, and what is still open.
// The orders' twin of BillSummary: how many, how many items, how much.
function OrderSummaryStrip({ items }: { items: DocSummary[] }) {
  if (items.length === 0) return null;
  const currencies = Array.from(new Set(items.map((d) => d.currency).filter(Boolean)));
  const singleCurrency = currencies.length === 1 ? (currencies[0] as string) : undefined;
  const value = items.reduce((n, d) => n + amt(d.sumAll), 0);
  const lines = items.reduce((n, d) => n + (d.itemCount ?? 0), 0);
  const invoiced = items.filter((d) => (d.statusDesc ?? "").toLowerCase().includes("invoic") || (d.statusDesc ?? "").toLowerCase().includes("račun")).length;
  const money = (n: number) => (singleCurrency ? fmtMoney(n.toFixed(2), singleCurrency) : `${n.toFixed(2)}`);
  return (
    <div className="grid grid-cols-3 rounded-2xl border border-border bg-surface overflow-hidden divide-x divide-border/60">
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground">Orders</p>
        <p className="text-[15px] font-bold text-foreground tabular-nums mt-0.5">{items.length}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{invoiced} invoiced</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground">Items</p>
        <p className="text-[15px] font-bold text-foreground tabular-nums mt-0.5">{lines}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">product lines</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground">Ordered value</p>
        <p className="text-[15px] font-bold text-foreground tabular-nums mt-0.5">{money(value)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{singleCurrency ?? "mixed currencies"}</p>
      </div>
    </div>
  );
}

function BillSummary({ kind, items }: { kind: DocKind; items: DocSummary[] }) {
  if (items.length === 0) return null;
  const credit = kind === "credit-note";
  const currencies = Array.from(new Set(items.map((d) => d.currency).filter(Boolean)));
  const singleCurrency = currencies.length === 1 ? (currencies[0] as string) : undefined;

  let invoiced = 0;
  let paid = 0;
  let outstanding = 0;
  let unpaidCount = 0;
  let overdueCount = 0;
  for (const d of items) {
    invoiced += amt(d.sumAll);
    paid += amt(d.sumPaid);
    const rem = Math.max(0, amt(d.sumAll) - amt(d.sumPaid));
    if (d.payment && d.payment !== "paid" && d.payment !== "na") {
      unpaidCount += 1;
      outstanding += rem;
      if (d.payment === "overdue") overdueCount += 1;
    }
  }

  const money = (n: number) => (singleCurrency ? fmtMoney(n.toFixed(2), singleCurrency) : `${n.toFixed(2)}`);

  return (
    <div className="grid grid-cols-3 rounded-2xl border border-border bg-surface overflow-hidden divide-x divide-border/60">
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground">{credit ? "Credited" : "Invoiced"}</p>
        <p className="text-[15px] font-bold text-foreground tabular-nums mt-0.5">{money(invoiced)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{items.length} total</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground">{credit ? "Refunded" : "Paid"}</p>
        <p className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">{money(paid)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{items.length - unpaidCount} settled</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground">{credit ? "Open" : "Outstanding"}</p>
        <p
          className={cn(
            "text-[15px] font-bold tabular-nums mt-0.5",
            outstanding <= 0.005
              ? "text-emerald-600 dark:text-emerald-400"
              : overdueCount > 0
                ? "text-rose-600 dark:text-rose-400"
                : "text-amber-600 dark:text-amber-400",
          )}
        >
          {money(outstanding)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {unpaidCount} {credit ? "open" : "unpaid"}{overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}
        </p>
      </div>
    </div>
  );
}

// ── detail ───────────────────────────────────────────────────────────────────

// Net line total = quantity × unit price × (1 − discount%). Matches the "Total"
// column MK shows per line.
function lineTotal(l: DocLine): string | undefined {
  const qty = toNum(l.amount);
  const unit = toNum(l.price ?? l.priceWithTax);
  if (qty === undefined || unit === undefined) return undefined;
  const disc = toNum(l.discount) ?? 0;
  return (qty * unit * (1 - disc / 100)).toFixed(2);
}

// Tiny product thumbnail resolved from the product catalogue (by SKU/code) via
// our server proxy. Shipping/freight lines get a truck icon; products with an
// image open a full-screen lightbox on click; otherwise a placeholder is shown.
// Results are cached per code for the session.
const productImgCache = new Map<string, string | null>();

function isShippingCode(code?: string): boolean {
  return !!code && /shipping|freight|postnina|dostav/i.test(code);
}

function ProductThumb({ code, name }: { code?: string; name?: string }) {
  const shipping = isShippingCode(code) || isShippingCode(name);
  const [src, setSrc] = useState<string | null>(
    code && productImgCache.has(code) ? productImgCache.get(code)! : null,
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shipping || !code || productImgCache.has(code)) return;
    let cancelled = false;
    fetch(`/api/portal/product-image?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((b) => {
        const url = typeof b?.image === "string" ? b.image : null;
        productImgCache.set(code, url);
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        productImgCache.set(code, null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, shipping]);

  if (shipping) {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 shrink-0 border border-border/60">
        <Truck className="h-5 w-5 text-sky-500" />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => src && setOpen(true)}
        disabled={!src}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg bg-muted overflow-hidden shrink-0 border border-border/60",
          src ? "cursor-zoom-in hover:opacity-90 transition-opacity" : "cursor-default",
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="h-full w-full object-contain"
            onError={() => {
              if (code) productImgCache.set(code, null);
              setSrc(null);
            }}
          />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
        )}
      </button>

      {open && src && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={name ?? ""} className="max-h-[82vh] max-w-[88vw] object-contain rounded-xl shadow-2xl" />
            {name && <p className="text-[13px] text-white/80">{name}</p>}
          </div>
        </div>
      )}
    </>
  );
}

// Friendly label + icon for a raw MK doc_type (used by "related documents").
// Order matters — the more specific patterns must come first.
const DOC_TYPE_META: { test: RegExp; label: string; icon: React.ElementType }[] = [
  { test: /credit_note/, label: "Credit note", icon: FileMinus },
  { test: /offer/, label: "Offer", icon: FileText },
  { test: /bill/, label: "Invoice", icon: ReceiptText },
  { test: /transfer/, label: "Transfer order", icon: ArrowLeftRight },
  { test: /workorder/, label: "Work order", icon: Wrench },
  { test: /warehouse|acceptance|packing/, label: "Warehouse doc", icon: Package },
  { test: /order/, label: "Order", icon: ClipboardList },
];

function docTypeMeta(docType: string): { label: string; Icon: React.ElementType } {
  for (const m of DOC_TYPE_META) {
    if (m.test.test(docType)) return { label: m.label, Icon: m.icon };
  }
  const label = docType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { label: label || "Document", Icon: FileText };
}

function TotalRow({ label, value, strong }: { label: string; value?: string | null; strong?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className={cn("text-[12px]", strong ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={cn("tabular-nums text-right", strong ? "text-[13px] font-semibold text-foreground" : "text-[13px] font-medium text-foreground")}>
        {value}
      </span>
    </div>
  );
}

// Bill payment breakdown: paid so far, remaining balance, and the due date
// (or the settled date once fully paid). On a credit note the "payment" is the
// refund owed to the customer, so the labels flip accordingly.
function PaymentPanel({ detail }: { detail: DocDetail }) {
  const credit = detail.kind === "credit-note";
  const remaining = Math.max(0, amt(detail.sumAll) - amt(detail.sumPaid));
  const fully = remaining <= 0.005;
  const overdue = detail.payment === "overdue";
  const c = detail.currency;
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-foreground">{credit ? "Refund" : "Payment"}</span>
        <PaymentBadge state={detail.payment} />
      </div>
      <div className="grid grid-cols-3 divide-x divide-border/50">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">{credit ? "Refunded" : "Paid"}</p>
          <p className="text-[15px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
            {fmtMoney(detail.sumPaid ?? "0", c)}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Remaining</p>
          <p
            className={cn(
              "text-[15px] font-semibold tabular-nums mt-0.5",
              fully
                ? "text-emerald-600 dark:text-emerald-400"
                : overdue
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-amber-600 dark:text-amber-400",
            )}
          >
            {fmtMoney(remaining.toFixed(2), c)}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">{fully ? (credit ? "Refunded on" : "Paid on") : "Due date"}</p>
          <p
            className={cn(
              "text-[13px] font-medium mt-1",
              overdue ? "text-rose-600 dark:text-rose-400" : "text-foreground",
            )}
          >
            {fully ? fmtDate(detail.lastPaidDate) : fmtDate(detail.dueDate)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function DocumentDetail({
  detail,
  pdfHref,
  backHref,
  showPartner = false,
  showLinks = true,
  wide = false,
}: {
  detail: DocDetail;
  pdfHref?: string;
  backHref?: string;
  showPartner?: boolean;
  // Related documents (offers, delivery notes, …) are internal — the admin
  // view shows them, the customer portal passes false.
  showLinks?: boolean;
  wide?: boolean;
}) {
  const isBill = isBillKind(detail.kind);
  const isOrder = detail.kind === "order";
  const currency = detail.currency;
  const online = isOnlineOrder(detail);
  const KindIcon = online ? Globe : KIND_ICON[detail.kind];
  const kindLabel = online ? "Online order" : DOC_KIND_LABELS[detail.kind].singular;
  const productCount = detail.lines.filter((l) => !l.isText).length;

  return (
    <div className={cn("px-4 md:px-8 py-6 md:py-8 space-y-3 overflow-y-auto h-full", wide ? "" : "max-w-5xl mx-auto")}>
      {backHref && (
        <Link href={backHref} className="inline-block text-[12px] text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      )}
      {/* One framed document: hero · addresses · lines · totals · payment · notes, rows divided. */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden divide-y divide-border/60">

      {/* Hero */}
      <div className="overflow-hidden">
        <div className="px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <KindIcon className="h-3.5 w-3.5 text-teal-500" /> {kindLabel}
            </div>
            <h1 className="font-display text-xl md:text-2xl font-semibold text-foreground tracking-tight mt-1 break-words">
              {detail.countCode}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Issued {fmtDate(detail.docDate)}
              </span>
              {isBill && detail.dueDate && <span>· Due {fmtDate(detail.dueDate)}</span>}
              {detail.kind === "offer" && detail.validTo && <span>· Valid to {fmtDate(detail.validTo)}</span>}
            </div>
          </div>
          <div className="shrink-0">
            {isBill ? (
              <PaymentBadge state={detail.payment} />
            ) : detail.kind === "order" ? (
              <OrderStatusPill d={detail} />
            ) : (
              <StatusPill label={detail.statusDesc || detail.statusCode} />
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border/60 bg-muted/20 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground tabular-nums leading-none mt-0.5">
              {fmtMoney(detail.sumAll, currency)}
            </p>
          </div>
          {pdfHref && (
            <a
              href={pdfHref}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-500 text-white px-3.5 py-2 text-[12px] font-semibold hover:bg-teal-600 transition-colors shrink-0"
            >
              <Download className="h-3.5 w-3.5" /> Download PDF
            </a>
          )}
        </div>
      </div>

      {showPartner && detail.partner && (
        <div className="px-4 py-3 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Customer</p>
            <p className="text-[13px] font-semibold text-foreground truncate">{detail.partner.name}</p>
            {detail.partner.taxId && <p className="text-[11px] text-muted-foreground">{detail.partner.taxId}</p>}
          </div>
        </div>
      )}

      {/* Billing + delivery addresses (bills and orders) */}
      {(isBill || isOrder) && detail.partner && <AddressesCard detail={detail} />}

      {/* Line items */}
      {detail.lines.length > 0 && (
        <div className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-foreground">Products</span>
            <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
              {productCount}
            </span>
          </div>
          {/* Column header — right-side columns line up with the product rows. */}
          <div className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/40">
            <span className="flex-1 min-w-0">Product</span>
            <span className="hidden sm:block w-16 text-right shrink-0">Qty</span>
            {isOrder && <span className="hidden sm:block w-16 text-right shrink-0">Shipped</span>}
            <span className="hidden sm:block w-24 text-right shrink-0">Price</span>
            <span className="hidden sm:block w-14 text-right shrink-0">Disc</span>
            <span className="w-24 text-right shrink-0">Total</span>
          </div>
          <div className="divide-y divide-border/50">
            {detail.lines.map((l, i) => {
              // Descriptive/text line — render as a section header, not a product.
              if (l.isText) {
                if (!l.name) return null;
                return (
                  <div key={i} className="px-4 py-2 bg-muted/25">
                    <p className="text-[12px] font-semibold text-muted-foreground">{l.name}</p>
                  </div>
                );
              }
              const disc = toNum(l.discount) ?? 0;
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <ProductThumb code={l.code} name={l.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-foreground truncate">{l.name || l.code || "—"}</p>
                    {l.code && l.name && <p className="text-[11px] text-muted-foreground truncate">{l.code}</p>}
                    {/* On mobile the qty/price/disc columns are hidden — show them inline. */}
                    <p className="sm:hidden text-[11px] text-muted-foreground mt-0.5">
                      {l.amount ?? "—"}
                      {l.unit ? ` ${l.unit}` : ""} × {fmtMoney(l.price ?? l.priceWithTax, currency)}
                      {disc > 0 ? ` · −${disc}%` : ""}
                      {isOrder && l.shipped !== undefined && (
                        <>
                          {" · "}
                          <ShippedQty line={l} />
                          {" shipped"}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="hidden sm:block w-16 text-right text-[12px] text-muted-foreground tabular-nums shrink-0">
                    {l.amount ?? "—"}
                    {l.unit ? ` ${l.unit}` : ""}
                  </span>
                  {isOrder && (
                    <span className="hidden sm:block w-16 text-right text-[12px] tabular-nums shrink-0">
                      <ShippedQty line={l} />
                    </span>
                  )}
                  <span className="hidden sm:block w-24 text-right text-[12px] text-muted-foreground tabular-nums shrink-0">
                    {fmtMoney(l.price ?? l.priceWithTax, currency)}
                  </span>
                  <span className="hidden sm:block w-14 text-right text-[12px] tabular-nums shrink-0">
                    {disc > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">−{disc}%</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </span>
                  <span className="w-24 text-right text-[13px] font-medium text-foreground tabular-nums shrink-0">
                    {fmtMoney(lineTotal(l), currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="px-4 py-3">
        <TotalRow label="Subtotal" value={detail.sumBasic ? fmtMoney(detail.sumBasic, currency) : undefined} />
        <TotalRow
          label="Discount"
          value={detail.sumDiscount && detail.sumDiscount !== "0" ? fmtMoney(detail.sumDiscount, currency) : undefined}
        />
        <TotalRow
          label="Tax"
          value={detail.sumTax && detail.sumTax !== "0.00" ? fmtMoney(detail.sumTax, currency) : undefined}
        />
        <div className="border-t border-border/60 mt-1.5 pt-2">
          <TotalRow label="Total" value={fmtMoney(detail.sumAll, currency)} strong />
        </div>
      </div>

      {/* Payment (bills) */}
      {isBill && <PaymentPanel detail={detail} />}

      {/* Additional instructions (MK notes_header; rendered HTML, sanitized server-side) */}
      {detail.notes && (
        <div className="px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Additional instructions</p>
          <div className="doc-notes" dangerouslySetInnerHTML={{ __html: detail.notes }} />
        </div>
      )}

      {/* Related documents — typed; team-only */}
      {showLinks && detail.links.length > 0 && (
        <div className="px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Related documents</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {detail.links.map((l) => {
              const { label, Icon } = docTypeMeta(l.docType);
              return (
                <div
                  key={l.mkId}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/20 px-3 py-2"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 shrink-0">
                    <Icon className="h-4 w-4 text-teal-500" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="text-[12px] font-medium text-foreground truncate">{l.countCode || l.mkId}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// Shipped quantity for an order line, coloured by fulfilment: all shipped →
// green, some → amber, none → dimmed. Falls back to "—" when unknown.
function ShippedQty({ line }: { line: DocLine }) {
  if (line.shipped === undefined) return <span className="text-muted-foreground/40">—</span>;
  const shipped = toNum(line.shipped) ?? 0;
  const ordered = toNum(line.amount) ?? 0;
  const tone =
    shipped <= 0
      ? "text-muted-foreground/60"
      : shipped >= ordered
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-amber-600 dark:text-amber-400";
  return (
    <span className={cn("font-medium", tone)}>
      {line.shipped}
      {line.unit ? ` ${line.unit}` : ""}
    </span>
  );
}

// One postal address as MK printed it on the document. Lines are skipped when
// the partner record lacks them, so a name-only receiver still renders.
function AddressBlock({ label, party, note }: { label: string; party: MkPartnerRef; note?: string }) {
  const cityLine = [party.postNumber, party.city].filter(Boolean).join(" ");
  const country = party.country
    ? `${party.country}${party.countryIso ? ` (${party.countryIso})` : ""}`
    : party.countryIso;
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-[13px] font-semibold text-foreground mt-0.5 break-words">{party.name || "—"}</p>
      <div className="text-[12px] text-muted-foreground leading-snug mt-0.5 break-words">
        {party.street && <p>{party.street}</p>}
        {cityLine && <p>{cityLine}</p>}
        {country && <p>{country}</p>}
        {party.taxId && <p className="mt-1 text-[11px]">VAT {party.taxId}</p>}
        {(party.email || party.phone) && (
          <p className="mt-1 text-[11px]">{[party.email, party.phone].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      {note && <p className="text-[11px] italic text-muted-foreground/70 mt-1">{note}</p>}
    </div>
  );
}

// Billing + delivery addresses. MK's `partner` is the billing party; `receiver`
// is set only when goods go somewhere else, so its absence means "same".
function AddressesCard({ detail }: { detail: DocDetail }) {
  const billing = detail.partner!;
  const delivery = detail.receiver ?? billing;
  const same = !detail.receiver;
  return (
    <div className="overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 bg-muted/20 flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[12px] font-semibold text-foreground">Addresses</span>
        {detail.deliveryType && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Truck className="h-3.5 w-3.5" /> {detail.deliveryType}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
        <div className="px-4 py-3">
          <AddressBlock label="Billing address" party={billing} />
        </div>
        <div className="px-4 py-3">
          <AddressBlock label="Delivery address" party={delivery} note={same ? "Same as billing address" : undefined} />
        </div>
      </div>
    </div>
  );
}

// ── skeleton twins ───────────────────────────────────────────────────────────
// Structural copies of DocumentList / DocumentDetail. The card chrome, column
// headers and section labels are static and render for real; only the document
// data shimmers. Used by both the in-component loading state and the route-level
// loading.tsx files (portal + admin), so the list and detail pages never change
// shape between "loading" and "loaded".

export function DocumentListSkeleton({ kind, rows = 8 }: { kind: DocKind; rows?: number }) {
  const isBill = isBillKind(kind);
  return (
    <div className="space-y-4">
      {isBill && (
        <div className="grid grid-cols-3 rounded-2xl border border-border bg-surface overflow-hidden divide-x divide-border/60">
          {["Invoiced", "Paid", "Outstanding"].map((label, i) => (
            <div key={label} className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              {/* text-[15px] → 22.5px; text-[10px] → 15px */}
              <SkeletonLine lh="h-[22.5px]" h="h-4" w="w-24" className="mt-0.5" delay={stagger(i, 60)} />
              <SkeletonLine lh="h-[15px]" h="h-2.5" w="w-14" className="mt-0.5" delay={stagger(i, 60, 30)} />
            </div>
          ))}
        </div>
      )}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        {/* Toolbar — search, status, amount range, count (all h-8). */}
        <div className="px-3 py-2.5 border-b border-border/60 flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-full sm:w-56 rounded-md" delay={0} />
          <SkeletonLine lh="h-[18px]" h="h-3" w="w-20" className="ml-auto" delay={120} />
        </div>
        <div className={cn(gridCols(kind), "hidden md:grid px-4 h-9 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-muted/25")}>
          <span className="self-center">{DOC_KIND_LABELS[kind].singular}</span>
          <span className="self-center">Issued</span>
          {isBill && <span className="self-center">Due</span>}
          <span className="self-center text-center">Items</span>
          <span className="self-center">Status</span>
          <span className="self-center text-right">Amount</span>
        </div>
        <div className="divide-y divide-border/50">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className={cn(gridCols(kind), "px-4 py-3")}>
              <div className="min-w-0">
                {/* text-[13px] → 19.5px; text-[11px] → 16.5px */}
                <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-28" delay={stagger(i)} />
                <SkeletonLine lh="h-[16.5px]" h="h-2.5" w={["w-40", "w-24", "w-48", "w-32"][i % 4]} className="mt-0.5" delay={stagger(i, 80, 20)} />
                <div className="md:hidden mt-1.5"><Skeleton className="h-[20.5px] w-16 rounded-full" delay={stagger(i, 80, 60)} /></div>
              </div>
              <div className="hidden md:block"><SkeletonLine lh="h-[19.5px]" h="h-3" w="w-24" delay={stagger(i, 80, 30)} /></div>
              {isBill && (
                <div className="hidden md:block">
                  {/* text-[15px] leading-tight → 18px; text-[11px] → 14px */}
                  <SkeletonLine lh="h-[18px]" h="h-3.5" w="w-28" delay={stagger(i, 80, 40)} />
                  <SkeletonLine lh="h-[14px]" h="h-2.5" w="w-20" className="mt-0.5" delay={stagger(i, 80, 50)} />
                </div>
              )}
              <div className="hidden md:flex justify-center"><SkeletonLine lh="h-[19.5px]" w="w-5" delay={stagger(i, 80, 40)} /></div>
              <div className="hidden md:flex items-center"><Skeleton className="h-[20.5px] w-16 rounded-full" delay={stagger(i, 80, 60)} /></div>
              <div className="flex justify-end self-start md:self-center"><SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-20" delay={stagger(i, 80, 80)} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DocumentDetailSkeleton({
  kind,
  showPartner = false,
  wide = false,
  lines = 4,
}: {
  kind: DocKind;
  showPartner?: boolean;
  wide?: boolean;
  lines?: number;
}) {
  const isBill = isBillKind(kind);
  const isOrder = kind === "order";
  const KindIcon = KIND_ICON[kind];
  const kindLabel = DOC_KIND_LABELS[kind].singular;
  return (
    <div className={cn("px-4 md:px-8 py-6 md:py-8 space-y-4 overflow-y-auto h-full", wide ? "" : "max-w-5xl mx-auto")}>
      <span className="inline-block text-[12px] text-muted-foreground">← Back</span>

      {/* Hero */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <KindIcon className="h-3.5 w-3.5 text-teal-500" /> {kindLabel}
            </div>
            {/* text-xl md:text-2xl → 28px / 32px line box */}
            <SkeletonLine lh="h-7 md:h-8" h="h-5 md:h-6" w="w-40" className="mt-1" delay={40} />
            <div className="mt-2 flex items-center gap-x-3">
              <SkeletonLine lh="h-[18px]" w="w-32" delay={80} />
              {isBill && <SkeletonLine lh="h-[18px]" w="w-24" delay={100} />}
            </div>
          </div>
          <Skeleton className="h-[20.5px] w-16 rounded-full shrink-0" delay={60} />
        </div>
        <div className="px-5 py-3 border-t border-border/60 bg-muted/20 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-muted-foreground">Total</p>
            {/* text-2xl leading-none → 24px */}
            <Skeleton className="h-6 w-28 mt-0.5 rounded-md" delay={120} />
          </div>
          <Skeleton className="h-[34px] w-[130px] rounded-xl shrink-0" delay={140} />
        </div>
      </div>

      {showPartner && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-3 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Customer</p>
            <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-48" delay={160} />
            <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-24" delay={180} />
          </div>
        </div>
      )}

      {/* Addresses (bills and orders) */}
      {(isBill || isOrder) && (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30 flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-teal-500" />
            <span className="text-[12px] font-semibold text-foreground">Addresses</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
            {["Billing address", "Delivery address"].map((label, i) => (
              <div key={label} className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-44" className="mt-0.5" delay={stagger(i, 40, 180)} />
                <SkeletonLine lh="h-[17px]" h="h-2.5" w="w-36" className="mt-0.5" delay={stagger(i, 40, 200)} />
                <SkeletonLine lh="h-[17px]" h="h-2.5" w="w-28" delay={stagger(i, 40, 220)} />
                <SkeletonLine lh="h-[17px]" h="h-2.5" w="w-20" delay={stagger(i, 40, 240)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Line items */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-foreground">Products</span>
          <Skeleton className="h-[20.5px] w-7 rounded-full" delay={200} />
        </div>
        <div className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/40">
          <span className="flex-1 min-w-0">Product</span>
          <span className="hidden sm:block w-16 text-right shrink-0">Qty</span>
          {isOrder && <span className="hidden sm:block w-16 text-right shrink-0">Shipped</span>}
          <span className="hidden sm:block w-24 text-right shrink-0">Price</span>
          <span className="hidden sm:block w-14 text-right shrink-0">Disc</span>
          <span className="w-24 text-right shrink-0">Total</span>
        </div>
        <div className="divide-y divide-border/50">
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <Skeleton className="h-10 w-10 rounded-lg shrink-0" delay={stagger(i, 60, 220)} />
              <div className="min-w-0 flex-1">
                <SkeletonLine lh="h-[19.5px]" h="h-3.5" w={["w-56", "w-40", "w-64", "w-48"][i % 4]} delay={stagger(i, 60, 240)} />
                <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-20" delay={stagger(i, 60, 260)} />
                <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-32" className="sm:hidden mt-0.5" delay={stagger(i, 60, 260)} />
              </div>
              <div className="hidden sm:flex w-16 justify-end shrink-0"><SkeletonLine lh="h-[18px]" w="w-8" delay={stagger(i, 60, 280)} /></div>
              {isOrder && (
                <div className="hidden sm:flex w-16 justify-end shrink-0"><SkeletonLine lh="h-[18px]" w="w-8" delay={stagger(i, 60, 290)} /></div>
              )}
              <div className="hidden sm:flex w-24 justify-end shrink-0"><SkeletonLine lh="h-[18px]" w="w-16" delay={stagger(i, 60, 300)} /></div>
              <div className="hidden sm:flex w-14 justify-end shrink-0"><SkeletonLine lh="h-[18px]" w="w-4" delay={stagger(i, 60, 320)} /></div>
              <div className="flex w-24 justify-end shrink-0"><SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-16" delay={stagger(i, 60, 340)} /></div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="rounded-2xl border border-border bg-surface px-4 py-3">
        {["Subtotal", "Tax"].map((label, i) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-1">
            <span className="text-[12px] text-muted-foreground">{label}</span>
            <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-20" delay={stagger(i, 60, 400)} />
          </div>
        ))}
        <div className="border-t border-border/60 mt-1.5 pt-2">
          <div className="flex items-baseline justify-between gap-4 py-1">
            <span className="text-[12px] font-semibold text-foreground">Total</span>
            <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-24" delay={520} />
          </div>
        </div>
      </div>

      {/* Payment (bills) */}
      {isBill && (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-foreground">Payment</span>
            <Skeleton className="h-[20.5px] w-16 rounded-full" delay={540} />
          </div>
          <div className="grid grid-cols-3 divide-x divide-border/50">
            {["Paid", "Remaining", "Due date"].map((label, i) => (
              <div key={label} className="px-4 py-3">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <SkeletonLine lh="h-[22.5px]" h="h-4" w="w-20" className="mt-0.5" delay={stagger(i, 60, 560)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
