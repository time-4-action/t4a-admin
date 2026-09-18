// types/preorder.ts
//
// Shared shapes for the Preorder module (admin sheet builder + partner fill portal +
// admin review + markets/customers configuration). These are the WIRE views exchanged
// between the API routes and the client — ids are strings, dates are ISO strings. The
// MongoDB documents that back them live in models/preorder-campaign.ts and
// models/preorder-submission.ts; keep the field names aligned. Framework-agnostic on
// purpose (imported client & server).
//
// All money math lives in lib/pricing.ts (integer cents, VAT rules); the engine
// functions below are thin wrappers kept under their historical names.

import {
  priceOrder,
  unitPriceFor,
  sumTabTotals as sumTabTotalsImpl,
  type CustomerKind,
  type PricingContext,
  type PriceBasis,
  type PricedOrder,
  type PreorderTabTotal,
  type VatMode,
  type VatOverride,
  type VatPolicy,
  type VatSource,
} from "@/lib/pricing";

export { activeTiers, tierForAmount, nextTierAfter, VAT_SOURCE_LABELS, VAT_MODE_LABELS, VAT_MODES, CUSTOMER_KIND_LABELS } from "@/lib/pricing";
export type { CustomerKind, PricingContext, PriceBasis, PricedOrder, PreorderTabTotal, VatMode, VatOverride, VatPolicy, VatSource } from "@/lib/pricing";

export type CampaignStatus = "draft" | "open" | "closed";
export type SubmissionStatus = "draft" | "submitted" | "confirmed" | "closed";

// Per-line admin fulfilment state (legacy — submissions made before immediate MK
// registration were confirmed line by line; kept so old documents still render).
export type LineStatus = "pending" | "confirmed" | "backorder" | "cancelled";

export type RowSource = "catalogue" | "manual";
export type RowTag = "NEW" | "pre-order only" | null;

// One product line in the admin-authored sheet. Prices are snapshotted at build time
// (from the catalogue pricelist or manual entry) and displayed as-is for now.
export type PreorderRow = {
  id: string;
  source: RowSource;
  code: string; // SKU
  ean?: string | null;
  name: string;
  variantLabel?: string | null; // "fin / model / size" column
  size?: string | null;
  tag?: RowTag;
  rrp?: number | null; // RRP — the recommended retail price, GROSS. Reference only: shown, never charged
  partnerPrice?: number | null; // partner price — NET, excl. VAT. What EVERYONE orders at (VAT added for individuals)
  discountedPrice?: number | null; // manually discounted partner price (net) — beats partnerPrice when set
  image?: string | null;
  order: number;
  // Not in the DEFAULT assortment: visible only where a market / customer rule
  // exposes it (see CommercialConfig.exposedIds). Undefined = normal row.
  restricted?: boolean;
  // MK tax code captured at resolve/reprice time so a submission can be pushed to
  // Metakocka without re-reading product prices.
  taxCode?: string | null;
  // Where the effective unit price came from. Set by the resolver only — never stored.
  priceSource?: "sheet" | "manual" | "book" | "fallback";
  // No price at all (no partner / discounted price and no RRP to fall back on):
  // shown, but cannot be ordered. Set by the resolver only — never stored.
  unpriced?: boolean;
};

export type PreorderGroup = {
  id: string;
  name: string;
  order: number;
  // Snapshot of the source parent product, powering the Shopify-like guided view.
  parentCode?: string | null;
  description?: string | null;
  images?: string[];
  rows: PreorderRow[];
};

// A volume-discount tier on a tab: reach `minAmount` of ordered value across the WHOLE
// order (every tab together) and every line in this tab gets `discountPct` off. The
// ladder (thresholds + percentages) is per tab, the amount that unlocks it is the full
// order. Tiers never stack — the single highest threshold the order subtotal reaches
// is the one that applies. Thresholds are compared against the net subtotal exactly as
// the customer sees it — partner prices excl. VAT, in the campaign currency.
export type PreorderTier = {
  id: string;
  name: string; // what the partner is told they reached, e.g. "Gold"
  minAmount: number; // qualify at or above this ORDER subtotal
  discountPct: number; // 0–100, off every line in the tab
};

export type PreorderTab = {
  id: string;
  name: string;
  order: number;
  discountNote?: string | null; // free-text discount hint (mirrors the Terms families)
  tiers?: PreorderTier[]; // volume discount ladder for this tab
  tiersLocked?: boolean; // "Copy to all tabs" from another tab leaves this ladder alone
  groups: PreorderGroup[];
};

// One row in the campaigns list.
export type PreorderCampaignSummary = {
  id: string;
  title: string;
  season?: string | null;
  currency: string;
  status: CampaignStatus;
  deadline?: string | null; // ISO
  tabCount: number;
  rowCount: number;
  submissionCount: number;
  marketCount?: number;
  customerRuleCount?: number;
  updatedAt?: string | null;
};

// Full campaign (sheet) — builder + fill both read this.
export type PreorderCampaign = {
  id: string;
  title: string;
  season?: string | null;
  currency: string;
  status: CampaignStatus;
  deadline?: string | null; // ISO
  // Metakocka price-list titles feeding the RRP / partner price columns when
  // catalogue products are added or repriced.
  rrpPricelist?: string | null;
  partnerPricelist?: string | null;
  tabs: PreorderTab[];
  // How THIS customer is priced (kind, VAT; the basis is always the partner price —
  // "rrp" only on a legacy snapshot). Set by the effective-campaign resolver and
  // restored from a submission's snapshot — never stored on the campaign. Absent on
  // the admin's raw sheet (builder), which prices without VAT.
  pricing?: PricingContext | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

// ── Configuration inheritance (campaign default → market/country → customer) ──
export type ConfigSource = "campaign" | "market" | "customer";

// A layer of commercial settings. Every field ABSENT (undefined) = inherit from the
// layer below. Presence — not truthiness — means override: `tiersByTab` with an empty
// ladder = "no volume discounts on this tab", `hiddenIds: []` = "hide nothing here".
export type CommercialConfig = {
  partnerPricelist?: string | null; // MK price-list title (same key as campaign.partnerPricelist)
  currency?: string | null;
  deadline?: string | null; // ISO; display-only
  note?: string | null; // customer-facing note shown on the fill page
  minOrderAmount?: number | null; // net; enforced at customer submit when > 0
  hiddenIds?: string[]; // tab / group / row ids removed from the assortment
  exposedIds?: string[]; // tab / group / row ids added back (incl. `restricted` rows)
  tiersByTab?: { tabId: string; tiers: PreorderTier[] }[];
  // VAT policy of the layer (lib/pricing.ts VatPolicy): how consumers' VAT is found
  // (country rates / exempt / one fixed rate) and whether companies are charged too.
  vatMode?: VatMode | null; // null = country rates
  vatRate?: number | null; // the rate for `fixed`
  vatCompanies?: boolean | null; // true = charge VAT to companies (default: zero-rated)
};

export const COMMERCIAL_CONFIG_KEYS = [
  "partnerPricelist",
  "currency",
  "deadline",
  "note",
  "minOrderAmount",
  "hiddenIds",
  "exposedIds",
  "tiersByTab",
  "vatMode",
  "vatRate",
  "vatCompanies",
] as const satisfies readonly (keyof CommercialConfig)[];

export type MarketColor = "sky" | "violet" | "amber" | "rose" | "emerald" | "indigo" | "fuchsia" | "teal";
export const MARKET_COLOR_KEYS: MarketColor[] = ["sky", "violet", "amber", "rose", "emerald", "indigo", "fuchsia", "teal"];

// A named geographic market inside ONE campaign: a set of countries + a config layer.
// Who a market is for. A partner is a "business" when Metakocka carries a tax id
// for it, otherwise a "person" (lib/mk-customers.ts customerKind).
export type MarketKind = CustomerKind;
export const MARKET_KINDS: readonly MarketKind[] = ["business", "person"];

// A market matches a partner when its countries (if any) contain the partner's
// country AND its kinds (if any) contain the partner's kind. Markets are ordered
// by priority — campaign.markets[0] is checked first and the first match wins —
// so one partner may satisfy several markets. A market with neither countries
// nor kinds only gets the customers pinned to it by hand.
export type PreorderMarket = {
  id: string;
  name: string;
  color: MarketColor;
  countries: string[]; // ISO 3166-1 alpha-2; empty = any country
  kinds?: MarketKind[]; // empty / absent = any kind
  config: CommercialConfig;
  updatedAt?: string | null;
};

export function marketMatches(m: Pick<PreorderMarket, "countries" | "kinds">, iso: string | null, kind: MarketKind | null): boolean {
  const kinds = m.kinds ?? [];
  if (m.countries.length === 0 && kinds.length === 0) return false;
  if (m.countries.length > 0 && (!iso || !m.countries.some((c) => c.toUpperCase() === iso.toUpperCase()))) return false;
  if (kinds.length > 0 && (!kind || !kinds.includes(kind))) return false;
  return true;
}

// A customer-specific rule: manual placement + a config layer that beats the market.
export type CustomerRule = {
  partnerMkId: string;
  partnerName: string;
  marketId?: string | null; // manual market assignment (beats the country lookup)
  countryIso?: string | null; // manual country (when MK's country is missing/unresolvable)
  config: CommercialConfig;
  note?: string | null; // internal admin note
  updatedAt?: string | null;
  updatedBy?: string | null;
};

// NET partner prices of the sheet's products in ONE non-default MK price list,
// refreshed on demand (an array, not a map — product codes can contain ".").
export type PriceBookEntry = { code: string; net: number | null; taxCode?: string | null };
export type PriceBook = {
  pricelist: string;
  currency?: string | null;
  fetchedAt?: string | null;
  entries: PriceBookEntry[];
  missing: number;
};

// The ADMIN view of a campaign: the lean sheet plus its inheritance configuration.
// Kept as a separate type so the portal/effective views structurally cannot carry it.
export type PreorderCampaignAdmin = PreorderCampaign & {
  markets: PreorderMarket[];
  customerRules: CustomerRule[];
  priceBooks: PriceBook[];
  // Per-country VAT rates that beat the global settings for THIS campaign only.
  vatOverrides: VatOverride[];
};

// ── Effective campaign (what ONE partner is allowed to see / order) ──
export type EffectiveSources = {
  pricelist: ConfigSource;
  currency: ConfigSource;
  deadline: ConfigSource;
  note: ConfigSource;
  minOrderAmount: ConfigSource;
  vat: ConfigSource; // which layer set the VAT policy
  tiers: Record<string, ConfigSource>; // per tabId
};

export type EffectiveMeta = {
  partnerMkId: string;
  countryIso: string | null;
  countrySource: "mk" | "manual" | "home-fallback" | null;
  market: { id: string; name: string; color: MarketColor } | null;
  marketSource: "country" | "manual" | null;
  hasCustomerRule: boolean;
  sources: EffectiveSources;
  minOrderAmount: number | null;
  note: string | null;
  assortment: {
    hidden: number;
    exposed: number;
    restrictedExposed: number;
    hiddenBy: Partial<Record<ConfigSource, number>>;
  };
  pricing: { pricelist: string | null; fromBook: number; fallback: number; manual: number; ctx: PricingContext; vatPolicy: VatPolicy };
  warnings: string[]; // e.g. "price-book-missing:VIP 2027", "currency-mismatch:CHF vs EUR", "vat-missing:DE"
};

// Structurally a PreorderCampaign (tabs filtered, prices/tiers overlaid) so the
// pricing engine below and every fill component work on it unchanged.
export type EffectiveCampaign = PreorderCampaign & { effective: EffectiveMeta };

// The customer's view of their effective campaign: the resolved sheet plus only the
// customer-facing settings (no price-list names, sources or warnings).
export type PortalCampaign = Omit<PreorderCampaign, "partnerPricelist" | "rrpPricelist" | "createdBy"> & {
  effective: { note: string | null; minOrderAmount: number | null };
};

// The Terms-tab partner details captured on a submission (prefilled from Metakocka).
export type PreorderTerms = {
  invoiceAddress?: string;
  shippingAddress?: string;
  country?: string;
  phone?: string;
  deliveryDate?: string | null; // ISO date
  comment?: string;
};

export type SubmissionLine = {
  rowId: string;
  code: string;
  qty: number;
  // admin fulfilment (legacy review flow)
  confirmedQty?: number | null;
  lineStatus?: LineStatus;
};

// `amount` is the line sum at partner prices (net, excl. VAT; a legacy RRP-basis
// snapshot: gross); `discount` is the Σ of the per-tab volume discounts earned; `net`
// is `amount − discount` — the payable amount BEFORE VAT (the VAT-inclusive figure
// lives in the snapshot's `pricing.totals`). Both are absent on submissions saved before
// volume discounts existed — read them through totalsNet()/totalsDiscount().
export type PreorderSubmissionTotals = {
  qty: number;
  amount: number;
  discount?: number;
  net?: number;
};

// The Metakocka sales order currently linked to this submission (the REFERENCE —
// created at customer submit, or by an admin push on legacy submissions).
export type SalesOrderRef = {
  mkId: string;
  countCode: string;
  totalPrice?: string | null;
  createdAt?: string | null; // ISO
  createdBy?: string | null;
};

// ── MK order registration lifecycle ──
// Separate from SalesOrderRef on purpose: the reference only exists once an order
// does; the sync state tracks the attempt (pending → created | failed).
export type MkOrderState = "pending" | "created" | "failed";

export type MkOrderSync = {
  state: MkOrderState;
  buyerOrder: string; // the idempotency key sent as MK `buyer_order`
  attempts: number;
  lastError?: string | null;
  lastAttemptAt?: string | null;
  lockedAt?: string | null;
  // Cheap summary of the live MK order from the last time an admin looked at it
  // (lets list pages show allocation without an MK call per row).
  lastSeen?: { at: string; sumAll?: string | null; statusDesc?: string | null; lineQty: number; hash: string } | null;
};

// An MK order that used to be linked to this submission (admin unlocked → resubmit).
export type DetachedOrderRef = {
  mkId: string;
  countCode: string;
  buyerOrder?: string | null;
  detachedAt: string;
  detachedBy?: string | null;
  deletedInMk: boolean;
  reason?: string | null;
};

// Deterministic idempotency key. MK's `buyer_order` is `char, 30`: "T4A" + 24-hex
// ObjectId + "." + revision ⇒ 29–30 chars for revisions up to 99.
export const PREORDER_MARKER = /^T4A[0-9a-f]{24}\.\d{1,2}$/;

export function buyerOrderKey(submissionId: string, revision: number): string {
  const rev = Math.max(1, Math.floor(revision));
  if (rev > 99) throw new Error(`preorder revision ${rev} exceeds the buyer_order length budget`);
  return `T4A${submissionId}.${rev}`;
}

// ── Commercial snapshot (what the customer agreed to, frozen at submit) ──
export type SnapshotLine = {
  rowId: string;
  code: string;
  name: string;
  variantLabel?: string | null;
  image?: string | null;
  tabId: string;
  tabName: string;
  groupId: string;
  groupName: string;
  qty: number;
  unitPrice: number; // the USED unit price (net partner price; gross RRP on a legacy snapshot), before volume discounts
  rrp?: number | null; // gross RRP as shown (reference)
  partnerPrice?: number | null; // net partner price as shown
  taxCode?: string | null; // legacy MK tax code; lines now carry tax_factor
  priceSource: NonNullable<PreorderRow["priceSource"]>;
  // Frozen VAT arithmetic of the line (lib/pricing.ts priceLine). Absent on snapshots
  // taken before VAT support.
  tierPct?: number | null;
  unitNet?: number | null;
  unitVat?: number | null;
  unitGross?: number | null;
  lineNet?: number | null;
  lineVat?: number | null;
  lineGross?: number | null;
};

// How the customer was priced at submit — customer type, country, the VAT rate and
// where it came from, and the order's net / VAT / gross. Frozen: later VAT or price
// changes never touch it.
export type SnapshotPricing = {
  kind: CustomerKind;
  basis: PriceBasis;
  countryIso: string | null;
  vatRate: number;
  vatSource: VatSource;
  // Metakocka tax code for the rate at submit time (VAT settings → tax codes); null
  // when none was configured — registration then looks the settings up again.
  mkTaxCode?: string | null;
  totals: { net: number; vat: number; gross: number };
};

export type CommercialSnapshot = {
  resolvedAt: string;
  countryIso: string | null;
  market: { id: string; name: string } | null;
  marketSource: "country" | "manual" | null;
  partnerPricelist: string | null;
  currency: string;
  deadline: string | null;
  note: string | null;
  sources: EffectiveSources;
  tabs: { tabId: string; tabName: string; tiers: PreorderTier[] }[]; // only tabs with lines
  lines: SnapshotLine[]; // only qty > 0
  pricing: SnapshotPricing | null; // null only on snapshots taken before VAT support
};

// ── Allocation: the live MK order compared to the request ──
export type AllocationLineStatus = "full" | "partial" | "removed" | "added" | "increased";

export type AllocationLine = {
  code: string;
  name: string;
  requestedQty: number;
  allocatedQty: number;
  unitPriceWithTax: number | null;
  lineTotal: number | null;
  status: AllocationLineStatus;
  shipped?: string;
};

export type AllocationView = {
  mkId: string;
  countCode: string;
  fetchedAt: string;
  currency: string | null;
  mkStatusDesc: string | null;
  sumAll: string | null;
  requestedQty: number;
  allocatedQty: number;
  lines: AllocationLine[];
  changedSincePublish: boolean;
};

export type AllocationResult =
  | { state: "ok"; allocation: AllocationView }
  | { state: "missing" }
  | { state: "unavailable"; error: string }
  | { state: "none" };

// Customer-facing registration state — no MK identifiers, no error text.
export type PortalRegistration = { state: "none" | "pending" | "failed" | "done"; canRetry: boolean };

// Display stage derived from status + registration + publication.
export type SubmissionStage =
  | "draft"
  | "submitted"
  | "registering"
  | "registration-failed"
  | "registered"
  | "published";

// One partner's response to a campaign (ADMIN view).
export type PreorderSubmission = {
  id: string;
  campaignId: string;
  partnerMkId: string;
  partnerName: string;
  partnerEmail?: string;
  status: SubmissionStatus;
  terms: PreorderTerms;
  lines: SubmissionLine[];
  totals?: PreorderSubmissionTotals;
  confirmedTotals?: PreorderSubmissionTotals;
  submittedAt?: string | null;
  updatedAt?: string | null;
  // A pending customer request to unlock this (submitted) preorder for edits.
  unlockRequest?: { note: string; requestedAt: string | null } | null;
  // The Metakocka sales order currently linked to this submission, if any.
  mkSalesOrder?: SalesOrderRef | null;
  // Registration state of that order (absent on legacy submissions pushed by hand).
  mkOrder?: MkOrderSync | null;
  mkSalesOrderHistory?: DetachedOrderRef[];
  // Whether the current MK order is visible to the customer (their preorder page +
  // their Documents / Orders list).
  resultPublishedToCustomer?: boolean;
  resultPublishedAt?: string | null;
  resultPublishedBy?: string | null;
  publishedHash?: string | null;
  // Frozen commercial configuration + priced lines as of submit.
  snapshot?: CommercialSnapshot | null;
  submitRevision?: number;
  firstSubmittedAt?: string | null;
  submitSource?: "customer" | "admin" | null;
  submittedBy?: string | null;
  stage?: SubmissionStage;
};

// What the CUSTOMER sees of their own submission: no MK identifiers, no integration
// error text, no admin fulfilment fields. Built by toPortalSubmissionView().
export type PortalSubmission = Omit<
  PreorderSubmission,
  "mkSalesOrder" | "mkOrder" | "mkSalesOrderHistory" | "publishedHash" | "confirmedTotals" | "resultPublishedBy"
> & {
  registration: PortalRegistration;
  published: boolean;
};

export function submissionStage(
  s: Pick<PreorderSubmission, "status" | "mkOrder" | "mkSalesOrder" | "resultPublishedToCustomer">,
): SubmissionStage {
  if (s.status === "draft") return "draft";
  if (s.resultPublishedToCustomer && s.mkSalesOrder?.mkId) return "published";
  if (s.mkOrder) {
    if (s.mkOrder.state === "created") return "registered";
    if (s.mkOrder.state === "failed") return "registration-failed";
    return "registering";
  }
  // Legacy: an order pushed by hand counts as registered (and stays customer-visible).
  if (s.mkSalesOrder?.mkId) return "registered";
  return "submitted";
}

// Legacy submissions (pushed manually before immediate registration existed) carry a
// reference but no sync state; they were always visible in the customer's Documents.
export function isLegacyMkOrder(s: Pick<PreorderSubmission, "mkOrder" | "mkSalesOrder">): boolean {
  return !!s.mkSalesOrder?.mkId && !s.mkOrder;
}

// The MK order is effectively visible to the customer through Documents.
export function isOrderCustomerVisible(
  s: Pick<PreorderSubmission, "mkOrder" | "mkSalesOrder" | "resultPublishedToCustomer">,
): boolean {
  if (!s.mkSalesOrder?.mkId) return false;
  if (isLegacyMkOrder(s)) return true;
  return s.mkOrder?.state === "created" && !!s.resultPublishedToCustomer;
}

// A partner who has unlocked (been granted access to) a campaign via its invite link.
export type PreorderAccessSummary = {
  partnerMkId: string;
  partnerName: string;
  partnerEmail?: string;
  grantedAt?: string | null;
  countryIso?: string | null;
};

// Admin overview list row (per partner response).
export type PreorderSubmissionSummary = {
  id: string;
  partnerMkId: string;
  partnerName: string;
  partnerEmail?: string;
  status: SubmissionStatus;
  totals: PreorderSubmissionTotals;
  confirmedTotals: PreorderSubmissionTotals;
  submittedAt?: string | null;
  updatedAt?: string | null;
  hasUnlockRequest?: boolean;
  stage: SubmissionStage;
  mkState: MkOrderState | "legacy" | null;
  mkCountCode?: string | null;
  mkId?: string | null;
  published: boolean;
  allocatedQty?: number | null; // from mkOrder.lastSeen
  countryIso?: string | null;
  marketName?: string | null;
  failedError?: string | null;
};

// ── Labels ──────────────────────────────────────────────────────────────────

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  confirmed: "Confirmed",
  closed: "Closed",
};

export const SUBMISSION_STAGE_LABELS: Record<SubmissionStage, string> = {
  draft: "Draft",
  submitted: "Submitted",
  registering: "Registering",
  "registration-failed": "Registration failed",
  registered: "Registered",
  published: "Published",
};

export const CONFIG_SOURCE_LABELS: Record<ConfigSource, string> = {
  campaign: "Campaign default",
  market: "Market",
  customer: "Customer override",
};

export const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  backorder: "Backorder",
  cancelled: "Cancelled",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

export function parseCampaignStatus(v?: string | null): CampaignStatus | null {
  switch ((v ?? "").toLowerCase()) {
    case "draft":
      return "draft";
    case "open":
      return "open";
    case "closed":
      return "closed";
    default:
      return null;
  }
}

// The unit price a customer orders a row at, in their price basis (lib/pricing.ts).
export function rowUnitPrice(row: Pick<PreorderRow, "discountedPrice" | "partnerPrice" | "rrp">, basis: PriceBasis = "partner"): number {
  return unitPriceFor(row, basis);
}

// The basis a campaign object prices in (its resolver-set context, else partner).
export function campaignBasis(campaign: Pick<PreorderCampaign, "pricing"> | null | undefined): PriceBasis {
  return campaign?.pricing?.basis ?? "partner";
}

// Flatten every row of a campaign, keeping its tab/group context. Used for totals,
// the grid, and mapping submission lines back to rows.
export function flattenRows(
  campaign: Pick<PreorderCampaign, "tabs">,
): { tab: PreorderTab; group: PreorderGroup; row: PreorderRow }[] {
  const out: { tab: PreorderTab; group: PreorderGroup; row: PreorderRow }[] = [];
  for (const tab of campaign.tabs) {
    for (const group of tab.groups) {
      for (const row of group.rows) out.push({ tab, group, row });
    }
  }
  return out;
}

// ── Volume discount tiers & totals ───────────────────────────────────────────
// The tier helpers (activeTiers / tierForAmount / nextTierAfter) and PreorderTabTotal
// are re-exported from lib/pricing.ts above; the engine below wraps priceOrder().

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type PricedCampaign = Pick<PreorderCampaign, "tabs" | "pricing">;

// Per-tab totals (summary panel, tier banners, review modal).
export function computeTabTotals(campaign: PricedCampaign, quantities: Record<string, number>): PreorderTabTotal[] {
  return priceOrder(campaign, (row) => quantities[row.id] || 0).tabs;
}

// The full priced order — per-tab totals, per-line VAT arithmetic and the order's
// net / VAT / gross — for a quantity map ({ rowId: qty }).
export function computePricedOrder(campaign: PricedCampaign, quantities: Record<string, number>): PricedOrder {
  return priceOrder(campaign, (row) => quantities[row.id] || 0);
}

// Per-tab totals over the lines an admin has CONFIRMED — the tier is re-evaluated on
// what is actually being ordered, so a cancelled line can drop the tab out of a tier.
export function computeConfirmedTabTotals(
  campaign: PricedCampaign,
  quantities: Record<string, number>,
  confirmed: Record<string, { confirmedQty: number | null; lineStatus: LineStatus }>,
): PreorderTabTotal[] {
  return priceOrder(campaign, (row) => {
    const info = confirmed[row.id];
    if (!info || info.lineStatus !== "confirmed") return 0;
    return info.confirmedQty ?? quantities[row.id] ?? 0;
  }).tabs;
}

export function sumTabTotals(rows: PreorderTabTotal[]): PreorderSubmissionTotals {
  return sumTabTotalsImpl(rows);
}

// Σ qty, Σ qty×price and the tab volume discounts over a quantity map ({ rowId: qty }).
// The single shared total computation used client-side (live summary) and server-side
// (snapshot). `amount` is the line sum in the customer's basis; `net` is what they pay.
export function computeTotals(campaign: PricedCampaign, quantities: Record<string, number>): PreorderSubmissionTotals {
  return computePricedOrder(campaign, quantities).totals;
}

// Value/qty of the lines an admin has CONFIRMED. `confirmed` maps rowId → its confirmed
// state ({ confirmedQty, lineStatus }); only lineStatus === "confirmed" lines count, using
// confirmedQty (falling back to the ordered qty when the admin left it blank).
export function computeConfirmedTotals(
  campaign: PricedCampaign,
  quantities: Record<string, number>,
  confirmed: Record<string, { confirmedQty: number | null; lineStatus: LineStatus }>,
): PreorderSubmissionTotals {
  return sumTabTotals(computeConfirmedTabTotals(campaign, quantities, confirmed));
}

// Payable value of a totals snapshot. Older submissions (saved before volume discounts
// existed) carry no `net`, so they fall back to the gross amount.
export function totalsNet(t?: PreorderSubmissionTotals | null): number {
  if (!t) return 0;
  return t.net ?? t.amount ?? 0;
}

export function totalsDiscount(t?: PreorderSubmissionTotals | null): number {
  return t?.discount ?? 0;
}

// Does this campaign use volume discounts at all? Gates the tier UI everywhere.
export function campaignHasTiers(campaign: Pick<PreorderCampaign, "tabs">): boolean {
  return campaign.tabs.some((t) => (t.tiers ?? []).some((x) => Number.isFinite(x?.discountPct) && x.discountPct > 0 && Number.isFinite(x?.minAmount) && x.minAmount >= 0));
}

// ── Frozen submissions ────────────────────────────────────────────────────────
// Rebuild a PreorderCampaign-shaped object from a commercial snapshot: only the
// ordered rows, at the snapshot's prices, with the snapshot's tier ladders. Lets the
// grid / summary components render a submitted preorder exactly as agreed, even after
// the live sheet changed. The used unit price goes into the slot of the snapshot's
// basis (partner net → `partnerPrice`, RRP gross → `rrp`) and the pricing context is
// restored, so rowUnitPrice(row, basis) / priceOrder() yield the snapshot figures.
export function campaignFromSnapshot(
  base: Pick<PreorderCampaign, "id" | "title" | "season" | "status">,
  snap: CommercialSnapshot,
): PreorderCampaign {
  const tabsById = new Map<string, PreorderTab>();
  const tabOrder: string[] = [];
  const tierByTab = new Map(snap.tabs.map((t) => [t.tabId, t]));
  const basis: PriceBasis = snap.pricing?.basis ?? "partner";
  for (const line of snap.lines) {
    let tab = tabsById.get(line.tabId);
    if (!tab) {
      const meta = tierByTab.get(line.tabId);
      tab = {
        id: line.tabId,
        name: meta?.tabName ?? line.tabName,
        order: tabOrder.length,
        tiers: meta?.tiers ?? [],
        groups: [],
      };
      tabsById.set(line.tabId, tab);
      tabOrder.push(line.tabId);
    }
    let group = tab.groups.find((g) => g.id === line.groupId);
    if (!group) {
      group = { id: line.groupId, name: line.groupName, order: tab.groups.length, rows: [] };
      tab.groups.push(group);
    }
    group.rows.push({
      id: line.rowId,
      source: "catalogue",
      code: line.code,
      name: line.name,
      variantLabel: line.variantLabel ?? null,
      image: line.image ?? null,
      rrp: basis === "rrp" ? line.unitPrice : (line.rrp ?? null),
      partnerPrice: basis === "partner" ? line.unitPrice : (line.partnerPrice ?? null),
      discountedPrice: null,
      taxCode: line.taxCode ?? null,
      priceSource: line.priceSource,
      order: group.rows.length,
    });
  }
  return {
    id: base.id,
    title: base.title,
    season: base.season ?? null,
    status: base.status,
    currency: snap.currency,
    deadline: snap.deadline,
    partnerPricelist: snap.partnerPricelist,
    rrpPricelist: null,
    tabs: tabOrder.map((id) => tabsById.get(id)!),
    pricing: snap.pricing
      ? {
          kind: snap.pricing.kind,
          basis: snap.pricing.basis,
          countryIso: snap.pricing.countryIso,
          vat: { rate: snap.pricing.vatRate, source: snap.pricing.vatSource },
        }
      : null,
  };
}

// Quantity map ({ rowId: qty }) of a snapshot.
export function snapshotQuantities(snap: CommercialSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of snap.lines) out[l.rowId] = l.qty;
  return out;
}
