// types/preorder.ts
//
// Shared shapes for the Preorder module (admin sheet builder + partner fill portal +
// admin review). These are the WIRE views exchanged between the API routes and the
// client — ids are strings, dates are ISO strings. The MongoDB documents that back
// them live in models/preorder-campaign.ts and models/preorder-submission.ts; keep
// the field names aligned. Framework-agnostic on purpose (imported client & server).

export type CampaignStatus = "draft" | "open" | "closed";
export type SubmissionStatus = "draft" | "submitted" | "confirmed" | "closed";

// Per-line admin fulfilment state ("how they are filled").
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
  rrp?: number | null; // RRP inc. VAT
  partnerPrice?: number | null; // partner price excl. VAT
  discountedPrice?: number | null; // discounted partner price
  image?: string | null;
  order: number;
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

// A volume-discount tier on a tab: reach `minAmount` of ordered value INSIDE that tab
// and every line in it gets `discountPct` off. Tiers are per tab and never stack — the
// single highest threshold the tab subtotal reaches is the one that applies. Thresholds
// are compared against the subtotal exactly as the partner sees it (gross, incl. VAT,
// in the campaign currency).
export type PreorderTier = {
  id: string;
  name: string; // what the partner is told they reached, e.g. "Gold"
  minAmount: number; // qualify at or above this tab subtotal
  discountPct: number; // 0–100, off every line in the tab
};

export type PreorderTab = {
  id: string;
  name: string;
  order: number;
  discountNote?: string | null; // free-text discount hint (mirrors the Terms families)
  tiers?: PreorderTier[]; // volume discount ladder for this tab
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
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
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
  // admin fulfilment (set during review)
  confirmedQty?: number | null;
  lineStatus?: LineStatus;
};

// `amount` is the gross line sum; `discount` is the Σ of the per-tab volume discounts
// earned; `net` is what the partner actually pays. Both are absent on submissions saved
// before volume discounts existed — read them through totalsNet()/totalsDiscount().
export type PreorderSubmissionTotals = {
  qty: number;
  amount: number;
  discount?: number;
  net?: number;
};

// A Metakocka sales order created from this submission (once pushed by an admin).
export type SalesOrderRef = {
  mkId: string;
  countCode: string;
  totalPrice?: string | null;
  createdAt?: string | null; // ISO
  createdBy?: string | null;
};

// One partner's response to a campaign.
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
  // The Metakocka sales order created from this submission, if any.
  mkSalesOrder?: SalesOrderRef | null;
};

// A partner who has unlocked (been granted access to) a campaign via its invite link.
export type PreorderAccessSummary = {
  partnerMkId: string;
  partnerName: string;
  partnerEmail?: string;
  grantedAt?: string | null;
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

// The price a partner orders at (falls back through the price snapshot).
export function rowUnitPrice(row: Pick<PreorderRow, "discountedPrice" | "partnerPrice" | "rrp">): number {
  return row.discountedPrice ?? row.partnerPrice ?? row.rrp ?? 0;
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

// ── Volume discount tiers ────────────────────────────────────────────────────
// A tab's tiers turn its subtotal into a discount: order enough within the tab and
// every line in it drops by the tier's percentage. Tiers never stack — exactly one
// (the highest threshold reached) applies.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// The usable tiers of a tab, cleaned and sorted by threshold ascending. A tier with a
// non-positive percentage is inert (it would discount nothing) and is dropped here so
// every consumer sees the same list.
export function activeTiers(tiers?: PreorderTier[] | null): PreorderTier[] {
  return (tiers ?? [])
    .filter(
      (t) =>
        Number.isFinite(t?.minAmount) &&
        t.minAmount >= 0 &&
        Number.isFinite(t?.discountPct) &&
        t.discountPct > 0,
    )
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

// A tab's contribution to an order, with its volume discount resolved.
export type PreorderTabTotal = {
  tabId: string;
  tabName: string;
  qty: number;
  amount: number; // gross, before the tab's volume discount
  tier: PreorderTier | null; // the tier this tab reached
  discountPct: number; // 0 when no tier applies
  discount: number; // amount × pct
  net: number; // amount − discount (what is actually payable)
  nextTier: PreorderTier | null; // the tier just out of reach
  toNextTier: number; // how much more this tab needs to reach it
};

// Shared engine behind every total: `qtyOf` decides which quantity a row contributes
// (as ordered, or only the admin-confirmed part).
function tabTotalsWith(
  campaign: Pick<PreorderCampaign, "tabs">,
  qtyOf: (row: PreorderRow) => number,
): PreorderTabTotal[] {
  return campaign.tabs.map((tab) => {
    let qty = 0;
    let amount = 0;
    for (const group of tab.groups) {
      for (const row of group.rows) {
        const q = qtyOf(row);
        if (q <= 0) continue;
        qty += q;
        amount += q * rowUnitPrice(row);
      }
    }
    amount = round2(amount);
    const tier = tierForAmount(tab.tiers, amount);
    const discountPct = tier?.discountPct ?? 0;
    const discount = round2((amount * discountPct) / 100);
    const next = nextTierAfter(tab.tiers, amount);
    return {
      tabId: tab.id,
      tabName: tab.name,
      qty,
      amount,
      tier,
      discountPct,
      discount,
      net: round2(amount - discount),
      nextTier: next,
      toNextTier: next ? round2(Math.max(0, next.minAmount - amount)) : 0,
    };
  });
}

// Per-tab totals (summary panel, tier banners, review modal).
export function computeTabTotals(
  campaign: Pick<PreorderCampaign, "tabs">,
  quantities: Record<string, number>,
): PreorderTabTotal[] {
  return tabTotalsWith(campaign, (row) => quantities[row.id] || 0);
}

// Per-tab totals over the lines an admin has CONFIRMED — the tier is re-evaluated on
// what is actually being ordered, so a cancelled line can drop the tab out of a tier.
export function computeConfirmedTabTotals(
  campaign: Pick<PreorderCampaign, "tabs">,
  quantities: Record<string, number>,
  confirmed: Record<string, { confirmedQty: number | null; lineStatus: LineStatus }>,
): PreorderTabTotal[] {
  return tabTotalsWith(campaign, (row) => {
    const info = confirmed[row.id];
    if (!info || info.lineStatus !== "confirmed") return 0;
    return info.confirmedQty ?? quantities[row.id] ?? 0;
  });
}

export function sumTabTotals(rows: PreorderTabTotal[]): PreorderSubmissionTotals {
  let qty = 0;
  let amount = 0;
  let discount = 0;
  for (const t of rows) {
    qty += t.qty;
    amount += t.amount;
    discount += t.discount;
  }
  amount = round2(amount);
  discount = round2(discount);
  return { qty, amount, discount, net: round2(amount - discount) };
}

// Σ qty, Σ qty×price and the tab volume discounts over a quantity map ({ rowId: qty }).
// The single shared total computation used client-side (live summary) and server-side
// (snapshot). `amount` stays the gross line sum; `net` is what the partner pays.
export function computeTotals(
  campaign: Pick<PreorderCampaign, "tabs">,
  quantities: Record<string, number>,
): PreorderSubmissionTotals {
  return sumTabTotals(computeTabTotals(campaign, quantities));
}

// Value/qty of the lines an admin has CONFIRMED. `confirmed` maps rowId → its confirmed
// state ({ confirmedQty, lineStatus }); only lineStatus === "confirmed" lines count, using
// confirmedQty (falling back to the ordered qty when the admin left it blank).
export function computeConfirmedTotals(
  campaign: Pick<PreorderCampaign, "tabs">,
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
  return campaign.tabs.some((t) => activeTiers(t.tiers).length > 0);
}
