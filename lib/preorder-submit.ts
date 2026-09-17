import "server-only";

// lib/preorder-submit.ts
//
// THE submission service — save a draft or submit a preorder — used by both the portal
// route (partner from the session) and the admin "fill for customer" route (partner
// picked by the admin). One implementation so validation, snapshotting and the MK
// registration cannot drift apart.
//
// Race safety without optimistic concurrency: every write is ONE atomic
// findOneAndUpdate whose filter includes `status: "draft"`, upserting into the unique
// (campaignId, partnerMkId) slot. A locked (submitted) document makes the filter miss,
// the upsert then tries to insert a second document and the unique index rejects it
// (E11000) ⇒ 409 `locked`. Two browser tabs submitting at once therefore produce exactly
// one transition; the loser never reaches Metakocka.

import { connectDB, PreorderSubmission, loadEffectiveCampaignForPartner, toObjectId, type PartnerFacts } from "@/lib/preorder";
import { registerSalesOrder, type SubmitActor, type RegisterResult } from "@/lib/preorder-mk";
import type { MkOrderPort } from "@/lib/preorder-mk";
import { buildCommercialSnapshot } from "@/lib/preorder-snapshot";
import type { IPreorderCampaign } from "@/models/preorder-campaign";
import type { IPreorderSubmission, ISubmissionLine } from "@/models/preorder-submission";
import type { MkPartner } from "@/types/documents";
import { buyerOrderKey, computeTotals, flattenRows, totalsNet, type PreorderTerms } from "@/types/preorder";

export type SubmitInput = {
  campaignDoc: IPreorderCampaign;
  partner: PartnerFacts & { name: string; email?: string | null; mk?: MkPartner | null };
  quantities: Record<string, number>;
  terms: PreorderTerms | undefined;
  action: "save" | "submit";
  actor: SubmitActor;
  // Tests inject a fake Metakocka port.
  port?: MkOrderPort;
  now?: Date;
};

export type SubmitError = "locked" | "campaign-not-open" | "min-order" | "invalid";

export type SubmitResult =
  | { ok: true; doc: IPreorderSubmission; dropped: string[]; register: RegisterResult | null }
  | { ok: false; status: number; error: SubmitError; message: string; doc?: IPreorderSubmission | null };

function isDuplicateKey(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: number }).code === 11000;
}

export async function saveOrSubmitPreorder(input: SubmitInput): Promise<SubmitResult> {
  await connectDB();
  const { campaignDoc, partner, actor } = input;
  const now = input.now ?? new Date();
  const campaignId = toObjectId(String(campaignDoc._id));
  if (!campaignId) return { ok: false, status: 400, error: "invalid", message: "invalid campaign" };

  // 1. What THIS partner may order: the effective campaign (hidden rows are gone).
  const effective = loadEffectiveCampaignForPartner(campaignDoc, partner);
  const flat = flattenRows(effective);
  const validRowIds = new Set(flat.map(({ row }) => row.id));
  const codeByRow = new Map(flat.map(({ row }) => [row.id, row.code]));

  const cleanQty: Record<string, number> = {};
  const dropped: string[] = [];
  for (const [rowId, q] of Object.entries(input.quantities ?? {})) {
    const n = Math.max(0, Math.floor(Number(q) || 0));
    if (n <= 0) continue;
    if (validRowIds.has(rowId)) cleanQty[rowId] = n;
    else dropped.push(rowId);
  }

  const totals = computeTotals(effective, cleanQty);
  const submit = input.action === "submit";

  // Minimum order value applies to customers only (an admin filling on behalf may
  // deliberately record a smaller order).
  const minOrder = effective.effective.minOrderAmount;
  if (submit && actor.source === "customer" && minOrder && totalsNet(totals) + 1e-9 < minOrder) {
    return {
      ok: false,
      status: 409,
      error: "min-order",
      message: `The minimum order value for your account is ${minOrder.toFixed(2)} ${effective.currency}.`,
    };
  }

  const terms: PreorderTerms = {
    invoiceAddress: input.terms?.invoiceAddress,
    shippingAddress: input.terms?.shippingAddress,
    country: input.terms?.country,
    phone: input.terms?.phone,
    deliveryDate: input.terms?.deliveryDate ?? null,
    comment: input.terms?.comment,
  };
  const termsDoc = {
    invoiceAddress: terms.invoiceAddress,
    shippingAddress: terms.shippingAddress,
    country: terms.country,
    phone: terms.phone,
    deliveryDate: terms.deliveryDate ? new Date(terms.deliveryDate) : null,
    comment: terms.comment,
  };

  // Line fulfilment fields are legacy; carry them over unchanged for surviving rows.
  const existing = await PreorderSubmission.findOne({ campaignId, partnerMkId: partner.mkId }).exec();
  const prevByRow = new Map((existing?.lines ?? []).map((l) => [l.rowId, l]));
  const lines: ISubmissionLine[] = Object.entries(cleanQty).map(([rowId, qty]) => {
    const prev = prevByRow.get(rowId);
    return {
      rowId,
      code: codeByRow.get(rowId) ?? "",
      qty,
      confirmedQty: prev?.confirmedQty ?? null,
      lineStatus: prev?.lineStatus ?? "pending",
    };
  });

  const identity = { partnerName: partner.name, partnerEmail: partner.email ?? undefined };

  // 2. One atomic upsert per action.
  let doc: IPreorderSubmission | null;
  try {
    if (!submit) {
      doc = await PreorderSubmission.findOneAndUpdate(
        { campaignId, partnerMkId: partner.mkId, status: "draft" },
        { $set: { lines, totals, terms: termsDoc, ...identity } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      ).exec();
    } else {
      const snapshot = buildCommercialSnapshot(effective, cleanQty, now);
      doc = await PreorderSubmission.findOneAndUpdate(
        { campaignId, partnerMkId: partner.mkId, status: "draft" },
        {
          $set: {
            status: "submitted",
            submittedAt: now,
            lines,
            totals,
            terms: termsDoc,
            ...identity,
            snapshot: { ...snapshot, resolvedAt: now, deadline: snapshot.deadline ? new Date(snapshot.deadline) : null },
            submitSource: actor.source,
            submittedBy: actor.source === "admin" ? actor.email : null,
            resultPublishedToCustomer: false,
            publishedHash: null,
            unlockRequestNote: null,
            unlockRequestedAt: null,
            // A fresh registration window for this revision (whole object: a draft
            // carries `mkOrder: null`, which dotted $set/$inc paths cannot extend).
            mkOrder: { state: "pending", buyerOrder: null, attempts: 1, lastError: null, lockedAt: now, lastAttemptAt: now, lastSeen: null },
          },
          $inc: { submitRevision: 1 },
          $setOnInsert: { firstSubmittedAt: now },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      ).exec();
      if (doc) {
        // Deterministic key; also recomputable from _id + revision by the retry path.
        const key = buyerOrderKey(String(doc._id), doc.submitRevision || 1);
        await PreorderSubmission.updateOne({ _id: doc._id }, { $set: { "mkOrder.buyerOrder": key } }).exec();
        doc.mkOrder = { ...(doc.mkOrder ?? { state: "pending", attempts: 1 }), buyerOrder: key };
        if (!doc.firstSubmittedAt) doc.firstSubmittedAt = now;
      }
    }
  } catch (err) {
    if (isDuplicateKey(err)) {
      const locked = await PreorderSubmission.findOne({ campaignId, partnerMkId: partner.mkId }).exec();
      return { ok: false, status: 409, error: "locked", message: "This preorder has already been submitted and is locked.", doc: locked };
    }
    throw err;
  }
  if (!doc) return { ok: false, status: 500, error: "invalid", message: "could not save the submission" };

  // 3. Immediate Metakocka registration (the transition above holds the lock).
  let register: RegisterResult | null = null;
  if (submit) {
    register = await registerSalesOrder(doc._id as import("mongoose").Types.ObjectId, actor, {
      port: input.port,
      lockHeld: true,
      partner: partner.mk ?? null,
      now,
    });
    const fresh = await PreorderSubmission.findById(doc._id).exec();
    if (fresh) doc = fresh;
  }

  return { ok: true, doc, dropped, register };
}
