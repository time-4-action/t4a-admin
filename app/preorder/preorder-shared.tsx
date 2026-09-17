"use client";
// Shared presentational pieces for the preorder fill experience. Rendered by BOTH the
// partner fill portal (app/portal/preorders/[id]) and the admin review view
// (app/preorder/[id]/submissions/[id]) — the admin passes readOnly + fulfilment columns.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Package,
  Minus,
  Plus,
  Search,
  X,
  ChevronRight,
  ChevronLeft,
  ImageIcon,
  ShoppingCart,
  Check,
  Eye,
  Send,
  Loader2,
  Percent,
  ArrowLeft,
  Building2,
  User,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import {
  rowUnitPrice,
  computeTabTotals,
  computePricedOrder,
  campaignBasis,
  activeTiers,
  totalsNet,
  totalsDiscount,
  CUSTOMER_KIND_LABELS,
  type PreorderCampaign,
  type PreorderSubmissionTotals,
  type PreorderTab,
  type PreorderRow,
  type PreorderTerms,
  type PricingContext,
  type PriceBasis,
} from "@/types/preorder";
import { fmtVatRate, vatIsMissing, type OrderVatTotals } from "@/lib/pricing";

export function fmtMoney(amount: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

type QtyMap = Record<string, number>;

// Per-tab item counts for the tab bar.
export function TabBar({
  tabs,
  activeId,
  onSelect,
  quantities,
}: {
  tabs: PreorderTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  quantities: QtyMap;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
      {tabs.map((t) => {
        const active = t.id === activeId;
        const count = t.groups.reduce(
          (n, g) => n + g.rows.reduce((m, r) => m + (quantities[r.id] || 0), 0),
          0,
        );
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all",
              active
                ? "bg-lime-600 text-white shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.name || "Tab"}
            {count > 0 && (
              <span
                className={cn(
                  "text-[10px] tabular-nums rounded-full px-1.5 py-0.5 leading-none font-semibold",
                  active ? "bg-white/25 text-white" : "bg-lime-600 text-white",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Full-screen image lightbox (mirrors the documents view). Click backdrop / X to close.
export function ImageLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt ?? ""} className="max-h-[82vh] max-w-[88vw] object-contain rounded-xl shadow-2xl" />
        {alt && <p className="text-[13px] text-white/80">{alt}</p>}
      </div>
    </div>
  );
}

// A thumbnail that opens the lightbox on click when it has an image.
function Zoomable({ src, alt, className }: { src?: string | null; alt?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!src) {
    return (
      <span className={cn("bg-muted flex items-center justify-center shrink-0", className)}>
        <Package className="w-3.5 h-3.5 text-muted-foreground" />
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn("overflow-hidden shrink-0 cursor-zoom-in hover:opacity-90 transition-opacity", className)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt ?? ""} className="w-full h-full object-cover" />
      </button>
      {open && <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function RowThumb({ row }: { row: PreorderRow }) {
  return <Zoomable src={row.image} alt={row.name} className="w-8 h-8 rounded ring-1 ring-border" />;
}

function TagPill({ tag }: { tag?: PreorderRow["tag"] }) {
  if (!tag) return null;
  return (
    <span className="text-[9px] font-bold uppercase text-lime-700 bg-lime-100 dark:bg-lime-900/50 dark:text-lime-300 rounded px-1 shrink-0">
      {tag === "NEW" ? "NEW" : "PRE"}
    </span>
  );
}

// ── Pricing banner ───────────────────────────────────────────────────────────
// Tells the customer how THEY are priced: a company orders at partner prices,
// zero-rated; an individual at the RRP with their country's VAT inside it. When the
// VAT rate is not configured the banner turns amber — the order cannot be submitted.
export function PricingBanner({ pricing, className, bare }: { pricing: PricingContext | null | undefined; className?: string; bare?: boolean }) {
  if (!pricing) return null;
  const missing = vatIsMissing(pricing);
  const company = pricing.kind === "business";
  const Icon = missing ? AlertTriangle : company ? Building2 : User;
  return (
    <div
      className={cn(
        "px-4 py-2.5 flex items-start gap-2.5 text-[12px]",
        !bare && "rounded-xl border",
        missing
          ? cn("text-amber-800 dark:text-amber-300", !bare && "border-amber-300/70 bg-amber-50/70 dark:border-amber-800/60 dark:bg-amber-950/30")
          : cn("text-muted-foreground", !bare && "border-border bg-surface"),
        className,
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0 mt-px", missing ? "text-amber-600" : "text-lime-600")} />
      <div className="min-w-0">
        {missing ? (
          <>
            <span className="font-semibold">VAT rate not configured{pricing.countryIso ? ` for ${pricing.countryIso}` : ""}.</span>{" "}
            Your prices cannot be finalised yet, so the preorder cannot be submitted. Please contact us — you can still save a draft.
          </>
        ) : company ? (
          <>
            <span className="font-semibold text-foreground">You order as a company</span> — partner prices, excl. VAT
            {(pricing.vat.rate ?? 0) > 0
              ? ` — ${fmtVatRate(pricing.vat.rate)} VAT is added to your total.`
              : ` (${fmtVatRate(pricing.vat.rate)}, ${pricing.vat.source === "exempt" ? "VAT exempt" : "zero-rated"}).`}{" "}
            The RRP column is shown for reference.
          </>
        ) : pricing.vat.source === "exempt" ? (
          <>
            <span className="font-semibold text-foreground">You order as an individual</span> — retail prices (RRP), VAT exempt (0%). The partner column is
            shown for reference.
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground">You order as an individual</span> — retail prices (RRP) incl.{" "}
            {fmtVatRate(pricing.vat.rate)} VAT{pricing.countryIso ? ` (${pricing.countryIso})` : ""}. VAT is included in every price shown, never added on
            top. The partner column is shown for reference.
          </>
        )}
      </div>
    </div>
  );
}

// Column captions for the two price columns, highlighting the one the customer pays.
function priceHeader(label: string, sub: string, active: boolean) {
  return (
    <span className={cn("inline-flex flex-col items-end leading-tight", active ? "text-foreground" : "")}>
      <span>{label}</span>
      <span className={cn("text-[9px] normal-case tracking-normal font-medium", active ? "text-lime-700 dark:text-lime-400" : "text-muted-foreground/70")}>
        {active ? `your price · ${sub}` : sub}
      </span>
    </span>
  );
}

// ── Grid (spreadsheet-like) ──────────────────────────────────────────────────
export function PreorderGridTab({
  tab,
  quantities,
  onQty,
  currency,
  readOnly = false,
  onlyFilled = false,
  extraHeader,
  renderExtraCell,
  qtyHeader,
  renderQty,
  pricing,
}: {
  tab: PreorderTab;
  quantities: QtyMap;
  onQty?: (rowId: string, qty: number) => void;
  currency: string;
  readOnly?: boolean;
  onlyFilled?: boolean; // show only rows with qty > 0 (submission review)
  extraHeader?: ReactNode;
  renderExtraCell?: (rowId: string) => ReactNode;
  qtyHeader?: string; // custom Qty column label
  renderQty?: (rowId: string, qty: number) => ReactNode; // custom read-only qty cell
  pricing?: PricingContext | null; // the customer's price basis (campaign.pricing); partner when absent
}) {
  const th = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-2";
  const basis: PriceBasis = pricing?.basis ?? "partner";
  const groups = onlyFilled
    ? tab.groups
        .map((g) => ({ ...g, rows: g.rows.filter((r) => (quantities[r.id] || 0) > 0) }))
        .filter((g) => g.rows.length > 0)
    : tab.groups;
  return (
    <div className="rounded-xl border border-border bg-surface overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-border">
            <th className={cn(th, "text-left pl-4 min-w-[220px]")}>Product</th>
            <th className={cn(th, "text-left")}>SKU</th>
            <th className={cn(th, "text-right")}>{priceHeader("RRP", "incl. VAT", basis === "rrp")}</th>
            <th className={cn(th, "text-right")}>{priceHeader("Partner", "excl. VAT", basis === "partner")}</th>
            <th className={cn(th, "text-right w-28")}>{qtyHeader ?? "Qty"}</th>
            <th className={cn(th, "text-right pr-4 w-24")}>Total</th>
            {extraHeader}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows
              key={g.id}
              groupName={g.name}
              rows={g.rows}
              quantities={quantities}
              onQty={onQty}
              currency={currency}
              readOnly={readOnly}
              renderExtraCell={renderExtraCell}
              renderQty={renderQty}
              hasExtra={!!extraHeader}
              basis={basis}
            />
          ))}
          {groups.every((g) => g.rows.length === 0) && (
            <tr>
              <td colSpan={7} className="text-center text-[13px] text-muted-foreground py-12">
                {onlyFilled ? "No items ordered in this tab." : "No products in this tab."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  groupName,
  rows,
  quantities,
  onQty,
  currency,
  readOnly,
  renderExtraCell,
  renderQty,
  hasExtra,
  basis,
}: {
  groupName: string;
  rows: PreorderRow[];
  quantities: QtyMap;
  onQty?: (rowId: string, qty: number) => void;
  currency: string;
  readOnly: boolean;
  renderExtraCell?: (rowId: string) => ReactNode;
  renderQty?: (rowId: string, qty: number) => ReactNode;
  hasExtra: boolean;
  basis: PriceBasis;
}) {
  if (rows.length === 0) return null;
  const span = 6 + (hasExtra ? 1 : 0);
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={span} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
          {groupName}
        </td>
      </tr>
      {rows.map((r) => {
        const qty = quantities[r.id] || 0;
        const unit = rowUnitPrice(r, basis);
        const total = qty * unit;
        const partnerShown = r.discountedPrice ?? r.partnerPrice ?? null;
        const priceCell = (v: number | null, active: boolean) => (
          <td className={cn("px-2 py-1.5 text-right tabular-nums", active ? "text-foreground font-medium" : "text-muted-foreground")}>
            {v != null && v > 0 ? fmtMoney(v, currency) : "—"}
          </td>
        );
        if (r.unpriced) {
          return (
            <tr key={r.id} className={cn("border-b border-border/40", qty > 0 ? "bg-amber-50/60 dark:bg-amber-950/20" : "opacity-70")}>
              <td className="pl-4 pr-2 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <RowThumb row={r} />
                  <span className="text-[12px] text-foreground truncate">{r.name}</span>
                  <TagPill tag={r.tag} />
                </div>
              </td>
              <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{r.code}</td>
              <td colSpan={2} className="px-2 py-1.5 text-right text-[11px] text-amber-700 dark:text-amber-300">
                <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> no consumer price yet — not orderable</span>
              </td>
              <td className="px-2 py-1.5 text-right">
                {qty > 0 && !readOnly ? (
                  <button type="button" onClick={() => onQty?.(r.id, 0)} className="text-[11px] text-amber-700 dark:text-amber-300 underline">remove {qty}</button>
                ) : (
                  <span className="tabular-nums text-muted-foreground block text-right">{qty || "—"}</span>
                )}
              </td>
              <td className="px-2 pr-4 py-1.5 text-right text-muted-foreground">—</td>
              {renderExtraCell && <td className="px-2 py-1.5">{renderExtraCell(r.id)}</td>}
            </tr>
          );
        }
        return (
          <tr key={r.id} className={cn("border-b border-border/40 hover:bg-muted/20", qty > 0 && "bg-lime-50/40 dark:bg-lime-950/10")}>
            <td className="pl-4 pr-2 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <RowThumb row={r} />
                <span className="text-[12px] text-foreground truncate">{r.name}</span>
                <TagPill tag={r.tag} />
              </div>
            </td>
            <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{r.code}</td>
            {priceCell(r.rrp ?? null, basis === "rrp")}
            {priceCell(partnerShown, basis === "partner")}
            <td className="px-2 py-1.5">
              {readOnly ? (
                renderQty ? (
                  <div className="text-right">{renderQty(r.id, qty)}</div>
                ) : (
                  <span className="tabular-nums font-medium block text-right">{qty || "—"}</span>
                )
              ) : (
                <div className="flex justify-end">
                  <Stepper value={qty} onChange={(n) => onQty?.(r.id, n)} />
                </div>
              )}
            </td>
            <td className="px-2 pr-4 py-1.5 text-right tabular-nums font-medium">{total > 0 ? fmtMoney(total, currency) : "—"}</td>
            {renderExtraCell && <td className="px-2 py-1.5">{renderExtraCell(r.id)}</td>}
          </tr>
        );
      })}
    </>
  );
}

// ── Guided (Shopify-like store) ──────────────────────────────────────────────
function groupPriceRange(group: PreorderTab["groups"][number], basis: PriceBasis): [number, number] {
  const prices = group.rows.filter((r) => !r.unpriced).map((r) => rowUnitPrice(r, basis)).filter((p) => p > 0);
  if (prices.length === 0) return [0, 0];
  return [Math.min(...prices), Math.max(...prices)];
}
function groupCartCount(group: PreorderTab["groups"][number], q: QtyMap): number {
  return group.rows.reduce((n, r) => n + (q[r.id] || 0), 0);
}
function groupHero(group: PreorderTab["groups"][number]): string | null {
  return group.images?.[0] ?? group.rows.find((r) => r.image)?.image ?? null;
}

export function PreorderGuidedTab({
  tab,
  quantities,
  onQty,
  currency,
  pricing,
}: {
  tab: PreorderTab;
  quantities: QtyMap;
  onQty: (rowId: string, qty: number) => void;
  currency: string;
  pricing?: PricingContext | null;
}) {
  const [search, setSearch] = useState("");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const basis: PriceBasis = pricing?.basis ?? "partner";

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const withRows = tab.groups.filter((g) => g.rows.length > 0);
    if (!q) return withRows;
    return withRows.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.rows.some((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)),
    );
  }, [tab.groups, search]);

  const openGroup = tab.groups.find((g) => g.id === openGroupId) ?? null;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-[13px] focus:border-ring focus:outline-none"
        />
      </div>

      {groups.length === 0 ? (
        <div className="text-center text-[13px] text-muted-foreground py-16">
          {search ? "No products match your search." : "No products in this tab."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {groups.map((g) => (
            <ProductCard key={g.id} group={g} quantities={quantities} currency={currency} basis={basis} onOpen={() => setOpenGroupId(g.id)} />
          ))}
        </div>
      )}

      {openGroup && (
        <ProductDetailModal
          group={openGroup}
          quantities={quantities}
          onQty={onQty}
          currency={currency}
          basis={basis}
          onClose={() => setOpenGroupId(null)}
        />
      )}
    </div>
  );
}

function ProductCard({
  group,
  quantities,
  currency,
  basis,
  onOpen,
}: {
  group: PreorderTab["groups"][number];
  quantities: QtyMap;
  currency: string;
  basis: PriceBasis;
  onOpen: () => void;
}) {
  const hero = groupHero(group);
  const [lo, hi] = groupPriceRange(group, basis);
  const [olo, ohi] = groupPriceRange(group, basis === "rrp" ? "partner" : "rrp");
  const fmtRange = (a: number, b: number) => (a === 0 ? "—" : a === b ? fmtMoney(a, currency) : `${fmtMoney(a, currency)}–${fmtMoney(b, currency)}`);
  const cart = groupCartCount(group, quantities);
  const hasNew = group.rows.some((r) => r.tag);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group text-left rounded-xl border bg-surface overflow-hidden transition-colors flex flex-col",
        cart > 0 ? "border-lime-400 dark:border-lime-600" : "border-border hover:border-foreground/20",
      )}
    >
      <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200" />
        ) : (
          <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
        )}
        {hasNew && (
          <span className="absolute top-1.5 left-1.5 text-[9px] font-bold uppercase text-lime-700 bg-lime-100 dark:bg-lime-900/70 dark:text-lime-300 rounded px-1 py-0.5">New</span>
        )}
        {cart > 0 && (
          <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-lime-600 rounded-full px-1.5 py-0.5">
            <ShoppingCart className="w-2.5 h-2.5" /> {cart}
          </span>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-0.5 flex-1">
        <div className="text-[12px] font-medium text-foreground leading-snug line-clamp-2">{group.name}</div>
        <div className="text-[10px] text-muted-foreground">{group.rows.length} variant{group.rows.length === 1 ? "" : "s"}</div>
        <div className="flex items-end justify-between mt-auto pt-1 gap-1">
          <span className="flex flex-col leading-tight min-w-0">
            <span className="text-[12px] font-semibold tabular-nums text-foreground truncate">{fmtRange(lo, hi)}</span>
            {olo > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground truncate">
                {basis === "rrp" ? "Partner" : "RRP"} {fmtRange(olo, ohi)}
              </span>
            )}
          </span>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </button>
  );
}

function ProductDetailModal({
  group,
  quantities,
  onQty,
  currency,
  basis,
  onClose,
}: {
  group: PreorderTab["groups"][number];
  quantities: QtyMap;
  onQty: (rowId: string, qty: number) => void;
  currency: string;
  basis: PriceBasis;
  onClose: () => void;
}) {
  const gallery = useMemo(() => {
    const imgs = group.images?.length ? [...group.images] : [];
    for (const r of group.rows) if (r.image && !imgs.includes(r.image)) imgs.push(r.image);
    return imgs;
  }, [group]);
  const [index, setIndex] = useState(0);
  const main = gallery[index] ?? null;
  const [zoom, setZoom] = useState(false);
  const thumbsRef = useRef<HTMLDivElement | null>(null);
  // Left / right wrap around; the thumbnail strip follows the selection.
  const step = (d: number) => setIndex((i) => (gallery.length ? (i + d + gallery.length) % gallery.length : 0));
  useEffect(() => {
    thumbsRef.current?.children[index]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [index]);
  useEffect(() => {
    if (gallery.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (zoom) return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallery.length, zoom]);

  const cart = groupCartCount(group, quantities);
  const subtotal = group.rows.reduce((s, r) => s + (quantities[r.id] || 0) * rowUnitPrice(r, basis), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden gap-0">
        <DialogTitle className="sr-only">{group.name}</DialogTitle>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_1.25fr] max-h-[85vh]">
          {/* Gallery */}
          <div className="bg-muted/40 p-4 flex flex-col gap-3 border-b sm:border-b-0 sm:border-r border-border min-w-0">
            <div className="relative group/gallery">
              <button
                type="button"
                onClick={() => main && setZoom(true)}
                disabled={!main}
                className={cn("aspect-square w-full rounded-xl bg-background border border-border overflow-hidden flex items-center justify-center", main && "cursor-zoom-in")}
              >
                {main ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={main} alt={group.name} className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                )}
              </button>
              {gallery.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Previous image"
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-background"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Next image"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-background"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="absolute bottom-2 right-2 rounded-full bg-background/90 border border-border px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
                    {index + 1} / {gallery.length}
                  </span>
                </>
              )}
            </div>
            {gallery.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => thumbsRef.current?.scrollBy({ left: -160, behavior: "smooth" })}
                  aria-label="Scroll thumbnails left"
                  className="h-7 w-7 shrink-0 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground flex items-center justify-center"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div ref={thumbsRef} className="flex-1 min-w-0 flex gap-2 overflow-x-auto scrollbar-none py-0.5 px-0.5 snap-x">
                  {gallery.map((img, i) => (
                    <button
                      key={img}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-current={i === index ? "true" : undefined}
                      className={cn("w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 snap-start transition-colors", i === index ? "border-lime-500" : "border-transparent hover:border-border")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => thumbsRef.current?.scrollBy({ left: 160, behavior: "smooth" })}
                  aria-label="Scroll thumbnails right"
                  className="h-7 w-7 shrink-0 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground flex items-center justify-center"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Details + variants */}
          <div className="flex flex-col min-h-0">
            <div className="p-4 pb-2">
              <h2 className="text-[15px] font-semibold text-foreground leading-tight">{group.name}</h2>
              {group.description && (
                <p className="text-[12px] text-muted-foreground mt-1.5 whitespace-pre-line line-clamp-4">{group.description}</p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-4 divide-y divide-border/60">
              {group.rows.map((r) => {
                const qty = quantities[r.id] || 0;
                const unit = rowUnitPrice(r, basis);
                const other = basis === "rrp" ? (r.discountedPrice ?? r.partnerPrice ?? null) : (r.rrp ?? null);
                return (
                  <div key={r.id} className="flex items-center gap-2.5 py-2.5">
                    <RowThumb row={r} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[12px] font-medium text-foreground truncate">{r.variantLabel ?? r.size ?? r.name}</span>
                        <TagPill tag={r.tag} />
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">{r.code}</div>
                    </div>
                    {r.unpriced ? (
                      <span className="text-[11px] text-amber-700 dark:text-amber-300 text-right inline-flex items-center gap-1 shrink-0">
                        <AlertTriangle className="w-3 h-3" /> no consumer price yet
                        {qty > 0 && (
                          <button type="button" onClick={() => onQty(r.id, 0)} className="underline ml-1">remove {qty}</button>
                        )}
                      </span>
                    ) : (
                      <>
                        <span className="flex flex-col items-end leading-tight shrink-0">
                          <span className="text-[12px] font-semibold tabular-nums text-foreground">{unit ? fmtMoney(unit, currency) : "—"}</span>
                          {other != null && other > 0 && (
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {basis === "rrp" ? "Partner" : "RRP"} {fmtMoney(other, currency)}
                            </span>
                          )}
                        </span>
                        <Stepper value={qty} onChange={(n) => onQty(r.id, n)} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2 p-4 border-t border-border bg-muted/20">
              <div className="text-[12px] text-muted-foreground">
                {cart > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
                    <Check className="w-3.5 h-3.5 text-lime-600" /> {cart} in preorder · {fmtMoney(subtotal, currency)}
                  </span>
                ) : (
                  "Set a quantity to add to your preorder"
                )}
              </div>
              <button onClick={onClose} className="text-[13px] font-medium rounded-lg bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90">
                Done
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
      {zoom && main && <ImageLightbox src={main} alt={group.name} onClose={() => setZoom(false)} />}
    </Dialog>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
        disabled={value === 0}
        aria-label="Decrease"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="number"
        min={0}
        value={value || ""}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="no-spinner h-7 w-12 rounded-md border border-border bg-background text-center tabular-nums text-[12px] focus:border-ring focus:outline-none"
      />
      <button
        onClick={() => onChange(value + 1)}
        className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
        aria-label="Increase"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Volume discount tiers ────────────────────────────────────────────────────
// What the partner sees of a tab's discount ladder: the tier they've reached, how far
// the next one is, and the whole ladder. Renders nothing when the tab has no tiers.
export function TabTierBanner({
  tab,
  quantities,
  currency,
  className,
  pricing,
  bare,
}: {
  tab: PreorderTab;
  quantities: QtyMap;
  currency: string;
  className?: string;
  pricing?: PricingContext | null; // thresholds are compared in the customer's basis
  bare?: boolean; // no border / radius — the caller frames it
}) {
  const ladder = activeTiers(tab.tiers);
  const totals = useMemo(() => computeTabTotals({ tabs: [tab], pricing: pricing ?? null }, quantities)[0], [tab, quantities, pricing]);
  if (ladder.length === 0) return null;

  const reached = totals.tier;
  const next = totals.nextTier;
  // Progress towards the next tier, measured from the tier already reached.
  const from = reached?.minAmount ?? 0;
  const pct = next ? Math.min(100, Math.max(0, ((totals.amount - from) / (next.minAmount - from)) * 100)) : 100;

  return (
    <div
      className={cn(
        "px-4 py-3",
        !bare && "rounded-xl border",
        reached ? cn("bg-lime-50/60 dark:bg-lime-950/20", !bare && "border-lime-300 dark:border-lime-800") : !bare && "border-border bg-surface",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Percent className={cn("w-3.5 h-3.5 shrink-0", reached ? "text-lime-600" : "text-muted-foreground")} />
        {reached ? (
          <span className="text-[13px] font-medium text-lime-700 dark:text-lime-300">
            {reached.name || "Volume discount"} unlocked — −{reached.discountPct}% on everything in {tab.name || "this tab"}
          </span>
        ) : (
          <span className="text-[13px] font-medium text-foreground">Volume discount available in {tab.name || "this tab"}</span>
        )}
        <div className="flex-1" />
        {reached && (
          <span className="text-[12px] tabular-nums text-lime-700 dark:text-lime-300 font-semibold">
            −{fmtMoney(totals.discount, currency)}
          </span>
        )}
      </div>

      {next && (
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-lime-500 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {fmtMoney(totals.toNextTier, currency)} more in this tab unlocks{" "}
            <span className="font-medium text-foreground">{next.name || "the next tier"}</span> · −{next.discountPct}%
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {ladder.map((t) => {
          const hit = !!reached && t.minAmount <= reached.minAmount;
          const current = reached?.id === t.id;
          return (
            <span
              key={t.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                current
                  ? "bg-lime-600 text-white font-semibold"
                  : hit
                    ? "bg-lime-100 dark:bg-lime-900/40 text-lime-700 dark:text-lime-300"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {current && <Check className="w-2.5 h-2.5" />}
              {t.name || "Tier"} −{t.discountPct}%
              <span className="tabular-nums opacity-70">from {fmtMoney(t.minAmount, currency)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── VAT breakdown ────────────────────────────────────────────────────────────
// Under a total: what the figure includes. An individual sees the net / VAT split of
// their VAT-inclusive total; a company sees "excl. VAT · zero-rated". Without a pricing
// context (admin builder) it says nothing.
export function VatBreakdown({
  pricing,
  vat,
  currency,
  className,
}: {
  pricing: PricingContext | null | undefined;
  vat: OrderVatTotals | null | undefined;
  currency: string;
  className?: string;
}) {
  if (!pricing) return null;
  if (vatIsMissing(pricing)) {
    return <div className={cn("text-[10px] text-amber-700 dark:text-amber-400 text-right -mt-0.5", className)}>VAT rate not configured</div>;
  }
  if (pricing.basis === "partner") {
    if ((pricing.vat.rate ?? 0) > 0) {
      return (
        <div className={cn("text-[10px] text-muted-foreground -mt-0.5 space-y-px", className)}>
          <div className="text-right">excl. VAT · {fmtVatRate(pricing.vat.rate)} VAT added</div>
          {vat && vat.gross > 0 && (
            <div className="flex items-center justify-between tabular-nums">
              <span>
                Net {fmtMoney(vat.net, currency)} + VAT {fmtMoney(vat.vat, currency)}
              </span>
              <span>= {fmtMoney(vat.gross, currency)}</span>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className={cn("text-[10px] text-muted-foreground text-right -mt-0.5", className)}>
        excl. VAT · {fmtVatRate(pricing.vat.rate)} ({CUSTOMER_KIND_LABELS[pricing.kind].toLowerCase()}, {pricing.vat.source === "exempt" ? "VAT exempt" : "zero-rated"})
      </div>
    );
  }
  return (
    <div className={cn("text-[10px] text-muted-foreground -mt-0.5 space-y-px", className)}>
      <div className="text-right">incl. {fmtVatRate(pricing.vat.rate)} VAT</div>
      {vat && vat.gross > 0 && (
        <div className="flex items-center justify-between tabular-nums">
          <span>
            Net {fmtMoney(vat.net, currency)} · VAT {fmtMoney(vat.vat, currency)}
          </span>
          <span>= {fmtMoney(vat.gross, currency)}</span>
        </div>
      )}
    </div>
  );
}

// ── Summary panel ────────────────────────────────────────────────────────────
export function OrderSummaryPanel({
  campaign,
  quantities,
  currency,
  confirmed,
  bare,
}: {
  campaign: PreorderCampaign;
  quantities: QtyMap;
  currency: string;
  confirmed?: PreorderSubmissionTotals; // admin-confirmed subset (review/locked view)
  bare?: boolean; // no border / radius — the caller frames it
}) {
  const priced = useMemo(() => computePricedOrder(campaign, quantities), [campaign, quantities]);
  const tabTotals = priced.tabs.filter((t) => t.amount > 0);
  const totals = priced.totals;
  const discounted = totals.discount ?? 0;
  const pricing = campaign.pricing ?? null;

  return (
    <div className={cn("p-4 space-y-4", !bare && "rounded-xl border border-border bg-surface")}>
      <div>
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Order summary</div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-[13px] text-muted-foreground">Items</span>
          <span className="text-[15px] font-semibold tabular-nums text-foreground">{totals.qty}</span>
        </div>
        {discounted > 0 && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-muted-foreground">Subtotal</span>
              <span className="text-[13px] tabular-nums text-muted-foreground">{fmtMoney(totals.amount, currency)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-lime-700 dark:text-lime-400">Volume discount</span>
              <span className="text-[13px] font-medium tabular-nums text-lime-700 dark:text-lime-400">
                −{fmtMoney(discounted, currency)}
              </span>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-muted-foreground">{confirmed ? "Ordered total" : "Total"}</span>
          <span className="text-[18px] font-bold tabular-nums text-foreground">{fmtMoney(totalsNet(totals), currency)}</span>
        </div>
        <VatBreakdown pricing={pricing} vat={priced.vat} currency={currency} />
        {confirmed && (
          <div className="mt-1 pt-1 border-t border-border/50">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-lime-700 dark:text-lime-400">
                Confirmed{confirmed.qty > 0 ? ` · ${confirmed.qty}` : ""}
              </span>
              <span className="text-[16px] font-bold tabular-nums text-lime-700 dark:text-lime-400">
                {fmtMoney(totalsNet(confirmed), currency)}
              </span>
            </div>
            {totalsDiscount(confirmed) > 0 && (
              <div className="text-[10px] text-muted-foreground text-right -mt-0.5">
                after −{fmtMoney(totalsDiscount(confirmed), currency)} volume discount
              </div>
            )}
          </div>
        )}
      </div>

      {tabTotals.length > 0 && (
        <div className="pt-2 border-t border-border/60">
          <div className="text-[11px] font-medium text-muted-foreground mb-1.5">By tab</div>
          <ul className="space-y-1">
            {tabTotals.map((t) => (
              <li key={t.tabId} className="text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground truncate">
                    {t.tabName} <span className="tabular-nums text-muted-foreground/70">· {t.qty}</span>
                  </span>
                  <span className="tabular-nums font-medium text-foreground">{fmtMoney(t.net, currency)}</span>
                </div>
                {t.discount > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-lime-700 dark:text-lime-400">
                    <span className="truncate">
                      {t.tier?.name || "Volume discount"} −{t.discountPct}%
                    </span>
                    <span className="tabular-nums">−{fmtMoney(t.discount, currency)}</span>
                  </div>
                )}
                {t.discount === 0 && t.nextTier && (
                  <div className="text-[11px] text-muted-foreground/80 truncate">
                    {fmtMoney(t.toNextTier, currency)} more → {t.nextTier.name || "next tier"} −{t.nextTier.discountPct}%
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Review-before-submit modal: shows ONLY the ordered lines (grouped by tab/group) with
// per-line + grand totals, so the submitter confirms exactly what will be sent. Shared by
// the customer fill portal and the admin "fill for customer" preview.
export function PreorderReviewModal({
  open,
  onClose,
  campaign,
  quantities,
  terms,
  submitting,
  onSubmit,
  title = "Review your preorder",
  submitLabel = "Submit preorder",
}: {
  open: boolean;
  onClose: () => void;
  campaign: PreorderCampaign;
  quantities: Record<string, number>;
  terms: PreorderTerms;
  submitting: boolean;
  onSubmit: () => void;
  title?: string;
  submitLabel?: string;
}) {
  const currency = campaign.currency;
  const ordered = campaign.tabs
    .map((tab) => ({
      tab,
      groups: tab.groups
        .map((g) => ({ g, rows: g.rows.filter((r) => (quantities[r.id] || 0) > 0 && !r.unpriced) }))
        .filter((x) => x.rows.length > 0),
    }))
    .filter((t) => t.groups.length > 0);
  const priced = computePricedOrder(campaign, quantities);
  const tabTotals = priced.tabs;
  const byTab = new Map(tabTotals.map((t) => [t.tabId, t]));
  const totals = priced.totals;
  const discount = totals.discount ?? 0;
  const empty = totals.qty === 0;
  const basis = campaignBasis(campaign);
  const pricing = campaign.pricing ?? null;
  const vatMissing = vatIsMissing(pricing);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-lime-600" /> {title}
          </DialogTitle>
        </DialogHeader>

        {empty ? (
          <p className="text-[13px] text-muted-foreground py-6 text-center">
            No quantities added yet. Close this and add products first.
          </p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1 space-y-4">
            {ordered.map(({ tab, groups }) => {
              const tt = byTab.get(tab.id);
              return (
                <div key={tab.id}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-lime-700 dark:text-lime-400">{tab.name}</div>
                    {tt && tt.discount > 0 && (
                      <span className="text-[11px] font-medium text-lime-700 dark:text-lime-400">
                        {tt.tier?.name || "Volume discount"} −{tt.discountPct}%
                      </span>
                    )}
                  </div>
                  {groups.map(({ g, rows }) => (
                    <div key={g.id} className="mb-2">
                      <div className="text-[11px] font-medium text-muted-foreground">{g.name}</div>
                      <ul className="mt-0.5 divide-y divide-border/50">
                        {rows.map((r) => {
                          const qty = quantities[r.id] || 0;
                          const line = qty * rowUnitPrice(r, basis);
                          return (
                            <li key={r.id} className="flex items-center gap-2 py-1 text-[12px]">
                              <span className="flex-1 truncate text-foreground">{r.name}</span>
                              <span className="tabular-nums text-muted-foreground">{qty} ×</span>
                              <span className="tabular-nums text-muted-foreground w-20 text-right">{fmtMoney(rowUnitPrice(r, basis), currency)}</span>
                              <span className="tabular-nums font-medium w-24 text-right">{fmtMoney(line, currency)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  {tt && tt.discount > 0 && (
                    <div className="flex items-center justify-between text-[12px] border-t border-border/50 pt-1">
                      <span className="text-muted-foreground">
                        {tab.name} after {tt.tier?.name || "discount"}
                      </span>
                      <span className="tabular-nums text-lime-700 dark:text-lime-400 font-medium">
                        −{fmtMoney(tt.discount, currency)} → {fmtMoney(tt.net, currency)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!empty && (
          <div className="border-t border-border pt-3 space-y-1 text-[13px]">
            {discount > 0 && (
              <>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{fmtMoney(totals.amount, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-lime-700 dark:text-lime-400">
                  <span>Volume discount</span>
                  <span className="tabular-nums font-medium">−{fmtMoney(discount, currency)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Total · {totals.qty} item{totals.qty === 1 ? "" : "s"}
              </span>
              <span className="text-[16px] font-bold tabular-nums text-foreground">{fmtMoney(totalsNet(totals), currency)}</span>
            </div>
            <VatBreakdown pricing={pricing} vat={priced.vat} currency={currency} />
          </div>
        )}
        {vatMissing && (
          <p className="text-[12px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            The VAT rate for this customer&apos;s country is not configured, so the preorder cannot be submitted yet.
          </p>
        )}
        {terms.shippingAddress && (
          <p className="text-[11px] text-muted-foreground">Ship to: {terms.shippingAddress}</p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Keep editing</Button>
          <Button size="sm" onClick={onSubmit} disabled={submitting || empty || vatMissing}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Skeleton twins ───────────────────────────────────────────────────────────
// Structural copies of the sheet chrome shared by the admin preview, the
// submission review and the customer fill page. Static chrome (table headers,
// section labels, back link) renders for real; only the sheet data shimmers.

/** Sticky h-14 header row + tab bar, as every sheet page renders it. */
export function SheetHeaderSkeleton({
  backHref,
  right,
  tabs = 3,
}: {
  backHref: string;
  right?: ReactNode;
  tabs?: number;
}) {
  return (
    <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
      <div className="flex items-center gap-3 px-4 md:px-6 h-14">
        <Link href={backHref} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0">
          {/* text-[15px] leading-tight → 18.75px; text-[11px] → 16.5px */}
          <SkeletonLine lh="h-[19px]" h="h-3.5" w="w-48" />
          <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-32" delay={40} />
        </div>
        <div className="flex-1" />
        {right}
      </div>
      <div className="px-4 md:px-6 pb-2">
        <TabBarSkeleton count={tabs} />
      </div>
    </header>
  );
}

/** Twin of TabBar: rounded-full pills, text-[13px] + py-1.5 → 31.5px tall. */
export function TabBarSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("shrink-0 h-[31.5px] rounded-full", ["w-24", "w-28", "w-20", "w-32"][i % 4])}
          delay={stagger(i, 60)}
        />
      ))}
    </div>
  );
}

/** Twin of PreorderGridTab: real column headers, one group row, N product rows. */
export function PreorderGridSkeleton({
  rows = 6,
  qtyHeader = "Qty",
  extraHeader,
  readOnly = false,
}: {
  rows?: number;
  qtyHeader?: string;
  extraHeader?: ReactNode;
  readOnly?: boolean;
}) {
  const th = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-2";
  return (
    <div className="rounded-xl border border-border bg-surface overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-border">
            <th className={cn(th, "text-left pl-4 min-w-[220px]")}>Product</th>
            <th className={cn(th, "text-left")}>SKU</th>
            <th className={cn(th, "text-right")}>RRP</th>
            <th className={cn(th, "text-right")}>Partner</th>
            <th className={cn(th, "text-right w-28")}>{qtyHeader}</th>
            <th className={cn(th, "text-right pr-4 w-24")}>Total</th>
            {extraHeader}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-muted/40">
            <td colSpan={extraHeader ? 7 : 6} className="px-4 py-1.5">
              <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-32" />
            </td>
          </tr>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-b border-border/40">
              <td className="pl-4 pr-2 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Skeleton className="w-8 h-8 rounded shrink-0" delay={stagger(i, 50)} />
                  <SkeletonLine lh="h-[18px]" w={["w-40", "w-32", "w-48", "w-36"][i % 4]} delay={stagger(i, 50, 20)} />
                </div>
              </td>
              <td className="px-2 py-1.5"><SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-20" delay={stagger(i, 50, 40)} /></td>
              <td className="px-2 py-1.5"><SkeletonLine lh="h-[18px]" w="w-14" className="justify-end" delay={stagger(i, 50, 60)} /></td>
              <td className="px-2 py-1.5"><SkeletonLine lh="h-[18px]" w="w-14" className="justify-end" delay={stagger(i, 50, 80)} /></td>
              <td className="px-2 py-1.5">
                {readOnly ? (
                  <SkeletonLine lh="h-[18px]" w="w-6" className="justify-end" delay={stagger(i, 50, 100)} />
                ) : (
                  <div className="flex justify-end">
                    <div className="flex items-center gap-1">
                      <Skeleton className="w-7 h-7 rounded-md" delay={stagger(i, 50, 100)} />
                      <Skeleton className="h-7 w-12 rounded-md" delay={stagger(i, 50, 110)} />
                      <Skeleton className="w-7 h-7 rounded-md" delay={stagger(i, 50, 120)} />
                    </div>
                  </div>
                )}
              </td>
              <td className="px-2 pr-4 py-1.5"><SkeletonLine lh="h-[18px]" w="w-14" className="justify-end" delay={stagger(i, 50, 140)} /></td>
              {extraHeader && (
                <td className="px-2 py-1.5"><Skeleton className="h-7 w-full max-w-[140px] rounded-md" delay={stagger(i, 50, 160)} /></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Twin of OrderSummaryPanel: label, Items row, Total row, VAT note. */
export function OrderSummaryPanelSkeleton({ confirmed = false }: { confirmed?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Order summary</div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-[13px] text-muted-foreground">Items</span>
          <SkeletonLine lh="h-[22.5px]" h="h-3.5" w="w-6" delay={40} />
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-muted-foreground">{confirmed ? "Ordered total" : "Total"}</span>
          {/* text-[18px] → 27px line */}
          <SkeletonLine lh="h-[27px]" h="h-4" w="w-24" delay={80} />
        </div>
        <div className="text-[10px] text-muted-foreground text-right -mt-0.5">VAT</div>
        {confirmed && (
          <div className="mt-1 pt-1 border-t border-border/50">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-lime-700 dark:text-lime-400">Confirmed</span>
              <SkeletonLine lh="h-6" h="h-4" w="w-20" delay={120} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
