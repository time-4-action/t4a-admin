import "server-only";

// Server-side data helpers for the Preorder module: connect to Mongo and map the
// mongoose documents (models/preorder-*.ts) to the wire views (types/preorder.ts).
// Shared by both the admin (/api/admin/preorder) and portal (/api/portal/preorder)
// route groups.

import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { PreorderCampaign, type IPreorderCampaign } from "@/models/preorder-campaign";
import {
  PreorderSubmission,
  type IPreorderSubmission,
} from "@/models/preorder-submission";
import type {
  PreorderCampaign as CampaignView,
  PreorderCampaignSummary,
  PreorderSubmission as SubmissionView,
  PreorderSubmissionSummary,
  PreorderTab,
} from "@/types/preorder";

export { connectDB };

function iso(d?: Date | null): string | null {
  return d ? new Date(d).toISOString() : null;
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
    totals: { qty: doc.totals?.qty ?? 0, amount: doc.totals?.amount ?? 0 },
    confirmedTotals: { qty: doc.confirmedTotals?.qty ?? 0, amount: doc.confirmedTotals?.amount ?? 0 },
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
    totals: { qty: doc.totals?.qty ?? 0, amount: doc.totals?.amount ?? 0 },
    confirmedTotals: { qty: doc.confirmedTotals?.qty ?? 0, amount: doc.confirmedTotals?.amount ?? 0 },
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

export { PreorderCampaign, PreorderSubmission };
