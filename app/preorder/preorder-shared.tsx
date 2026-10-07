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
  Layers,
  Building2,
  User,
  AlertTriangle,
  LayoutGrid,
  Table2,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { Popover as PopoverPrimitive } from "radix-ui";
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
import { TagPill } from "@/app/preorder/tag-pill";
import {
  rowUnitPrice,
  computeTabTotals,
  computePricedOrder,
  campaignBasis,
  activeTiers,
  totalsNet,
  totalsDiscount,
  CUSTOMER_KIND_LABELS,
  tagLabel,
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

// ── Fixed price ──────────────────────────────────────────────────────────────
// A fixed-price product (`row.fixedPrice`) is never volume-discounted; it still counts
// towards the order total that unlocks the discount levels. One pill marks it
// everywhere the customer meets it (sheet, catalogue, product, review) and in the
// admin builder.
export const FIXED_PRICE_HINT =
  "Fixed price — volume discounts don't apply to this product. It still counts towards your order total for reaching a discount level.";

export function FixedPricePill({ className, size = "sm" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      title={FIXED_PRICE_HINT}
      className={cn(
        "inline-flex items-center gap-1 shrink-0 rounded-full whitespace-nowrap font-medium",
        "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300/70 dark:bg-slate-800/70 dark:text-slate-200 dark:ring-slate-600/60",
        size === "md" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-px text-[10px]",
        className,
      )}
    >
      <Lock className={size === "md" ? "w-3 h-3" : "w-2.5 h-2.5"} aria-hidden />
      Fixed price
    </span>
  );
}

/** Fixed-price rows of a tab (for the "not discounted" notes). */
export function tabFixedCount(tab: PreorderTab | null | undefined): number {
  return tab ? tab.groups.reduce((n, g) => n + g.rows.filter((r) => r.fixedPrice).length, 0) : 0;
}

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
    <nav className="flex items-stretch gap-0.5 overflow-x-auto scrollbar-none -mb-px h-9" aria-label="Sections">
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
              "group relative isolate inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 text-[12.5px] font-medium transition-colors border-b-2",
              active ? "border-lime-600 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Layers className={cn("w-3.5 h-3.5 shrink-0 transition-colors", active ? "text-lime-600" : "text-muted-foreground/70 group-hover:text-foreground/70")} />
            {t.name || "Tab"}
            {count > 0 && (
              <span className={cn("text-[10px] tabular-nums rounded-full px-1.5 py-px leading-none font-semibold", active ? "bg-foreground text-background" : "bg-muted text-foreground")}>
                {count}
              </span>
            )}
            <span className="pointer-events-none absolute inset-x-0.5 top-1 bottom-1.5 rounded-md transition-colors group-hover:bg-muted/60 -z-10" aria-hidden />
          </button>
        );
      })}
    </nav>
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

// A variant without its own picture shows the group's cover.
function RowThumb({ row, cover }: { row: PreorderRow; cover?: string | null }) {
  return <Zoomable src={row.image ?? cover ?? null} alt={row.name} className="w-8 h-8 rounded ring-1 ring-border" />;
}


// Column captions for the two price columns, highlighting the one the customer pays.
function priceHeader(label: string, sub: string, active: boolean) {
  return (
    <span className={cn("inline-flex flex-col items-end leading-tight", active ? "text-foreground" : "")}>
      <span>{label}</span>
      <span className={cn("text-[9px] normal-case tracking-normal font-medium", active ? "text-foreground/70" : "text-muted-foreground/60")}>
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
  bare = false,
  searchable = false,
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
  bare?: boolean; // no border / radius — the caller frames it
  searchable?: boolean; // a search box above the table (name / SKU / group)
}) {
  const th = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-2";
  const basis: PriceBasis = pricing?.basis ?? "partner";
  const [search, setSearch] = useState("");
  const needle = searchable ? search.trim().toLowerCase() : "";
  const groups = tab.groups
    .map((g) => ({
      ...g,
      rows: g.rows.filter(
        (r) =>
          (!onlyFilled || (quantities[r.id] || 0) > 0) &&
          (!needle || g.name.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle) || r.code.toLowerCase().includes(needle) || (r.variantLabel ?? "").toLowerCase().includes(needle)),
      ),
    }))
    .filter((g) => g.rows.length > 0 || (!onlyFilled && !needle));
  const filled = tab.groups.reduce((n, g) => n + g.rows.filter((r) => (quantities[r.id] || 0) > 0).length, 0);
  return (
    <div className={cn("overflow-x-auto", !bare && "rounded-xl border border-border bg-surface")}>
      {searchable && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/60">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products, SKU…"
              className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-[12px] focus:border-ring focus:outline-none"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
            {needle ? `${groups.reduce((n, g) => n + g.rows.length, 0)} match${groups.reduce((n, g) => n + g.rows.length, 0) === 1 ? "" : "es"}` : filled > 0 ? `${filled} line${filled === 1 ? "" : "s"} filled` : ""}
          </span>
        </div>
      )}
      <table className="w-full text-[12px] border-collapse">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-border bg-muted/20">
            <th className={cn(th, "text-left pl-4 min-w-[220px]")}>Product</th>
            <th className={cn(th, "text-left")}>SKU / EAN</th>
            <th className={cn(th, "text-right")}>{priceHeader("RRP", basis === "rrp" ? "incl. VAT" : "reference", basis === "rrp")}</th>
            <th className={cn(th, "text-right")}>{priceHeader("Partner", "excl. VAT", basis === "partner")}</th>
            <th className={cn(th, "text-right w-28")}>{qtyHeader ?? "Qty"}</th>
            <th className={cn(th, "text-right pr-4 w-24")}>Total</th>
            {extraHeader}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <GroupRows
              key={g.id}
              solo={isSoloGroup(g)}
              // A run of single products after a group with variants starts with a thin
              // band, so the products don't read as more variants of that group.
              separate={isSoloGroup(g) && i > 0 && groups[i - 1].rows.length > 0 && !isSoloGroup(groups[i - 1])}
              groupName={g.name}
              cover={g.images?.[0] ?? null}
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
                {needle ? "No product matches your search." : onlyFilled ? "No items ordered in this tab." : "No products in this tab."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// A group holding ONE product whose name already says the group's ("Patrik Uphaul
// Line" in "Patrik Uphaul Line"): its header would only repeat the row, so the sheet
// lists it as a plain row and consecutive single products stack one under another.
function isSoloGroup(g: { name: string; rows: PreorderRow[] }): boolean {
  if (g.rows.length !== 1) return false;
  const group = g.name.trim().toLowerCase();
  const name = g.rows[0].name.trim().toLowerCase();
  return !group || name.includes(group) || group.includes(name);
}

function GroupRows({
  solo = false,
  separate = false,
  groupName,
  cover,
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
  solo?: boolean;
  separate?: boolean;
  groupName: string;
  cover?: string | null;
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
      {solo ? (
        separate && (
          <tr aria-hidden>
            <td colSpan={span} className="h-2.5 p-0 border-t-2 border-foreground/15 bg-muted/20" />
          </tr>
        )
      ) : (
        <tr className="bg-muted/15">
          <td colSpan={span} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {groupName}
          </td>
        </tr>
      )}
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
                  <RowThumb row={r} cover={cover} />
                  <span className="text-[12px] text-foreground truncate">{r.name}</span>
                  <TagPill tag={r.tag} color={r.tagColor} />
                </div>
              </td>
              <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap leading-tight">
                <div>{r.code}</div>
                {r.ean && <div className="text-[10px] text-muted-foreground/70" title="EAN">{r.ean}</div>}
              </td>
              <td colSpan={2} className="px-2 py-1.5 text-right text-[11px] text-amber-700 dark:text-amber-300">
                <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> no price yet — not orderable</span>
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
          <tr key={r.id} className={cn("border-b border-border/40 hover:bg-muted/20", qty > 0 && "bg-muted/25")}>
            <td className="pl-4 pr-2 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <RowThumb row={r} cover={cover} />
                <span className="text-[12px] text-foreground truncate">{r.name}</span>
                <TagPill tag={r.tag} color={r.tagColor} />
                {r.fixedPrice && <FixedPricePill />}
              </div>
            </td>
            <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap leading-tight">
                <div>{r.code}</div>
                {r.ean && <div className="text-[10px] text-muted-foreground/70" title="EAN">{r.ean}</div>}
              </td>
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

function rowLabel(r: PreorderRow): string {
  return (r.variantLabel ?? r.size ?? r.name ?? "").trim();
}

/**
 * Short per-variant labels for a group's rows: the run of leading words shared by
 * every row (typically the product name, e.g. "Patrik AEON Foil Set") is lifted out
 * as `prefix`, and each row keeps only its own tail ("SL 750"). A row whose whole
 * label is the prefix keeps it in full. `prefix` is null when the group name already
 * says it (or there is nothing shared), so the caller only shows it when it adds
 * information.
 */
function variantLabels(group: PreorderTab["groups"][number]): { prefix: string | null; short: Record<string, string> } {
  const full = group.rows.map((r) => rowLabel(r));
  const words = full.map((s) => s.split(/\s+/).filter(Boolean));
  let n = 0;
  if (words.length > 1) {
    const first = words[0];
    outer: for (; n < first.length; n++) {
      for (const w of words) if (w[n]?.toLowerCase() !== first[n].toLowerCase()) break outer;
    }
  }
  const prefix = n > 0 ? words[0].slice(0, n).join(" ") : "";
  const short: Record<string, string> = {};
  group.rows.forEach((r, i) => {
    const tail = words[i].slice(n).join(" ").replace(/^[\s\-–—·:,/|]+/, "");
    short[r.id] = tail || full[i];
  });
  const redundant = !prefix || group.name.toLowerCase().includes(prefix.toLowerCase());
  return { prefix: redundant ? null : prefix, short };
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
      <div data-tour="search" className="relative max-w-sm">
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
          {groups.map((g, i) => (
            <ProductCard
              key={g.id}
              group={g}
              quantities={quantities}
              currency={currency}
              basis={basis}
              onOpen={() => setOpenGroupId(g.id)}
              tour={i === 0 ? "product" : undefined}
            />
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
  tour,
}: {
  group: PreorderTab["groups"][number];
  quantities: QtyMap;
  currency: string;
  basis: PriceBasis;
  onOpen: () => void;
  /** data-tour target for the portal's quick guide. */
  tour?: string;
}) {
  const hero = groupHero(group);
  const [lo, hi] = groupPriceRange(group, basis);
  const [olo, ohi] = groupPriceRange(group, basis === "rrp" ? "partner" : "rrp");
  const fmtRange = (a: number, b: number) => (a === 0 ? "—" : a === b ? fmtMoney(a, currency) : `${fmtMoney(a, currency)}–${fmtMoney(b, currency)}`);
  const cart = groupCartCount(group, quantities);
  const cardTagRow = group.rows.find((r) => tagLabel(r.tag)) ?? null;
  const fixedRows = group.rows.filter((r) => r.fixedPrice).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-tour={tour}
      className={cn(
        "group text-left rounded-xl border bg-surface overflow-hidden transition-colors flex flex-col",
        cart > 0 ? "border-foreground/50" : "border-border hover:border-foreground/20",
      )}
    >
      <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200" />
        ) : (
          <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
        )}
        {cardTagRow && <TagPill tag={cardTagRow.tag} color={cardTagRow.tagColor} size="lg" className="absolute top-2.5 left-2.5" />}
        {cart > 0 && (
          <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-lime-600 rounded-full px-1.5 py-0.5">
            <ShoppingCart className="w-2.5 h-2.5" /> {cart}
          </span>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-0.5 flex-1">
        <div className="text-[12px] font-medium text-foreground leading-snug line-clamp-2">{group.name}</div>
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          {group.rows.length} variant{group.rows.length === 1 ? "" : "s"}
          {fixedRows > 0 && fixedRows === group.rows.length && <FixedPricePill />}
          {fixedRows > 0 && fixedRows < group.rows.length && (
            <span className="inline-flex items-center gap-0.5" title={FIXED_PRICE_HINT}>
              · <Lock className="w-2.5 h-2.5" /> {fixedRows} fixed price
            </span>
          )}
        </div>
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
  // Variant rows carry only what tells them apart: the words every row shares (the
  // product name repeated on each variant) move up into one caption, so a long list
  // reads "SL 750 / SL 900 / CR 900 …" instead of eleven truncated copies of the same
  // prefix. Rows have no thumbnail of their own — pointing at a row shows its picture
  // in the gallery instead.
  const variants = useMemo(() => variantLabels(group), [group]);
  const fixedRows = group.rows.filter((r) => r.fixedPrice).length;
  const showRow = (r: PreorderRow) => {
    const i = r.image ? gallery.indexOf(r.image) : -1;
    if (i >= 0) setIndex(i);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden gap-0">
        <DialogTitle className="sr-only">{group.name}</DialogTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 max-h-[85vh] overflow-y-auto sm:overflow-visible">
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
              <div ref={thumbsRef} className="flex gap-2 overflow-x-auto scrollbar-none py-0.5 px-0.5 snap-x">
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
            )}
            {group.description && (
              <p className="text-[12px] text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-3">{group.description}</p>
            )}
          </div>

          {/* Details + variants — sized by the gallery column, scrolling inside it */}
          <div className="relative min-h-[60vh] sm:min-h-0">
          <div className="sm:absolute sm:inset-0 flex flex-col min-h-0 h-full">
            <div className="p-4 pb-2">
              <h2 className="text-[15px] font-semibold text-foreground leading-tight">{group.name}</h2>
              <div className="text-[11px] text-muted-foreground mt-1">
                {variants.prefix && <span className="text-foreground/80 font-medium">{variants.prefix} · </span>}
                {group.rows.length} variant{group.rows.length === 1 ? "" : "s"}
              </div>
              {fixedRows > 0 && (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 ring-1 ring-inset ring-slate-200 dark:ring-slate-700/60 px-2.5 py-2 text-[11px] text-slate-700 dark:text-slate-300">
                  <Lock className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>
                    <span className="font-semibold">
                      {fixedRows === group.rows.length ? "Fixed price" : `Fixed price on ${fixedRows} of ${group.rows.length} variants`}
                    </span>{" "}
                    — volume discounts don&apos;t apply{fixedRows === group.rows.length ? " to this product" : " to those"}, but they still count towards your
                    order total for reaching a discount level.
                  </span>
                </div>
              )}
            </div>
            <div className="relative flex-1 min-h-0">
              <div className="h-full overflow-y-auto px-4 pb-4 divide-y divide-border/60">
              {group.rows.map((r) => {
                const qty = quantities[r.id] || 0;
                const unit = rowUnitPrice(r, basis);
                const other = basis === "rrp" ? (r.discountedPrice ?? r.partnerPrice ?? null) : (r.rrp ?? null);
                return (
                  <div
                    key={r.id}
                    onMouseEnter={() => showRow(r)}
                    onFocusCapture={() => showRow(r)}
                    className="flex items-center gap-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1">
                        <span className="text-[12px] font-medium text-foreground leading-snug line-clamp-2">{variants.short[r.id]}</span>
                        <TagPill tag={r.tag} color={r.tagColor} />
                        {r.fixedPrice && fixedRows < group.rows.length && <FixedPricePill />}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {r.code}
                        {r.ean && <span className="text-muted-foreground/70"> · EAN {r.ean}</span>}
                      </div>
                    </div>
                    {r.unpriced ? (
                      <span className="text-[11px] text-amber-700 dark:text-amber-300 text-right inline-flex items-center gap-1 shrink-0">
                        <AlertTriangle className="w-3 h-3" /> no price yet
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
              {/* Fade hints at more variants below the fold; the padding above keeps the last row clear of it. */}
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-background to-transparent" />
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

// ── Sheet context bar ────────────────────────────────────────────────────────
// One dense row above the products: who is ordering and how they are priced (left),
// the tab's volume-discount ladder as a stepped track with the current position
// (middle), and what the reached tier saves (right). The position is the WHOLE
// order's subtotal (every tab), which is what unlocks the tiers — so `tabs` is the
// full sheet and `tab` only picks the ladder shown. Replaces the stacked pricing
// sentence + discount banner on the customer's and the admin's order views.
export type FillMode = "grid" | "guided";

// A compact chip beside the discount progress when the section holds fixed-price
// products: "1 fixed price". Hover (or tap / focus) opens the why and the which — the
// products it covers, their price and how many are in the order — so the ladder row
// stays one line instead of carrying a sentence.
function FixedPriceChip({
  tab,
  quantities,
  currency,
  basis,
  nextTierName,
}: {
  tab: PreorderTab;
  quantities: QtyMap;
  currency: string;
  basis: PriceBasis;
  nextTierName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const rows = useMemo(
    () => tab.groups.flatMap((g) => g.rows.filter((r) => r.fixedPrice).map((r) => ({ r, group: g.name }))),
    [tab],
  );
  if (rows.length === 0) return null;
  const one = rows.length === 1;
  const inOrder = rows.reduce((n, { r }) => n + (quantities[r.id] || 0), 0);
  const shown = rows.slice(0, 6);

  const hoverOpen = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          onPointerEnter={(e) => e.pointerType === "mouse" && hoverOpen()}
          onPointerLeave={(e) => e.pointerType === "mouse" && hoverClose()}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors",
            "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300/70 hover:bg-slate-200/80",
            "dark:bg-slate-800/70 dark:text-slate-200 dark:ring-slate-600/60 dark:hover:bg-slate-700/70",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            open && "bg-slate-200/80 dark:bg-slate-700/70",
          )}
          aria-label={`${rows.length} fixed-price product${one ? "" : "s"} — not discounted. Show which`}
        >
          <Lock className="w-2.5 h-2.5" aria-hidden />
          {rows.length} fixed price
          {inOrder > 0 && <span className="tabular-nums font-normal text-slate-500 dark:text-slate-400">· {inOrder} in order</span>}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 w-72 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none overflow-hidden"
        >
          <div className="px-3.5 pt-3 pb-2.5">
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
              <Lock className="w-3.5 h-3.5 text-slate-500" /> Fixed price
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              Volume discounts don&apos;t apply to {one ? "this product" : "these products"}. {one ? "It still counts" : "They still count"} towards your
              order total{nextTierName ? `, so ${one ? "it helps" : "they help"} you reach ${nextTierName}` : ""}.
            </p>
          </div>
          <ul className="border-t border-border/70 max-h-56 overflow-y-auto">
            {shown.map(({ r, group }) => {
              const qty = quantities[r.id] || 0;
              const unit = rowUnitPrice(r, basis);
              const label = r.name.toLowerCase().startsWith(group.toLowerCase()) || !group ? r.name : `${group} · ${r.variantLabel || r.name}`;
              return (
                <li key={r.id} className="flex items-center gap-2 px-3.5 py-1.5 text-[11.5px] border-b border-border/40 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate text-foreground" title={label}>{label}</span>
                  {qty > 0 && <span className="shrink-0 rounded-full bg-lime-600 px-1.5 text-[10px] font-semibold tabular-nums text-white">{qty}</span>}
                  <span className="shrink-0 tabular-nums text-muted-foreground">{unit > 0 ? fmtMoney(unit, currency) : "—"}</span>
                </li>
              );
            })}
            {rows.length > shown.length && (
              <li className="px-3.5 py-1.5 text-[11px] text-muted-foreground">and {rows.length - shown.length} more — marked with a Fixed price badge</li>
            )}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ── Discount status (sticky header) ─────────────────────────────────────────
// The always-visible answer to "which discount do I have": a compact card on the
// right of the fill page's sticky title row (beside Quick guide), so it stays on
// screen while the customer scrolls — the full ladder (SheetContextBar) scrolls away
// with the sheet. Applied tier + what the whole order saves, then how much more
// unlocks the next tier over a thin progress bar. On phones only the tier shows.
// Renders nothing when the active section has no ladder.
export function DiscountStatus({
  tab,
  tabs,
  quantities,
  currency,
  pricing,
  className,
}: {
  tab: PreorderTab | null;
  tabs: PreorderTab[]; // the whole sheet — the order subtotal unlocks the tiers
  quantities: QtyMap;
  currency: string;
  pricing?: PricingContext | null;
  className?: string;
}) {
  const all = useMemo(() => computeTabTotals({ tabs, pricing: pricing ?? null }, quantities), [tabs, quantities, pricing]);
  const totals = tab ? all.find((t) => t.tabId === tab.id) ?? null : null;
  if (!tab || !totals || activeTiers(tab.tiers).length === 0) return null;
  const reached = totals.tier;
  const next = totals.nextTier;
  const saved = all.reduce((n, t) => n + t.discount, 0);
  const from = reached?.minAmount ?? 0;
  const pct = next ? Math.min(100, Math.max(0, ((totals.orderAmount - from) / Math.max(1e-9, next.minAmount - from)) * 100)) : 100;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-3 h-10 rounded-xl border border-border bg-surface pl-1.5 pr-3 min-w-0", className)}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
          reached ? "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300" : "bg-muted text-muted-foreground",
        )}
      >
        <Percent className="w-3.5 h-3.5" />
      </span>
      <div key={reached?.id ?? "none"} className="min-w-0 leading-tight animate-in fade-in duration-300">
        <div className="text-[12.5px] font-semibold text-foreground whitespace-nowrap">
          {reached ? `${reached.name || "Volume discount"} −${reached.discountPct}%` : "No discount yet"}
          {saved > 0 && (
            <span className="hidden sm:inline font-medium tabular-nums text-lime-700 dark:text-lime-400"> · −{fmtMoney(saved, currency)}</span>
          )}
        </div>
        <div className="hidden sm:block text-[10.5px] text-muted-foreground whitespace-nowrap">
          {reached ? "Volume discount applied" : "Volume discount"}
        </div>
      </div>
      {(next || reached) && <span className="hidden md:block h-6 w-px bg-border shrink-0" aria-hidden />}
      {next ? (
        <div className="hidden md:block w-40 leading-tight">
          <div className="text-[10.5px] text-muted-foreground whitespace-nowrap truncate tabular-nums">
            <span className="font-medium text-foreground">{fmtMoney(totals.toNextTier, currency)}</span> to {next.name || "next tier"} −{next.discountPct}%
          </div>
          <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-lime-500 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        reached && (
          <div className="hidden md:flex items-center gap-1 text-[10.5px] text-muted-foreground whitespace-nowrap">
            <Check className="w-3 h-3 text-lime-600" /> Top tier
          </div>
        )
      )}
    </div>
  );
}

// How the customer browses the sheet — "Order sheet" (the grid, the default) or
// "Catalogue" (guided cards). Underline tabs, sat at the right end of the section TabBar row. Shared
// by the portal fill page and the admin preview so both read exactly the same.
export function FillModeNav({ mode, onChange }: { mode: FillMode; onChange: (m: FillMode) => void }) {
  return (
    <nav className="flex items-stretch gap-0.5 -mb-px h-9" aria-label="View">
      {(
        [
          ["grid", Table2, "Order sheet"],
          ["guided", LayoutGrid, "Catalogue"],
        ] as [FillMode, React.ElementType, string][]
      ).map(([m, Icon, label]) => {
        const on = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={on}
            className={cn(
              "group relative isolate inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 text-[12.5px] font-medium transition-colors border-b-2",
              on ? "border-lime-600 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("w-3.5 h-3.5 shrink-0", on ? "text-lime-600" : "text-muted-foreground/70 group-hover:text-foreground/70")} />
            {label}
            <span className="pointer-events-none absolute inset-x-0.5 top-1 bottom-1.5 rounded-md transition-colors group-hover:bg-muted/60 -z-10" aria-hidden />
          </button>
        );
      })}
    </nav>
  );
}

export function SheetContextBar({
  pricing,
  tab,
  tabs,
  quantities,
  currency,
  className,
}: {
  pricing: PricingContext | null | undefined;
  tab: PreorderTab | null;
  tabs: PreorderTab[]; // the whole sheet — the order subtotal unlocks the tiers
  quantities: QtyMap;
  currency: string;
  className?: string;
}) {
  const ladder = tab ? activeTiers(tab.tiers) : [];
  const totals = useMemo(
    () => (tab ? computeTabTotals({ tabs, pricing: pricing ?? null }, quantities).find((t) => t.tabId === tab.id) ?? null : null),
    [tab, tabs, quantities, pricing],
  );
  const fixedCount = tabFixedCount(tab);
  if (!pricing && ladder.length === 0) return null;
  const missing = vatIsMissing(pricing);
  const company = pricing?.kind === "business";
  const reached = totals?.tier ?? null;
  const next = totals?.nextTier ?? null;
  const amount = totals?.orderAmount ?? 0;
  // The track is split into ZONES at equal width — the base zone (no discount) and
  // one per tier — because thresholds can be wildly apart (€10k then €4bn) and a
  // proportional track would pile every marker at the left. Each zone owns its
  // label cell, so labels never collide; the current position is interpolated
  // inside the zone it is in.
  const n = ladder.length;
  const zones = n + 1;
  const reachedCount = ladder.filter((t) => amount + 1e-9 >= t.minAmount).length;
  const lower = reachedCount === 0 ? 0 : ladder[reachedCount - 1].minAmount;
  const upper = reachedCount < n ? ladder[reachedCount].minAmount : null;
  const frac = upper == null ? 1 : Math.min(1, Math.max(0, (amount - lower) / Math.max(1e-9, upper - lower)));
  const zoneFill = (z: number) => (z < reachedCount ? 1 : z === reachedCount ? frac : 0);
  const pos = n === 0 ? 0 : ((reachedCount + frac) / zones) * 100;
  const gridCols = { gridTemplateColumns: `repeat(${zones}, minmax(0, 1fr))` };

  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 px-4 py-3", className)}>
      {/* who / how priced */}
      {pricing && (
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", missing ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-muted text-foreground")}>
            {missing ? <AlertTriangle className="w-4 h-4" /> : company ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-[13px] font-semibold text-foreground">{company ? "Company" : "Individual"}</div>
            <div className={cn("text-[11px]", missing ? "text-amber-700 dark:text-amber-300 font-medium" : "text-muted-foreground")}>
              {missing
                ? `VAT rate not configured${pricing.countryIso ? ` for ${pricing.countryIso}` : ""} — cannot submit`
                : company
                  ? `Partner prices · ${(pricing.vat.rate ?? 0) > 0 ? `+${fmtVatRate(pricing.vat.rate)} VAT` : `${fmtVatRate(pricing.vat.rate)} VAT, ${pricing.vat.source === "exempt" ? "exempt" : "zero-rated"}`}`
                  : pricing.basis === "rrp"
                    ? `RRP · incl. ${fmtVatRate(pricing.vat.rate)} VAT${pricing.countryIso ? ` (${pricing.countryIso})` : ""}`
                    : `Partner prices · ${(pricing.vat.rate ?? 0) > 0 ? `+${fmtVatRate(pricing.vat.rate)} VAT${pricing.countryIso ? ` (${pricing.countryIso})` : ""}` : `${fmtVatRate(pricing.vat.rate)} VAT, ${pricing.vat.source === "exempt" ? "exempt" : "zero-rated"}`}`}
            </div>
          </div>
        </div>
      )}

      {/* ladder */}
      {ladder.length > 0 && totals ? (
        <div className="min-w-0">
          {/* segmented track — the gaps ARE the thresholds */}
          <div className="relative">
            <div className="grid gap-1" style={gridCols}>
              {Array.from({ length: zones }, (_, z) => (
                <div key={z} className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-lime-600 transition-[width] duration-500 ease-out"
                    style={{ width: `${zoneFill(z) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            {/* current position */}
            <span
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-[3px] ring-background shadow-md transition-[left] duration-500 ease-out"
              style={{ left: `${pos}%` }}
            />
          </div>

          {/* one label cell per zone, left-aligned to where the zone starts */}
          <div className="mt-2 grid gap-1" style={gridCols}>
            <div className="min-w-0 text-[10px] leading-tight text-muted-foreground/70">
              <div className="truncate uppercase tracking-wide">No discount</div>
            </div>
            {ladder.map((t) => {
              const hit = amount + 1e-9 >= t.minAmount;
              const current = reached?.id === t.id;
              return (
                <div key={t.id} className={cn("min-w-0 text-[10px] leading-tight", hit ? "text-foreground" : "text-muted-foreground")}>
                  <div className={cn("truncate uppercase tracking-wide", hit && "font-semibold", current && "text-lime-700 dark:text-lime-400")}>
                    {t.name || "Tier"} −{t.discountPct}%
                  </div>
                  <div className="truncate tabular-nums text-muted-foreground/80">from {fmtMoney(t.minAmount, currency)}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <span className="text-muted-foreground tabular-nums">
                <span className="font-medium text-foreground">{fmtMoney(amount, currency)}</span> on the whole order
              </span>
              {tab && fixedCount > 0 && (
                <FixedPriceChip tab={tab} quantities={quantities} currency={currency} basis={pricing?.basis ?? "partner"} nextTierName={next?.name || null} />
              )}
            </span>
            <span className="text-muted-foreground tabular-nums truncate">
              {next
                ? <>{fmtMoney(totals.toNextTier, currency)} more → <span className="text-foreground font-medium">{next.name || "next tier"} −{next.discountPct}%</span></>
                : reached
                  ? "Top tier reached"
                  : null}
            </span>
          </div>
        </div>
      ) : (
        <div />
      )}

      {/* savings */}
      {ladder.length > 0 && totals && (
        <div className="text-right leading-tight lg:min-w-[120px]">
          {reached ? (
            <>
              <div className="text-[15px] font-bold tabular-nums text-lime-700 dark:text-lime-400">−{fmtMoney(totals.discount, currency)}</div>
              <div className="text-[11px] text-muted-foreground">
                {reached.name || "Volume discount"} −{reached.discountPct}% applied{fixedCount > 0 ? " · fixed prices excluded" : ""}
              </div>
            </>
          ) : (
            <>
              <div className="text-[13px] font-semibold text-foreground">Volume discount</div>
              <div className="text-[11px] text-muted-foreground">not reached yet</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Totals ladder ────────────────────────────────────────────────────────────
// The bottom of every order summary, receipt-style: one figure per row, the amount
// the customer actually pays in bold last. Anyone charged VAT (an individual, a
// company in a layer that charges it) reads Net → VAT → Total; a zero-rated company
// reads Total with a quiet "VAT · not charged" row; a legacy RRP-basis snapshot shows
// its VAT-inclusive total with the VAT it contains. Without a pricing context (admin
// builder) it is just the total. `payable` is the order's net in the customer's basis
// (`totalsNet`); the VAT figures come from the priced order.
/** VAT is added on top of the net figure (individuals, or companies in a layer that charges it). */
function vatCharged(pricing: PricingContext | null | undefined): boolean {
  return !!pricing && pricing.basis === "partner" && (pricing.vat.rate ?? 0) > 0;
}

export function TotalsLadder({
  pricing,
  vat,
  payable,
  currency,
  totalLabel = "Total",
  afterDiscount = false,
  size = "md",
}: {
  pricing: PricingContext | null | undefined;
  vat: OrderVatTotals | null | undefined;
  payable: number;
  currency: string;
  totalLabel?: string;
  /** Discount rows sit above: the net row then reads "Net" rather than "Subtotal". */
  afterDiscount?: boolean;
  size?: "md" | "lg";
}) {
  const row = "flex items-baseline justify-between gap-3 text-[13px]";
  const muted = "text-muted-foreground";
  const totalCls = cn("font-bold tabular-nums text-foreground", size === "lg" ? "text-[18px]" : "text-[16px]");
  // The rule above Total only separates it from the ladder's own rows.
  const Total = ({ label, value, divided }: { label: string; value: number; divided?: boolean }) => (
    <div className={cn(row, divided && "pt-1.5 mt-1.5 border-t border-border/60")}>
      <span className={muted}>{label}</span>
      <span className={totalCls}>{fmtMoney(value, currency)}</span>
    </div>
  );

  if (!pricing) return <Total label={totalLabel} value={payable} />;

  if (vatIsMissing(pricing)) {
    return (
      <>
        <Total label={`${totalLabel} · excl. VAT`} value={payable} />
        <div className={cn(row, "text-amber-700 dark:text-amber-400")}>
          <span>VAT</span>
          <span className="text-[12px]">rate not configured</span>
        </div>
      </>
    );
  }

  const rate = pricing.vat.rate ?? 0;
  const net = vat?.net ?? payable;
  const vatAmount = vat?.vat ?? 0;
  const gross = vat?.gross ?? payable;

  if (pricing.basis === "partner") {
    if (rate > 0) {
      return (
        <>
          <div className={row}>
            <span className={muted}>{afterDiscount ? "Net" : "Subtotal"} <span className="text-muted-foreground/70">· excl. VAT</span></span>
            <span className={cn("tabular-nums", muted)}>{fmtMoney(net, currency)}</span>
          </div>
          <div className={row}>
            <span className={muted}>VAT {fmtVatRate(rate)}</span>
            <span className={cn("tabular-nums", muted)}>{fmtMoney(vatAmount, currency)}</span>
          </div>
          <Total label={totalLabel} value={gross} divided />
        </>
      );
    }
    return (
      <>
        <Total label={totalLabel} value={payable} />
        <div className={cn(row, "text-[12px]")}>
          <span className={muted}>VAT</span>
          <span className={muted}>
            not charged <span className="text-muted-foreground/70">· {CUSTOMER_KIND_LABELS[pricing.kind].toLowerCase()}, {pricing.vat.source === "exempt" ? "exempt" : "zero-rated"}</span>
          </span>
        </div>
      </>
    );
  }
  // Legacy RRP basis: the payable figure already includes VAT.
  return (
    <>
      <Total label={`${totalLabel} · incl. VAT`} value={gross} />
      <div className={cn(row, "text-[12px]")}>
        <span className={muted}>of which VAT {fmtVatRate(rate)}</span>
        <span className={cn("tabular-nums", muted)}>{fmtMoney(vatAmount, currency)}</span>
      </div>
    </>
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
        <TotalsLadder
          pricing={pricing}
          vat={priced.vat}
          payable={totalsNet(totals)}
          currency={currency}
          totalLabel={confirmed ? "Ordered total" : "Total"}
          afterDiscount={discounted > 0}
          size="lg"
        />
        {confirmed && (
          <div className="mt-1 pt-1 border-t border-border/50">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-lime-700 dark:text-lime-400">
                Confirmed{confirmed.qty > 0 ? ` · ${confirmed.qty}` : ""}
                {vatCharged(pricing) && <span className="text-muted-foreground/70"> · excl. VAT</span>}
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
                {t.fixedAmount > 0 && (t.tier || t.nextTier) && (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground" title={FIXED_PRICE_HINT}>
                    <span className="inline-flex items-center gap-1 truncate">
                      <Lock className="w-2.5 h-2.5 shrink-0" /> Fixed price · {t.fixedQty} item{t.fixedQty === 1 ? "" : "s"}, not discounted
                    </span>
                    <span className="tabular-nums">{fmtMoney(t.fixedAmount, currency)}</span>
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
                              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                                <span className="truncate text-foreground">{r.name}</span>
                                {r.fixedPrice && tt?.tier && <FixedPricePill />}
                              </span>
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
                        {tt.fixedQty > 0 && <span className="text-muted-foreground/70"> · fixed prices excluded</span>}
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
            <TotalsLadder
              pricing={pricing}
              vat={priced.vat}
              payable={totalsNet(totals)}
              currency={currency}
              totalLabel={`Total · ${totals.qty} item${totals.qty === 1 ? "" : "s"}`}
              afterDiscount={discount > 0}
            />
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
            <th className={cn(th, "text-left")}>SKU / EAN</th>
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
        <div className="flex items-baseline justify-between text-[12px] text-muted-foreground">
          <span>VAT</span>
          <SkeletonLine lh="h-[18px]" h="h-3" w="w-16" delay={100} />
        </div>
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
