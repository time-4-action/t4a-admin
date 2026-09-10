import "server-only";

// Server-side data helpers for the Preorder module: connect to Mongo and map the
// mongoose documents (models/preorder-*.ts) to the wire views (types/preorder.ts).
// Shared by both the admin (/api/admin/preorder) and portal (/api/portal/preorder)
// route groups.

import { randomBytes } from "crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { PreorderCampaign, type IPreorderCampaign } from "@/models/preorder-campaign";
import {
  PreorderSubmission,
  type IPreorderSubmission,
} from "@/models/preorder-submission";
import { PreorderAccess, type IPreorderAccess } from "@/models/preorder-access";
import type {
  PreorderCampaign as CampaignView,
  PreorderCampaignSummary,
  PreorderSubmission as SubmissionView,
  PreorderSubmissionSummary,
  PreorderAccessSummary,
  PreorderSubmissionTotals,
  PreorderTab,
  PreorderTier,
} from "@/types/preorder";

export { connectDB };

// A URL-safe secret for a campaign's invite link.
export function genShareToken(): string {
  return randomBytes(18).toString("base64url");
}

// Ensure a campaign has an invite token (backfills legacy campaigns), returning it.
export async function ensureShareToken(doc: IPreorderCampaign): Promise<string> {
  if (!doc.shareToken) {
    doc.shareToken = genShareToken();
    await doc.save();
  }
  return doc.shareToken;
}

// Whether a partner may see/fill a campaign: they hold an access grant OR already
// have a submission on it.
export async function partnerHasCampaignAccess(
  campaignId: Types.ObjectId | string,
  partnerMkId: string,
): Promise<boolean> {
  const oid = typeof campaignId === "string" ? toObjectId(campaignId) : campaignId;
  if (!oid) return false;
  const [access, sub] = await Promise.all([
    PreorderAccess.exists({ campaignId: oid, partnerMkId }),
    PreorderSubmission.exists({ campaignId: oid, partnerMkId }),
  ]);
  return !!(access || sub);
}

export function toAccessSummary(doc: IPreorderAccess): PreorderAccessSummary {
  return {
    partnerMkId: doc.partnerMkId,
    partnerName: doc.partnerName,
    partnerEmail: doc.partnerEmail,
    grantedAt: iso(doc.grantedAt),
  };
}

// Totals as the wire sees them. `net` is DERIVED, never read back from the document:
// submissions saved before volume discounts existed carry the schema default (0), which
// would otherwise read as a free order.
function totalsView(
  t?: { qty?: number; amount?: number; discount?: number; net?: number } | null,
): PreorderSubmissionTotals {
  const qty = t?.qty ?? 0;
  const amount = t?.amount ?? 0;
  const discount = t?.discount ?? 0;
  return { qty, amount, discount, net: Math.round((amount - discount) * 100) / 100 };
}

function iso(d?: Date | null): string | null {
  return d ? new Date(d).toISOString() : null;
}

// Clean the volume-discount ladder a builder sends up: keep it in range (a % outside
// 0–100 would fail schema validation and reject the whole save), give every tier an id,
// and store it sorted by threshold so every reader sees the same ladder.
export function sanitizeTiers(tiers: unknown): PreorderTier[] {
  if (!Array.isArray(tiers)) return [];
  return tiers
    .map((raw, i) => {
      const t = (raw ?? {}) as Partial<PreorderTier>;
      const minAmount = Math.max(0, Number(t.minAmount) || 0);
      const discountPct = Math.min(100, Math.max(0, Number(t.discountPct) || 0));
      return {
        id: String(t.id || `tier-${i}-${Math.random().toString(36).slice(2, 8)}`),
        name: String(t.name ?? "").trim().slice(0, 60),
        minAmount,
        discountPct,
      };
    })
    .sort((a, b) => a.minAmount - b.minAmount);
}

function countRows(tabs: PreorderTab[] | IPreorderCampaign["tabs"]): number {
  let n = 0;
  for (const t of tabs) for (const g of t.groups) n += g.rows.length;
  return n;
}

export function toCampaignView(doc: IPreorderCampaign): CampaignView {
  return {
    id: String(doc._id),
    title: doc.title,
    season: doc.season ?? null,
    currency: doc.currency,
    status: doc.status,
    deadline: iso(doc.deadline),
    rrpPricelist: doc.rrpPricelist ?? null,
    partnerPricelist: doc.partnerPricelist ?? null,
    tabs: doc.tabs as unknown as PreorderTab[],
    createdBy: doc.createdBy ?? null,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

export function toCampaignSummary(
  doc: IPreorderCampaign,
  submissionCount: number,
): PreorderCampaignSummary {
  return {
    id: String(doc._id),
    title: doc.title,
    season: doc.season ?? null,
    currency: doc.currency,
    status: doc.status,
    deadline: iso(doc.deadline),
    tabCount: doc.tabs.length,
    rowCount: countRows(doc.tabs),
    submissionCount,
    updatedAt: iso(doc.updatedAt),
  };
}

export function toSubmissionView(doc: IPreorderSubmission): SubmissionView {
  return {
    id: String(doc._id),
    campaignId: String(doc.campaignId),
    partnerMkId: doc.partnerMkId,
    partnerName: doc.partnerName,
    partnerEmail: doc.partnerEmail,
    status: doc.status,
    terms: {
      invoiceAddress: doc.terms?.invoiceAddress,
      shippingAddress: doc.terms?.shippingAddress,
      country: doc.terms?.country,
      phone: doc.terms?.phone,
      deliveryDate: iso(doc.terms?.deliveryDate),
      comment: doc.terms?.comment,
    },
    lines: doc.lines.map((l) => ({
      rowId: l.rowId,
      code: l.code,
      qty: l.qty,
      confirmedQty: l.confirmedQty ?? null,
      lineStatus: l.lineStatus,
    })),
    totals: totalsView(doc.totals),
    confirmedTotals: totalsView(doc.confirmedTotals),
    submittedAt: iso(doc.submittedAt),
    updatedAt: iso(doc.updatedAt),
    unlockRequest: doc.unlockRequestedAt
      ? { note: doc.unlockRequestNote ?? "", requestedAt: iso(doc.unlockRequestedAt) }
      : null,
    mkSalesOrder: doc.mkSalesOrder
      ? {
          mkId: doc.mkSalesOrder.mkId,
          countCode: doc.mkSalesOrder.countCode,
          totalPrice: doc.mkSalesOrder.totalPrice ?? null,
          createdAt: iso(doc.mkSalesOrder.createdAt),
          createdBy: doc.mkSalesOrder.createdBy ?? null,
        }
      : null,
  };
}

export function toSubmissionSummary(
  doc: IPreorderSubmission,
): PreorderSubmissionSummary {
  return {
    id: String(doc._id),
    partnerMkId: doc.partnerMkId,
    partnerName: doc.partnerName,
    partnerEmail: doc.partnerEmail,
    status: doc.status,
    totals: totalsView(doc.totals),
    confirmedTotals: totalsView(doc.confirmedTotals),
    submittedAt: iso(doc.submittedAt),
    updatedAt: iso(doc.updatedAt),
    hasUnlockRequest: !!doc.unlockRequestedAt,
  };
}

// Count submissions per campaign id (for the campaigns list). One grouped query.
export async function submissionCountsByCampaign(
  campaignIds: string[],
): Promise<Record<string, number>> {
  const ids = campaignIds.map(toObjectId).filter(Boolean) as Types.ObjectId[];
  if (ids.length === 0) return {};
  const rows = await PreorderSubmission.aggregate<{ _id: unknown; n: number }>([
    { $match: { campaignId: { $in: ids } } },
    { $group: { _id: "$campaignId", n: { $sum: 1 } } },
  ]);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r._id)] = r.n;
  return out;
}

export function toObjectId(id: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

export { PreorderCampaign, PreorderSubmission, PreorderAccess };
