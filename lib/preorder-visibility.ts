import "server-only";

// lib/preorder-visibility.ts
//
// Which Metakocka sales orders a CUSTOMER may see in their Documents / Orders. A
// preorder submission creates its MK order immediately, but that order stays private
// until an admin publishes it (`resultPublishedToCustomer`). The rule is applied at
// the server layer (list, detail and PDF routes) — never by hiding rows in the UI.
//
// Two signals, belt and braces:
//   1. Our records: unpublished current orders + every detached (superseded) order.
//   2. The MK marker: any sales order carrying our `buyer_order` key (T4A<id>.<rev>)
//      is a preorder order; it is visible only when it is the currently PUBLISHED order
//      of a submission. Covers orphans (submission deleted) and lost links.
// Legacy hand-pushed orders (no `mkOrder`) never match ⇒ unchanged behaviour.

import { connectDB, PreorderSubmission } from "@/lib/preorder";
import type { DocDetail, DocSummary, MkPartner } from "@/types/documents";
import { PREORDER_MARKER } from "@/types/preorder";

export type PreorderVisibility = {
  mayView: (d: Pick<DocSummary, "mkId" | "buyerOrder" | "kind">) => boolean;
  hidden: ReadonlySet<string>;
  visible: ReadonlySet<string>;
};

export async function preorderVisibility(partnerMkId: string): Promise<PreorderVisibility> {
  await connectDB();
  const subs = await PreorderSubmission.find(
    { partnerMkId, $or: [{ "mkOrder.state": "created" }, { "mkSalesOrderHistory.0": { $exists: true } }] },
    { "mkSalesOrder.mkId": 1, "mkOrder.state": 1, mkSalesOrderHistory: 1, resultPublishedToCustomer: 1 },
  )
    .lean()
    .exec();

  const visible = new Set<string>();
  const hidden = new Set<string>();
  for (const s of subs) {
    for (const h of s.mkSalesOrderHistory ?? []) if (h.mkId) hidden.add(h.mkId);
    const mkId = s.mkSalesOrder?.mkId;
    if (mkId && s.mkOrder?.state === "created") {
      if (s.resultPublishedToCustomer) visible.add(mkId);
      else hidden.add(mkId);
    }
  }
  return {
    visible,
    hidden,
    mayView: (d) => {
      if (d.kind !== "order") return true;
      if (hidden.has(d.mkId)) return false;
      if (d.buyerOrder && PREORDER_MARKER.test(d.buyerOrder) && !visible.has(d.mkId)) return false;
      return true;
    },
  };
}

export async function filterCustomerVisible(partner: Pick<MkPartner, "mkId">, items: DocSummary[]): Promise<DocSummary[]> {
  if (!items.some((d) => d.kind === "order")) return items;
  const vis = await preorderVisibility(partner.mkId);
  return items.filter((d) => vis.mayView(d));
}

// Ownership FIRST (the document must belong to this partner), then preorder visibility.
export async function customerMayViewDocument(partner: Pick<MkPartner, "mkId">, detail: DocDetail | null): Promise<boolean> {
  if (!detail || detail.partner?.mkId !== partner.mkId) return false;
  if (detail.kind !== "order") return true;
  const vis = await preorderVisibility(partner.mkId);
  return vis.mayView(detail);
}

// Admin annotation: which listed orders belong to a preorder submission (and whether
// the customer can see them). Keyed by mkId.
export type PreorderOrderAnnotation = { submissionId: string; campaignId: string; published: boolean; detached: boolean };

export async function annotatePreorderOrders(items: DocSummary[]): Promise<Record<string, PreorderOrderAnnotation>> {
  const ids = items.filter((d) => d.kind === "order").map((d) => d.mkId);
  if (ids.length === 0) return {};
  await connectDB();
  const subs = await PreorderSubmission.find(
    { $or: [{ "mkSalesOrder.mkId": { $in: ids } }, { "mkSalesOrderHistory.mkId": { $in: ids } }] },
    { campaignId: 1, "mkSalesOrder.mkId": 1, "mkOrder.state": 1, mkSalesOrderHistory: 1, resultPublishedToCustomer: 1 },
  )
    .lean()
    .exec();
  const out: Record<string, PreorderOrderAnnotation> = {};
  for (const s of subs) {
    const base = { submissionId: String(s._id), campaignId: String(s.campaignId) };
    if (s.mkSalesOrder?.mkId) {
      const legacy = !s.mkOrder?.state;
      out[s.mkSalesOrder.mkId] = { ...base, published: legacy || (s.mkOrder?.state === "created" && !!s.resultPublishedToCustomer), detached: false };
    }
    for (const h of s.mkSalesOrderHistory ?? []) if (h.mkId) out[h.mkId] = { ...base, published: false, detached: true };
  }
  // Orphans (submission deleted) are still recognisable by the marker.
  for (const d of items) {
    if (d.kind === "order" && !out[d.mkId] && d.buyerOrder && PREORDER_MARKER.test(d.buyerOrder)) {
      out[d.mkId] = { submissionId: "", campaignId: "", published: false, detached: true };
    }
  }
  return out;
}
