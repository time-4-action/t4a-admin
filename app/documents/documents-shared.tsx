"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Download,
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
  X,
} from "lucide-react";
import type {
  DocDetail,
  DocKind,
  DocLine,
  DocSummary,
  PaymentState,
} from "@/types/documents";

// Presentational + data building blocks shared by the customer B2B portal and
// the admin "Documents" browse tool. The only thing that differs between the two
// surfaces is the API/href base — everything visual lives here.

// ── formatting ───────────────────────────────────────────────────────────────

export function fmtMoney(amount?: string, currency?: string): string {
  if (amount === undefined) return "—";
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
  const isInvoice = kind === "invoice";

  if (state.status === "loading") {
    return (
      <div className="divide-y divide-border/50 rounded-2xl border border-border bg-surface overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="skeleton h-4 w-28 rounded" />
            <div className="skeleton h-4 w-24 rounded" />
            <div className="ml-auto skeleton h-4 w-20 rounded" />
          </div>
        ))}
      </div>
    );
  }

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
        <p className="mt-3 text-[13px] text-muted-foreground">No {kind}s yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isInvoice && <InvoiceSummary items={state.items} />}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        {/* Column header — widths match the rows below so they line up. */}
        <div className="flex items-center gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-muted/25">
          <span className="flex-1 min-w-0">Document</span>
          <span className="hidden sm:block w-16 text-center">Products</span>
          <span className="w-44 text-right">Status</span>
          <span className="w-28 text-right">Amount</span>
        </div>
        <div className="divide-y divide-border/50">
          {state.items.map((d) => {
            const remaining = isInvoice ? amt(d.sumAll) - amt(d.sumPaid) : 0;
            const showDue = isInvoice && d.payment && d.payment !== "na" && d.payment !== "paid" && remaining > 0.005;
            const fresh = isNewOrder(d);
            return (
              <Link
                key={d.mkId}
                href={`${hrefBase}/${encodeURIComponent(d.mkId)}`}
                className={cn(
                  "group flex items-center gap-4 px-4 py-3.5 transition-colors focus-visible:outline-none",
                  fresh
                    ? "bg-lime-500/[0.07] hover:bg-lime-500/[0.12] focus-visible:bg-lime-500/[0.12]"
                    : "hover:bg-muted/40 focus-visible:bg-muted/40",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate group-hover:underline">
                    {d.countCode}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {fmtDate(d.docDate)}
                    {isInvoice && d.dueDate ? ` · due ${fmtDate(d.dueDate)}` : ""}
                    {d.title ? ` · ${d.title}` : ""}
                  </p>
                </div>
                <div className="hidden sm:block w-16 text-center shrink-0 text-[13px] text-muted-foreground tabular-nums">
                  {d.itemCount ?? "—"}
                </div>
                <div className="w-44 flex items-center justify-end gap-2 shrink-0">
                  {isInvoice ? (
                    <PaymentBadge state={d.payment} />
                  ) : (
                    <>
                      {isOnlineOrder(d) && <OnlineBadge />}
                      {d.kind === "order" ? (
                        <OrderStatusPill d={d} />
                      ) : (
                        <StatusPill label={d.statusDesc || d.statusCode} />
                      )}
                    </>
                  )}
                </div>
                <div className="w-28 text-right shrink-0">
                  <p className="text-[13px] font-semibold text-foreground tabular-nums">{fmtMoney(d.sumAll, d.currency)}</p>
                  {showDue && (
                    <p
                      className={cn(
                        "text-[11px] tabular-nums",
                        d.payment === "overdue" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {fmtMoney(remaining.toFixed(2), d.currency)} due
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Overview strip above an invoice list: total invoiced, paid, and outstanding
// (with unpaid / overdue counts). Money tiles only render when every invoice
// shares one currency; otherwise counts are shown to avoid summing across
// currencies.
function InvoiceSummary({ items }: { items: DocSummary[] }) {
  if (items.length === 0) return null;
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
        <p className="text-[11px] text-muted-foreground">Invoiced</p>
        <p className="text-[15px] font-bold text-foreground tabular-nums mt-0.5">{money(invoiced)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{items.length} total</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground">Paid</p>
        <p className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">{money(paid)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{items.length - unpaidCount} settled</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground">Outstanding</p>
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
          {unpaidCount} unpaid{overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}
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

// Invoice payment breakdown: paid so far, remaining balance, and the due date
// (or the settled date once fully paid).
function PaymentPanel({ detail }: { detail: DocDetail }) {
  const remaining = Math.max(0, amt(detail.sumAll) - amt(detail.sumPaid));
  const fully = remaining <= 0.005;
  const overdue = detail.payment === "overdue";
  const c = detail.currency;
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-foreground">Payment</span>
        <PaymentBadge state={detail.payment} />
      </div>
      <div className="grid grid-cols-3 divide-x divide-border/50">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Paid</p>
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
          <p className="text-[11px] text-muted-foreground">{fully ? "Paid on" : "Due date"}</p>
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
  wide = false,
}: {
  detail: DocDetail;
  pdfHref?: string;
  backHref?: string;
  showPartner?: boolean;
  wide?: boolean;
}) {
  const isInvoice = detail.kind === "invoice";
  const currency = detail.currency;
  const online = isOnlineOrder(detail);
  const KindIcon = online ? Globe : KIND_ICON[detail.kind];
  const kindLabel = online ? "Online order" : detail.kind.charAt(0).toUpperCase() + detail.kind.slice(1);
  const productCount = detail.lines.filter((l) => !l.isText).length;

  return (
    <div className={cn("px-4 md:px-8 py-6 md:py-8 space-y-4 overflow-y-auto h-full", wide ? "" : "max-w-5xl mx-auto")}>
      {backHref && (
        <Link href={backHref} className="inline-block text-[12px] text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      )}

      {/* Hero */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
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
              {isInvoice && detail.dueDate && <span>· Due {fmtDate(detail.dueDate)}</span>}
              {detail.kind === "offer" && detail.validTo && <span>· Valid to {fmtDate(detail.validTo)}</span>}
            </div>
          </div>
          <div className="shrink-0">
            {isInvoice ? (
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-500 text-white px-3.5 py-2 text-[12px] font-semibold hover:bg-teal-600 transition-colors shrink-0"
            >
              <Download className="h-3.5 w-3.5" /> Download PDF
            </a>
          )}
        </div>
      </div>

      {showPartner && detail.partner && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-3 flex items-center gap-3">
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

      {/* Line items */}
      {detail.lines.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
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
                    </p>
                  </div>
                  <span className="hidden sm:block w-16 text-right text-[12px] text-muted-foreground tabular-nums shrink-0">
                    {l.amount ?? "—"}
                    {l.unit ? ` ${l.unit}` : ""}
                  </span>
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
      <div className="rounded-2xl border border-border bg-surface px-4 py-3">
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

      {/* Payment (invoices) */}
      {isInvoice && <PaymentPanel detail={detail} />}

      {/* Notes (rendered HTML, sanitized server-side) */}
      {detail.notes && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Notes</p>
          <div className="doc-notes" dangerouslySetInnerHTML={{ __html: detail.notes }} />
        </div>
      )}

      {/* Related documents — typed */}
      {detail.links.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
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
  );
}
