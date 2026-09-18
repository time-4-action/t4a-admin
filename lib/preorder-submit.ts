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

import { connectDB, PreorderCampaign, PreorderSubmission, loadEffectiveCampaignForPartner, toObjectId, type PartnerFacts } from "@/lib/preorder";
import { getMkCustomer, effectiveCountryIso, customerKind } from "@/lib/mk-customers";
import { getPartnerById } from "@/lib/metakocka";
import { getVatSettings } from "@/lib/vat-settings";
import { registerSalesOrder, type SubmitActor, type RegisterResult } from "@/lib/preorder-mk";
import type { MkOrderPort } from "@/lib/preorder-mk";
import { buildCommercialSnapshot } from "@/lib/preorder-snapshot";
import type { IPreorderCampaign } from "@/models/preorder-campaign";
import type { IPreorderSubmission, ISubmissionLine } from "@/models/preorder-submission";
import type { MkPartner } from "@/types/documents";
import { buyerOrderKey, computePricedOrder, flattenRows, totalsNet, type PreorderTerms } from "@/types/preorder";
import type { VatConfig } from "@/lib/pricing";

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
  // The global VAT table, when the caller already read it (tests inject one).
  vat?: VatConfig;
};

export type SubmitError = "locked" | "campaign-not-open" | "min-order" | "invalid" | "vat-missing" | "unpriced";

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
  const vat = input.vat ?? (await getVatSettings());
  const effective = await loadEffectiveCampaignForPartner(campaignDoc, partner, { vat });
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

  const priced = computePricedOrder(effective, cleanQty);
  const totals = priced.totals;
  const submit = input.action === "submit";

  // VAT is never guessed: a consumer whose country has no configured rate cannot be
  // registered (admins included — the Metakocka order would carry a made-up rate).
  // Drafts may still be saved.
  const ctx = effective.pricing;
  if (submit && (!ctx || ctx.vat.rate == null)) {
    const where = ctx?.countryIso ?? "this customer's country";
    return {
      ok: false,
      status: 422,
      error: "vat-missing",
      message: `No VAT rate is configured for ${where}, so this preorder cannot be submitted yet. Please contact us.`,
    };
  }
  // A row without any price has nothing to order at. The sheet shows such rows as
  // "not orderable" with a remove link, so this only fires for a stale draft / a
  // forged request.
  if (submit) {
    const noPrice = flattenRows(effective)
      .filter(({ row }) => cleanQty[row.id] > 0 && row.unpriced)
      .map(({ row }) => row.name || row.code);
    if (noPrice.length) {
      return {
        ok: false,
        status: 422,
        error: "unpriced",
        message: `${noPrice.length === 1 ? "This product has" : "These products have"} no price yet and cannot be ordered — remove ${noPrice.length === 1 ? "it" : "them"} from your preorder: ${noPrice.slice(0, 5).join(", ")}${noPrice.length > 5 ? ", …" : ""}.`,
      };
    }
  }

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
  // A DRAFT never loses a quantity the customer cannot see right now (a row hidden by
  // an admin, a tab taken away): those lines are carried over untouched and come back
  // the moment the row is visible again. Only a submit settles them — and the fill
  // page tells the customer which ones are not going through before they submit.
  if (!submit && existing?.status === "draft") {
    for (const l of existing.lines) {
      if (!validRowIds.has(l.rowId) && l.qty > 0 && !(l.rowId in cleanQty)) lines.push(l);
    }
  }

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
      const snapshot = buildCommercialSnapshot(effective, cleanQty, now, vat);
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

// Re-price a SUBMITTED preorder from the campaign as it is now: resolve the partner's
// effective campaign again (prices, VAT, tiers) for the quantities they submitted and
// replace the frozen snapshot. Used for preorders that carry no pricing snapshot
// (submitted before VAT support) so they can still be registered in Metakocka, and
// as an explicit admin action. Never touches a preorder that already has an MK order.
export type RepriceResult = { ok: true; doc: IPreorderSubmission } | { ok: false; status: number; error: SubmitError | "has-order"; message: string };

export async function repriceSubmission(
  doc: IPreorderSubmission,
  opts: { vat?: VatConfig; now?: Date; partner?: MkPartner | null } = {}, // tests inject the partner
): Promise<RepriceResult> {
  await connectDB();
  if (doc.status !== "submitted") return { ok: false, status: 409, error: "invalid", message: "Only a submitted preorder can be re-priced." };
  if (doc.mkSalesOrder?.mkId && (!doc.mkOrder || doc.mkOrder.state === "created")) {
    return { ok: false, status: 409, error: "has-order", message: "This preorder already has a Metakocka order — detach it first." };
  }
  const campaignDoc = await PreorderCampaign.findById(doc.campaignId).exec();
  if (!campaignDoc) return { ok: false, status: 404, error: "invalid", message: "Campaign not found." };

  const directory = await getMkCustomer(doc.partnerMkId);
  const mk = opts.partner !== undefined ? opts.partner : await getPartnerById(doc.partnerMkId);
  const partner: PartnerFacts = {
    mkId: doc.partnerMkId,
    countryIso: directory ? effectiveCountryIso(directory) : null,
    countrySource: directory?.countryIsoManual ? "manual" : directory?.countrySource ?? null,
    kind: directory ? customerKind(directory) : mk ? customerKind(mk) : null,
    mk,
  };
  const vat = opts.vat ?? (await getVatSettings());
  const effective = await loadEffectiveCampaignForPartner(campaignDoc, partner, { vat });
  const ctx = effective.pricing;
  if (!ctx || ctx.vat.rate == null) {
    return { ok: false, status: 422, error: "vat-missing", message: `No VAT rate is configured for ${ctx?.countryIso ?? "this customer's country"} — set it under Preorder → VAT rates first.` };
  }
  const rowsById = new Map(flattenRows(effective).map(({ row }) => [row.id, row]));
  const quantities: Record<string, number> = {};
  const lost: string[] = [];
  for (const l of doc.lines) {
    if (l.qty <= 0) continue;
    const row = rowsById.get(l.rowId);
    if (!row || row.unpriced) lost.push(l.code || l.rowId);
    else quantities[l.rowId] = l.qty;
  }
  // Never re-price away part of what the customer submitted.
  if (lost.length) {
    return {
      ok: false,
      status: 422,
      error: "invalid",
      message: `Cannot re-price: ${lost.length} submitted line${lost.length === 1 ? " is" : "s are"} no longer available to this customer (${lost.slice(0, 5).join(", ")}${lost.length > 5 ? ", …" : ""}). Restore the product / its price on the sheet, or unlock the preorder for the customer.`,
    };
  }
  if (Object.keys(quantities).length === 0) {
    return { ok: false, status: 422, error: "invalid", message: "The preorder has no lines to re-price." };
  }
  const now = opts.now ?? new Date();
  const snapshot = buildCommercialSnapshot(effective, quantities, now, vat);
  const totals = computePricedOrder(effective, quantities).totals;
  const fresh = await PreorderSubmission.findOneAndUpdate(
    { _id: doc._id },
    { $set: { totals, snapshot: { ...snapshot, resolvedAt: now, deadline: snapshot.deadline ? new Date(snapshot.deadline) : null } } },
    { returnDocument: "after" },
  ).exec();
  return fresh ? { ok: true, doc: fresh } : { ok: false, status: 404, error: "invalid", message: "Preorder not found." };
}
