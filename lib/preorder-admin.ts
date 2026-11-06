import "server-only";

// lib/preorder-admin.ts
//
// Staff write actions on preorder campaigns / submissions, shared by the admin UI's
// routes (app/api/admin/preorder/**) and the T4A agent's write routes
// (app/api/agent/**). Both callers go through these functions so validation, the
// Metakocka side effects (lib/preorder-mk.ts) and the state rules are identical; the
// routes only map the results to their JSON responses.

import type { Types } from "mongoose";
import {
  connectDB,
  PreorderAccess,
  PreorderCampaign,
  PreorderSubmission,
  toCampaignView,
  toObjectId,
} from "@/lib/preorder";
import {
  detachSalesOrder,
  publishResult,
  readSubmissionOrder,
  registerSalesOrder,
  type RegisterResult,
  type SubmitActor,
} from "@/lib/preorder-mk";
import { repriceSubmission } from "@/lib/preorder-submit";
import { getMkCustomer } from "@/lib/mk-customers";
import { getPartnerById } from "@/lib/metakocka";
import { computeConfirmedTotals, type AllocationResult, type CampaignStatus, type LineStatus, type SubmissionStatus } from "@/types/preorder";
import type { IPreorderCampaign } from "@/models/preorder-campaign";
import type { IPreorderSubmission } from "@/models/preorder-submission";

export const CAMPAIGN_STATUSES: CampaignStatus[] = ["draft", "open", "closed"];
const LINE_STATUSES: LineStatus[] = ["pending", "confirmed", "backorder", "cancelled"];
const SUB_STATUSES: SubmissionStatus[] = ["draft", "submitted", "confirmed", "closed"];

// ── campaign status ───────────────────────────────────────────────────────────

// The status / deadline part of the campaign builder's save (PATCH). An unknown
// status is ignored; `deadline` is applied only when the key is present.
export function applyCampaignStatus(doc: IPreorderCampaign, body: { status?: unknown; deadline?: string | null }): void {
  if (typeof body.status === "string" && (CAMPAIGN_STATUSES as string[]).includes(body.status)) {
    doc.status = body.status as CampaignStatus;
  }
  if ("deadline" in body) doc.deadline = body.deadline ? new Date(body.deadline) : null;
}

// ── submission: status / unlock / unlock request (admin PATCH) ───────────────

export type SubmissionPatch = {
  status?: SubmissionStatus;
  lines?: { rowId: string; confirmedQty?: number | null; lineStatus?: LineStatus }[];
  dismissUnlockRequest?: boolean;
  detachOrder?: { deleteInMk?: boolean; reason?: string | null };
};

export type SubmissionPatchResult =
  | { ok: true; doc: IPreorderSubmission }
  | { ok: false; status: number; body: Record<string, unknown> };

//   • status changes ("draft" = unlock for the customer). Unlocking a submission that
//     carries a Metakocka order requires `detachOrder` (the order is moved to history,
//     optionally deleted in MK) and is refused while a registration is in flight.
//   • dismissUnlockRequest
//   • legacy per-line fulfilment (confirmedQty / lineStatus) for old submissions.
export async function patchSubmission(id: string, body: SubmissionPatch, actor: SubmitActor): Promise<SubmissionPatchResult> {
  if (!toObjectId(id)) return { ok: false, status: 404, body: { error: "not found" } };
  await connectDB();
  let doc = await PreorderSubmission.findById(id).exec();
  if (!doc) return { ok: false, status: 404, body: { error: "not found" } };

  if (body.status && SUB_STATUSES.includes(body.status)) {
    if (body.status === "draft" && doc.status !== "draft") {
      const hasOrder = !!doc.mkSalesOrder?.mkId;
      const pending = doc.mkOrder?.state === "pending";
      if (hasOrder && !body.detachOrder) {
        return {
          ok: false,
          status: 409,
          body: { error: "order-attached", message: "This preorder has a Metakocka order. Detach it to unlock.", countCode: doc.mkSalesOrder?.countCode },
        };
      }
      if (hasOrder || pending) {
        // Moves the order to history (refuses while a registration is genuinely in flight).
        const res = await detachSalesOrder(doc, {
          deleteInMk: !!body.detachOrder?.deleteInMk,
          actor,
          reason: body.detachOrder?.reason ?? "unlocked for customer",
        });
        if (!res.ok) return { ok: false, status: res.status, body: { error: "registering", message: res.error } };
      } else if (doc.mkOrder) {
        // A failed registration with no order: just clear the sync state.
        await PreorderSubmission.updateOne({ _id: doc._id }, { $set: { mkOrder: null } }).exec();
      }
      const reloaded = await PreorderSubmission.findById(id).exec();
      if (!reloaded) return { ok: false, status: 404, body: { error: "not found" } };
      doc = reloaded;
    }
    doc.status = body.status;
  }

  // Unlocking (→ draft) fulfils the customer's request; dismissing clears it too.
  if (body.dismissUnlockRequest || doc.status === "draft") {
    doc.unlockRequestNote = null;
    doc.unlockRequestedAt = null;
  }

  if (Array.isArray(body.lines)) {
    const patchByRow = new Map(body.lines.map((l) => [l.rowId, l]));
    for (const line of doc.lines) {
      const p = patchByRow.get(line.rowId);
      if (!p) continue;
      if ("confirmedQty" in p) {
        line.confirmedQty =
          p.confirmedQty === null || p.confirmedQty === undefined
            ? null
            : Math.max(0, Number(p.confirmedQty) || 0);
      }
      if (p.lineStatus && LINE_STATUSES.includes(p.lineStatus)) {
        line.lineStatus = p.lineStatus;
      }
    }
    // Legacy confirmed totals from the campaign's prices + current fulfilment.
    const campaignDoc = await PreorderCampaign.findById(doc.campaignId).exec();
    if (campaignDoc) {
      const view = toCampaignView(campaignDoc);
      const quantities: Record<string, number> = {};
      const confirmed: Record<string, { confirmedQty: number | null; lineStatus: LineStatus }> = {};
      for (const l of doc.lines) {
        quantities[l.rowId] = l.qty;
        confirmed[l.rowId] = { confirmedQty: l.confirmedQty ?? null, lineStatus: l.lineStatus ?? "pending" };
      }
      doc.confirmedTotals = computeConfirmedTotals(view, quantities, confirmed);
    }
  }

  await doc.save();
  return { ok: true, doc };
}

// ── submission: register / retry the Metakocka sales order ────────────────────

export type RegisterOrderOutcome =
  | { kind: "not-found" }
  // Refused before anything was sent to Metakocka (`doc` = the submission as it is).
  | { kind: "refused"; status: number; error: string; doc: IPreorderSubmission | null }
  // Registration ran: 200 created, 409 still pending, 502 failed.
  | { kind: "ran"; status: number; doc: IPreorderSubmission; result: RegisterResult; allocation: AllocationResult | null };

// The order is built from the FROZEN snapshot (exactly what the customer submitted);
// the service looks the order up by its idempotency key before creating, so calling
// this twice never creates two orders. Refused (409) unless the preorder is submitted
// and has no order yet. A preorder without a pricing snapshot, or one `reprice` is
// asked for, is re-priced from the campaign as it is now first.
export async function registerSubmissionOrder(id: string, opts: { reprice?: boolean }, actor: SubmitActor): Promise<RegisterOrderOutcome> {
  if (!toObjectId(id)) return { kind: "not-found" };
  await connectDB();
  const doc = await PreorderSubmission.findById(id).exec();
  if (!doc) return { kind: "not-found" };
  if (doc.status !== "submitted") {
    return { kind: "refused", status: 409, error: "Only a submitted preorder can be registered in Metakocka.", doc: null };
  }
  if (doc.mkSalesOrder?.mkId && (!doc.mkOrder || doc.mkOrder.state === "created")) {
    return { kind: "refused", status: 409, error: "A sales order already exists for this submission.", doc };
  }
  if (opts.reprice || !doc.snapshot?.pricing) {
    const rp = await repriceSubmission(doc);
    if (!rp.ok) return { kind: "refused", status: rp.status, error: rp.message, doc };
  }
  const result = await registerSalesOrder(doc._id as Types.ObjectId, actor);
  const fresh = (await PreorderSubmission.findById(id).exec()) ?? doc;
  const allocation = result.state === "created" ? await readSubmissionOrder(fresh, { fresh: true }) : null;
  const status = result.state === "created" ? 200 : result.state === "pending" ? 409 : 502;
  return { kind: "ran", status, doc: fresh, result, allocation };
}

// ── submission: show / hide the order to the customer ─────────────────────────

export type PublishOutcome =
  | { ok: true; doc: IPreorderSubmission; allocation: AllocationResult }
  | { ok: false; status: number; error: string };

// Publishing re-reads the live order first: a deleted order cannot be published, and
// the order's fingerprint is remembered so later MK edits show up as "changed since
// publish" for admins.
export async function publishSubmission(id: string, published: boolean, actor: SubmitActor): Promise<PublishOutcome> {
  if (!toObjectId(id)) return { ok: false, status: 404, error: "not found" };
  await connectDB();
  const doc = await PreorderSubmission.findById(id).exec();
  if (!doc) return { ok: false, status: 404, error: "not found" };
  const res = await publishResult(doc, published, actor);
  if (!res.ok) return res;
  const fresh = (await PreorderSubmission.findById(id).exec()) ?? doc;
  const allocation = await readSubmissionOrder(fresh);
  return { ok: true, doc: fresh, allocation };
}

// ── campaign access (the invite grant, given / taken by hand) ─────────────────

export type AccessOutcome = { ok: true; access: boolean } | { ok: false; status: number; error: string };

// Unlock the campaign for this customer (idempotent).
export async function grantCampaignAccess(campaignId: string, partnerMkId: string): Promise<AccessOutcome> {
  const oid = toObjectId(campaignId);
  if (!oid) return { ok: false, status: 404, error: "not found" };
  await connectDB();
  const campaign = await PreorderCampaign.findById(oid).exec();
  if (!campaign) return { ok: false, status: 404, error: "not found" };
  const directory = await getMkCustomer(partnerMkId);
  const partner = directory
    ? { name: directory.name, email: directory.emails?.[0] }
    : await getPartnerById(partnerMkId).then((p) => (p ? { name: p.name, email: p.emails?.[0] } : null));
  if (!partner) return { ok: false, status: 404, error: "Partner not found in Metakocka" };
  await PreorderAccess.updateOne(
    { campaignId: campaign._id, partnerMkId },
    { $setOnInsert: { grantedAt: new Date() }, $set: { partnerName: partner.name, partnerEmail: partner.email } },
    { upsert: true },
  ).exec();
  return { ok: true, access: true };
}

// Take the access away again. Refused once the customer has a preorder (a submission
// carries access by itself; unlock / delete the preorder first).
export async function revokeCampaignAccess(campaignId: string, partnerMkId: string): Promise<AccessOutcome> {
  const oid = toObjectId(campaignId);
  if (!oid) return { ok: false, status: 404, error: "not found" };
  await connectDB();
  const sub = await PreorderSubmission.exists({ campaignId: oid, partnerMkId });
  if (sub) return { ok: false, status: 409, error: "This customer already has a preorder in this campaign — access cannot be removed." };
  await PreorderAccess.deleteOne({ campaignId: oid, partnerMkId }).exec();
  return { ok: true, access: false };
}
