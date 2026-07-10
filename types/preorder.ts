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

export type PreorderTab = {
  id: string;
  name: string;
  order: number;
  discountNote?: string | null; // free-text discount hint (mirrors the Terms families)
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

export type PreorderSubmissionTotals = {
  qty: number;
  amount: number;
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

// Σ qty and Σ qty×price over a quantity map ({ rowId: qty }). The single shared
// total computation used client-side (live summary) and server-side (snapshot).
export function computeTotals(
  campaign: Pick<PreorderCampaign, "tabs">,
  quantities: Record<string, number>,
): PreorderSubmissionTotals {
  let qty = 0;
  let amount = 0;
  for (const { row } of flattenRows(campaign)) {
    const q = quantities[row.id] || 0;
    if (q <= 0) continue;
    qty += q;
    amount += q * rowUnitPrice(row);
  }
  return { qty, amount };
}

// Value/qty of the lines an admin has CONFIRMED. `confirmed` maps rowId → its confirmed
// state ({ confirmedQty, lineStatus }); only lineStatus === "confirmed" lines count, using
// confirmedQty (falling back to the ordered qty when the admin left it blank).
export function computeConfirmedTotals(
  campaign: Pick<PreorderCampaign, "tabs">,
  quantities: Record<string, number>,
  confirmed: Record<string, { confirmedQty: number | null; lineStatus: LineStatus }>,
): PreorderSubmissionTotals {
  let qty = 0;
  let amount = 0;
  for (const { row } of flattenRows(campaign)) {
    const info = confirmed[row.id];
    if (!info || info.lineStatus !== "confirmed") continue;
    const c = info.confirmedQty ?? quantities[row.id] ?? 0;
    if (c <= 0) continue;
    qty += c;
    amount += c * rowUnitPrice(row);
  }
  return { qty, amount };
}

// Per-tab totals for the summary chart.
export function computeTabTotals(
  campaign: Pick<PreorderCampaign, "tabs">,
  quantities: Record<string, number>,
): { tabId: string; tabName: string; qty: number; amount: number }[] {
  return campaign.tabs.map((tab) => {
    let qty = 0;
    let amount = 0;
    for (const group of tab.groups) {
      for (const row of group.rows) {
        const q = quantities[row.id] || 0;
        if (q <= 0) continue;
        qty += q;
        amount += q * rowUnitPrice(row);
      }
    }
    return { tabId: tab.id, tabName: tab.name, qty, amount };
  });
}
