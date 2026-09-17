// lib/pricing.ts
//
// THE pricing / VAT service of the Preorder module. Every price a customer sees, every
// total, every Metakocka line and every frozen snapshot figure comes out of here.
// Pure and framework-agnostic (imported client & server); no `server-only`.
//
// Rules
//  • A customer is a "business" (Metakocka carries a tax id) or a "person".
//  • Business  → PARTNER price, which is NET (excl. VAT), and 0% VAT (zero-rated).
//  • Person    → RRP, which is GROSS (VAT-inclusive). VAT is EXTRACTED from the RRP at
//                the customer's country rate — never added on top:
//                €100 RRP in SI (22%) = €81.97 net + €18.03 VAT = €100.
//  • The VAT rate of a country comes from: campaign override → global setting →
//                configured fallback → otherwise it is MISSING and the order is blocked.
//                A missing rate is never guessed.
//  • A market or customer rule can change the VAT policy (VatPolicy): switch VAT off
//                (exempt, 0%), pin one fixed rate for everyone in the layer, or charge
//                VAT to companies too (on top of the net partner price).
//  • Volume tiers apply to both kinds; the threshold is compared with the customer's
//                subtotal in their own price basis (business: net, person: gross).
//
// Money is handled as INTEGER CENTS. Prices enter as decimals (what admins type and
// what MK returns), are rounded to cents once, and every operation after that is
// integer arithmetic — no float drift. VAT is split PER LINE (unit first, then × qty)
// and totals are the Σ of the lines, which is how an invoice (and Metakocka) adds up;
// splitting the order total once could differ by a cent.

import type { PreorderCampaign, PreorderRow, PreorderSubmissionTotals, PreorderTab, PreorderTier } from "@/types/preorder";

export type CustomerKind = "business" | "person";
export type PriceBasis = "partner" | "rrp";
export type VatSource = "campaign" | "global" | "fallback" | "zero-rated" | "exempt" | "market" | "customer";
export type VatMode = "country" | "exempt" | "fixed";
export const VAT_MODES: readonly VatMode[] = ["country", "exempt", "fixed"];

// The VAT policy of the layer a customer falls in (campaign default → market →
// customer rule): how the rate is found and whether companies are charged.
export type VatPolicy = {
  mode: VatMode; // country = per-country rates (default); exempt = VAT off (0%); fixed = one rate for everyone here
  fixedRate: number | null; // the rate for `fixed`
  chargeCompanies: boolean; // charge VAT to companies too (default false = zero-rated)
  source: "campaign" | "market" | "customer"; // which layer set the mode
};
export const DEFAULT_VAT_POLICY: VatPolicy = { mode: "country", fixedRate: null, chargeCompanies: false, source: "campaign" };
export type VatResolution = { rate: number; source: VatSource } | { rate: null; source: "missing" };

export type VatRateMap = Record<string, number>; // ISO 3166-1 alpha-2 → percent
// Metakocka's account-specific tax code for a VAT rate ("EX4" = 22 %, "000" = 0 %, …):
// put_document wants a `tax` code per line and the codes differ per account, so they
// are configured next to the rates. A rate without a code cannot be registered.
export type VatTaxCode = { rate: number; code: string };
export type VatConfig = { rates: VatRateMap; fallbackRate: number | null; taxCodes: VatTaxCode[] };
export type VatOverride = { iso: string; rate: number };
export const EMPTY_VAT_CONFIG: VatConfig = { rates: {}, fallbackRate: null, taxCodes: [] };

export function normalizeTaxCodes(raw: unknown): VatTaxCode[] {
  const out = new Map<number, string>();
  if (Array.isArray(raw)) {
    for (const e of raw) {
      if (!e || typeof e !== "object") continue;
      const rate = normalizeVatRate((e as { rate?: unknown }).rate);
      const code = String((e as { code?: unknown }).code ?? "").trim().slice(0, 20);
      if (rate !== null && code) out.set(rate, code);
    }
  }
  return Array.from(out.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, code]) => ({ rate, code }));
}

// The MK tax code for a rate, or null when none is configured (never guessed).
export function taxCodeForRate(codes: VatTaxCode[] | null | undefined, rate: number): string | null {
  const want = normalizeVatRate(rate);
  if (want === null) return null;
  return codes?.find((c) => normalizeVatRate(c.rate) === want)?.code ?? null;
}

// What the resolver decided for ONE customer. Rides on the effective campaign (and
// is restored from the snapshot for frozen views) so every fill component prices the
// same way.
export type PricingContext = {
  kind: CustomerKind;
  basis: PriceBasis;
  countryIso: string | null;
  vat: VatResolution;
};

export const VAT_SOURCE_LABELS: Record<VatSource | "missing", string> = {
  campaign: "Campaign override",
  global: "Global rate",
  fallback: "Fallback rate",
  "zero-rated": "Zero-rated (company)",
  exempt: "VAT exempt",
  market: "Market rate",
  customer: "Customer rate",
  missing: "Not configured",
};

export const VAT_MODE_LABELS: Record<VatMode, string> = {
  country: "Country rates",
  exempt: "VAT exempt (0%)",
  fixed: "Fixed rate",
};

export const CUSTOMER_KIND_LABELS: Record<CustomerKind, string> = {
  business: "Company",
  person: "Individual",
};

// ── integer cents ────────────────────────────────────────────────────────────

export type Cents = number;

export function toCents(n: number | null | undefined): Cents {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * 100);
}

export function fromCents(c: Cents): number {
  return c / 100;
}

export function mulCents(c: Cents, qty: number): Cents {
  return c * Math.max(0, Math.floor(qty));
}

// pct of an amount, rounded to the nearest cent.
export function pctOfCents(c: Cents, pct: number): Cents {
  if (!pct) return 0;
  return Math.round((c * pct) / 100);
}

export type VatSplit = { net: Cents; vat: Cents; gross: Cents };

// Extract VAT from a gross amount: net = gross / (1 + rate), VAT is the remainder so
// net + vat === gross always holds.
export function splitGross(grossC: Cents, ratePct: number): VatSplit {
  const net = ratePct > 0 ? Math.round((grossC * 100) / (100 + ratePct)) : grossC;
  return { net, vat: grossC - net, gross: grossC };
}

// Add VAT on top of a net amount.
export function addVat(netC: Cents, ratePct: number): VatSplit {
  const vat = pctOfCents(netC, ratePct);
  return { net: netC, vat, gross: netC + vat };
}

// ── policy ───────────────────────────────────────────────────────────────────

export function basisFor(kind: CustomerKind): PriceBasis {
  return kind === "person" ? "rrp" : "partner";
}

function isoOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

// A VAT rate as typed by an admin: 0–100 with at most two decimals; anything else is
// "not set".
export function normalizeVatRate(v: unknown): number | null {
  const n = typeof v === "string" ? (v.trim() === "" ? NaN : Number(v)) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

export function normalizeVatRateMap(raw: unknown): VatRateMap {
  const out: VatRateMap = {};
  if (Array.isArray(raw)) {
    for (const e of raw) {
      if (!e || typeof e !== "object") continue;
      const iso = isoOf((e as { iso?: unknown }).iso);
      const rate = normalizeVatRate((e as { rate?: unknown }).rate);
      if (iso && rate !== null) out[iso] = rate;
    }
    return out;
  }
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const iso = isoOf(k);
      const rate = normalizeVatRate(v);
      if (iso && rate !== null) out[iso] = rate;
    }
  }
  return out;
}

export function normalizeVatOverrides(raw: unknown): VatOverride[] {
  const map = normalizeVatRateMap(raw);
  return Object.keys(map)
    .sort()
    .map((iso) => ({ iso, rate: map[iso] }));
}

// The VAT rate that applies to ONE customer, and where it came from. Businesses are
// zero-rated by rule (unless the layer's policy charges them); the policy may switch
// VAT off or pin one rate; otherwise the rate follows the country priority chain. A
// missing rate is reported, never guessed.
export function resolveVatRate(input: {
  kind: CustomerKind;
  countryIso: string | null;
  campaignOverrides?: VatOverride[] | null;
  global: VatConfig;
  policy?: VatPolicy | null;
}): VatResolution {
  const policy = input.policy ?? DEFAULT_VAT_POLICY;
  if (input.kind === "business" && !policy.chargeCompanies) return { rate: 0, source: "zero-rated" };
  if (policy.mode === "exempt") return { rate: 0, source: "exempt" };
  if (policy.mode === "fixed") {
    const fixed = normalizeVatRate(policy.fixedRate);
    if (fixed === null) return { rate: null, source: "missing" };
    return { rate: fixed, source: policy.source === "customer" ? "customer" : "market" };
  }
  const iso = isoOf(input.countryIso);
  if (iso) {
    const override = (input.campaignOverrides ?? []).find((o) => o.iso.toUpperCase() === iso);
    if (override && normalizeVatRate(override.rate) !== null) return { rate: normalizeVatRate(override.rate)!, source: "campaign" };
    const global = normalizeVatRate(input.global.rates[iso]);
    if (global !== null) return { rate: global, source: "global" };
  }
  const fallback = normalizeVatRate(input.global.fallbackRate);
  if (fallback !== null) return { rate: fallback, source: "fallback" };
  return { rate: null, source: "missing" };
}

// ── rows & lines ─────────────────────────────────────────────────────────────

// The unit price a customer orders a row at, in their basis. Partner basis keeps the
// legacy fallback chain (discounted → partner → rrp) so a sheet without partner
// prices still works; RRP basis never falls back to a net price.
export function unitPriceFor(
  row: Pick<PreorderRow, "discountedPrice" | "partnerPrice" | "rrp">,
  basis: PriceBasis = "partner",
): number {
  if (basis === "rrp") return row.rrp ?? 0;
  return row.discountedPrice ?? row.partnerPrice ?? row.rrp ?? 0;
}

export type LinePricing = {
  basis: PriceBasis;
  qty: number;
  unit: number; // unit price in the basis, before the tab's volume discount
  tierPct: number;
  unitFinal: number; // unit after the volume discount, still in the basis
  unitNet: number;
  unitVat: number;
  unitGross: number;
  lineNet: number;
  lineVat: number;
  lineGross: number;
};

// Price one line: apply the tier to the unit, then split (person) or zero-rate
// (business), then multiply by the quantity.
export function priceLine(input: { basis: PriceBasis; unit: number; qty: number; tierPct: number; vatRate: number }): LinePricing {
  const qty = Math.max(0, Math.floor(input.qty || 0));
  const unitC = toCents(input.unit);
  const unitFinalC = unitC - pctOfCents(unitC, input.tierPct);
  const unitSplit = input.basis === "rrp" ? splitGross(unitFinalC, input.vatRate) : addVat(unitFinalC, input.vatRate);
  const lineGross = mulCents(unitSplit.gross, qty);
  const lineNet = mulCents(unitSplit.net, qty);
  return {
    basis: input.basis,
    qty,
    unit: fromCents(unitC),
    tierPct: input.tierPct,
    unitFinal: fromCents(unitFinalC),
    unitNet: fromCents(unitSplit.net),
    unitVat: fromCents(unitSplit.vat),
    unitGross: fromCents(unitSplit.gross),
    lineNet: fromCents(lineNet),
    lineVat: fromCents(lineGross - lineNet),
    lineGross: fromCents(lineGross),
  };
}

// ── volume discount tiers ────────────────────────────────────────────────────
// A tab's tiers turn its subtotal into a discount: order enough within the tab and
// every line in it drops by the tier's percentage. Tiers never stack — exactly one
// (the highest threshold reached) applies.

// The usable tiers of a tab, cleaned and sorted by threshold ascending. A tier with a
// non-positive percentage is inert (it would discount nothing) and is dropped here so
// every consumer sees the same list.
export function activeTiers(tiers?: PreorderTier[] | null): PreorderTier[] {
  return (tiers ?? [])
    .filter((t) => Number.isFinite(t?.minAmount) && t.minAmount >= 0 && Number.isFinite(t?.discountPct) && t.discountPct > 0)
    .slice()
    .sort((a, b) => a.minAmount - b.minAmount || a.discountPct - b.discountPct);
}

// The tier an amount qualifies for: the highest threshold it reaches (on a tie, the
// better percentage). Null when it reaches none.
export function tierForAmount(tiers: PreorderTier[] | null | undefined, amount: number): PreorderTier | null {
  let hit: PreorderTier | null = null;
  for (const t of activeTiers(tiers)) {
    if (amount + 1e-9 >= t.minAmount) hit = t;
  }
  return hit;
}

// The next tier still out of reach (what the partner is working towards), or null.
export function nextTierAfter(tiers: PreorderTier[] | null | undefined, amount: number): PreorderTier | null {
  for (const t of activeTiers(tiers)) {
    if (amount + 1e-9 < t.minAmount) return t;
  }
  return null;
}

// ── whole order ──────────────────────────────────────────────────────────────

// A tab's contribution to an order, with its volume discount resolved. Amounts are in
// the customer's price basis (business: net, person: gross).
export type PreorderTabTotal = {
  tabId: string;
  tabName: string;
  qty: number;
  amount: number; // basis subtotal, before the tab's volume discount
  tier: PreorderTier | null; // the tier this tab reached
  discountPct: number; // 0 when no tier applies
  discount: number; // Σ per-line (unit − discounted unit) × qty
  net: number; // amount − discount (what is actually payable, in the basis)
  nextTier: PreorderTier | null; // the tier just out of reach
  toNextTier: number; // how much more this tab needs to reach it
};

export type PricedTab = PreorderTabTotal & { lines: Record<string, LinePricing> }; // by rowId

export type OrderVatTotals = { rate: number; net: number; vat: number; gross: number };

export type PricedOrder = {
  ctx: PricingContext | null;
  tabs: PricedTab[];
  totals: PreorderSubmissionTotals; // legacy shape: amount / discount / net in the basis
  // Σ of the lines' net / VAT / gross. Null while the VAT rate is missing — nothing
  // can be priced for that customer yet.
  vat: OrderVatTotals | null;
};

export function sumTabTotals(rows: PreorderTabTotal[]): PreorderSubmissionTotals {
  let qty = 0;
  let amountC = 0;
  let discountC = 0;
  for (const t of rows) {
    qty += t.qty;
    amountC += toCents(t.amount);
    discountC += toCents(t.discount);
  }
  return { qty, amount: fromCents(amountC), discount: fromCents(discountC), net: fromCents(amountC - discountC) };
}

// The one engine behind every total: `qtyOf` decides which quantity a row contributes
// (as ordered, or only the admin-confirmed part). A campaign without a pricing context
// (the admin builder, legacy frozen views) prices on the partner basis with no VAT
// — the rows' own prices, as before.
export function priceOrder(
  campaign: { tabs: PreorderTab[]; pricing?: PricingContext | null },
  qtyOf: (row: PreorderRow) => number,
): PricedOrder {
  const ctx = campaign.pricing ?? null;
  const basis: PriceBasis = ctx?.basis ?? "partner";
  const rate = ctx?.vat.rate ?? 0;
  let netC = 0;
  let vatC = 0;
  let grossC = 0;

  const tabs: PricedTab[] = campaign.tabs.map((tab) => {
    const ordered: { row: PreorderRow; qty: number; unitC: Cents }[] = [];
    let qty = 0;
    let amountC = 0;
    for (const group of tab.groups) {
      for (const row of group.rows) {
        const q = Math.max(0, Math.floor(qtyOf(row) || 0));
        if (q <= 0 || row.unpriced) continue;
        const unitC = toCents(unitPriceFor(row, basis));
        ordered.push({ row, qty: q, unitC });
        qty += q;
        amountC += mulCents(unitC, q);
      }
    }
    const amount = fromCents(amountC);
    const tier = tierForAmount(tab.tiers, amount);
    const discountPct = tier?.discountPct ?? 0;
    const lines: Record<string, LinePricing> = {};
    let discountC = 0;
    for (const o of ordered) {
      const lp = priceLine({ basis, unit: fromCents(o.unitC), qty: o.qty, tierPct: discountPct, vatRate: rate });
      lines[o.row.id] = lp;
      discountC += mulCents(o.unitC - toCents(lp.unitFinal), o.qty);
      netC += toCents(lp.lineNet);
      vatC += toCents(lp.lineVat);
      grossC += toCents(lp.lineGross);
    }
    const next = nextTierAfter(tab.tiers, amount);
    return {
      tabId: tab.id,
      tabName: tab.name,
      qty,
      amount,
      tier,
      discountPct,
      discount: fromCents(discountC),
      net: fromCents(amountC - discountC),
      nextTier: next,
      toNextTier: next ? fromCents(Math.max(0, toCents(next.minAmount) - amountC)) : 0,
      lines,
    };
  });

  return {
    ctx,
    tabs,
    totals: sumTabTotals(tabs),
    vat: ctx && ctx.vat.rate != null ? { rate: ctx.vat.rate, net: fromCents(netC), vat: fromCents(vatC), gross: fromCents(grossC) } : null,
  };
}

// ── labels ───────────────────────────────────────────────────────────────────

export function fmtVatRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${Number.isInteger(rate) ? rate : rate.toFixed(2).replace(/\.?0+$/, "")}%`;
}

// Short human line for totals ("incl. 22% VAT", "excl. VAT · 0% (company)",
// "excl. VAT · +22% VAT").
export function vatLabel(ctx: PricingContext | null | undefined): string {
  if (!ctx) return "";
  if (ctx.vat.rate == null) return "VAT rate not configured";
  if (ctx.basis === "rrp") return `incl. ${fmtVatRate(ctx.vat.rate)} VAT`;
  if (ctx.vat.rate > 0) return `excl. VAT · +${fmtVatRate(ctx.vat.rate)} VAT`;
  return `excl. VAT · ${fmtVatRate(ctx.vat.rate)} (${ctx.vat.source === "exempt" ? "exempt" : "company"})`;
}

export function vatIsMissing(ctx: PricingContext | null | undefined): boolean {
  return !!ctx && ctx.vat.rate == null;
}
