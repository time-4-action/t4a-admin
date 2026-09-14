// lib/preorder-snapshot.ts
//
// Pure helpers around the commercial snapshot a submission freezes at submit time and
// the comparison of that request with the live Metakocka order ("allocation").
// No server-only import — unit-tested and shared by routes and the MK service.

import {
  campaignFromSnapshot,
  computeTotals,
  flattenRows,
  rowUnitPrice,
  snapshotQuantities,
  type AllocationLine,
  type AllocationView,
  type CommercialSnapshot,
  type EffectiveCampaign,
  type PreorderSubmissionTotals,
} from "@/types/preorder";
import type { DocDetail } from "@/types/documents";

// Freeze what the partner agreed to: only ordered rows, at their effective unit price,
// with the effective tier ladder of every tab that carries a line.
export function buildCommercialSnapshot(
  effective: EffectiveCampaign,
  quantities: Record<string, number>,
  now: Date = new Date(),
): CommercialSnapshot {
  const lines: CommercialSnapshot["lines"] = [];
  const tabsSeen = new Map<string, CommercialSnapshot["tabs"][number]>();
  for (const { tab, group, row } of flattenRows(effective)) {
    const qty = Math.max(0, Math.floor(quantities[row.id] || 0));
    if (qty <= 0) continue;
    if (!tabsSeen.has(tab.id)) {
      tabsSeen.set(tab.id, {
        tabId: tab.id,
        tabName: tab.name,
        tiers: (tab.tiers ?? []).map((t) => ({ id: t.id, name: t.name, minAmount: t.minAmount, discountPct: t.discountPct })),
      });
    }
    lines.push({
      rowId: row.id,
      code: row.code,
      name: row.name,
      variantLabel: row.variantLabel ?? null,
      image: row.image ?? null,
      tabId: tab.id,
      tabName: tab.name,
      groupId: group.id,
      groupName: group.name,
      qty,
      unitPrice: rowUnitPrice(row),
      rrp: row.rrp ?? null,
      taxCode: row.taxCode ?? null,
      priceSource: row.priceSource ?? "sheet",
    });
  }
  const m = effective.effective;
  return {
    resolvedAt: now.toISOString(),
    countryIso: m.countryIso,
    market: m.market ? { id: m.market.id, name: m.market.name } : null,
    marketSource: m.marketSource,
    partnerPricelist: effective.partnerPricelist ?? null,
    currency: effective.currency,
    deadline: effective.deadline ?? null,
    note: m.note,
    sources: m.sources,
    tabs: Array.from(tabsSeen.values()),
    lines,
  };
}

// Totals recomputed from the snapshot alone (must equal the totals stored at submit).
export function snapshotTotals(snap: CommercialSnapshot): PreorderSubmissionTotals {
  const frozen = campaignFromSnapshot({ id: "", title: "", season: null, status: "closed" }, snap);
  return computeTotals(frozen, snapshotQuantities(snap));
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Stable fingerprint of an MK order's commercial content (lines + total) used to tell
// whether the order changed since it was published to the customer.
export function orderHash(order: Pick<DocDetail, "lines" | "sumAll">): string {
  const parts = order.lines
    .filter((l) => !l.isText && l.code)
    .map((l) => `${l.code}|${l.amount ?? ""}|${l.priceWithTax ?? l.price ?? ""}|${l.discount ?? ""}`)
    .sort();
  parts.push(`sum|${order.sumAll ?? ""}`);
  // djb2 over the joined string — short, deterministic, no crypto needed.
  let h = 5381;
  const s = parts.join("\n");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${parts.length}:${(h >>> 0).toString(16)}`;
}

// Join the request (snapshot) with the live MK order line by line (by product code —
// MK may repeat a code, so quantities are summed per code).
export function allocationFromDocument(
  snap: CommercialSnapshot | null | undefined,
  order: DocDetail,
  opts: { publishedHash?: string | null; now?: Date } = {},
): AllocationView {
  const requested = new Map<string, { qty: number; name: string }>();
  for (const l of snap?.lines ?? []) {
    const prev = requested.get(l.code);
    requested.set(l.code, { qty: (prev?.qty ?? 0) + l.qty, name: prev?.name ?? [l.name, l.variantLabel].filter(Boolean).join(" · ") });
  }
  const allocated = new Map<string, { qty: number; name: string; price: number | null; total: number; shipped: number; hasShipped: boolean }>();
  for (const l of order.lines) {
    if (l.isText || !l.code) continue;
    const qty = num(l.amount) ?? 0;
    const price = num(l.priceWithTax) ?? num(l.price);
    const prev = allocated.get(l.code);
    const shipped = num(l.shipped);
    allocated.set(l.code, {
      qty: (prev?.qty ?? 0) + qty,
      name: prev?.name ?? l.name ?? l.code,
      price: prev?.price ?? price,
      total: (prev?.total ?? 0) + (price != null ? price * qty : 0),
      shipped: (prev?.shipped ?? 0) + (shipped ?? 0),
      hasShipped: (prev?.hasShipped ?? false) || shipped != null,
    });
  }
  const codes = new Set([...requested.keys(), ...allocated.keys()]);
  const lines: AllocationLine[] = [];
  let requestedQty = 0;
  let allocatedQty = 0;
  for (const code of codes) {
    const r = requested.get(code);
    const a = allocated.get(code);
    const rq = r?.qty ?? 0;
    const aq = a?.qty ?? 0;
    requestedQty += rq;
    allocatedQty += aq;
    let status: AllocationLine["status"];
    if (!r) status = "added";
    else if (aq === 0) status = "removed";
    else if (aq < rq) status = "partial";
    else if (aq > rq) status = "increased";
    else status = "full";
    lines.push({
      code,
      name: r?.name ?? a?.name ?? code,
      requestedQty: rq,
      allocatedQty: aq,
      unitPriceWithTax: a?.price ?? null,
      lineTotal: a ? Math.round(a.total * 100) / 100 : null,
      status,
      shipped: a?.hasShipped ? String(a.shipped) : undefined,
    });
  }
  // Keep the request's order first, then additions.
  const order0 = new Map((snap?.lines ?? []).map((l, i) => [l.code, i]));
  lines.sort((x, y) => (order0.get(x.code) ?? 1e9) - (order0.get(y.code) ?? 1e9) || x.code.localeCompare(y.code));
  const hash = orderHash(order);
  return {
    mkId: order.mkId,
    countCode: order.countCode,
    fetchedAt: (opts.now ?? new Date()).toISOString(),
    currency: order.currency ?? null,
    mkStatusDesc: order.statusDesc ?? null,
    sumAll: order.sumAll ?? null,
    requestedQty,
    allocatedQty,
    lines,
    changedSincePublish: !!opts.publishedHash && opts.publishedHash !== hash,
  };
}
