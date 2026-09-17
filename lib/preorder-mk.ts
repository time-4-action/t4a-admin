import "server-only";

// lib/preorder-mk.ts
//
// The Metakocka side of a preorder submission's lifecycle:
//
//   registerSalesOrder   submit / retry → exactly one MK sales order per submission
//   readSubmissionOrder  the live MK order compared to the request (allocation)
//   publishResult        make that order visible to the customer (or hide it again)
//   detachSalesOrder     unlink a superseded order before an admin unlock
//
// Idempotency rests on THREE things: the submission's atomic state transitions (only
// one caller ever holds `mkOrder.state = pending` for a given attempt window), a
// deterministic `buyer_order` key (T4A<id>.<revision>, which MK can look a sales
// order up by), and a LOOKUP BEFORE EVERY CREATE — including the first one — so an
// order MK committed while our response was lost is adopted, never duplicated. A
// lookup that is inconclusive (MK unreachable) fails the attempt rather than creating
// blind. All Metakocka calls go through a small port so tests can inject a fake.

import { Types } from "mongoose";
import { cached, invalidateCached } from "@/lib/auth0-cache";
import {
  createSalesOrder,
  deleteSalesOrder,
  getSalesOrder,
  getPartnerById,
  getSalesOrderByBuyerOrder,
  type SalesOrderInput,
  type SalesOrderLookup,
} from "@/lib/metakocka";
import { PreorderCampaign, PreorderSubmission, REGISTRATION_STALE_MS, snapshotView, toObjectId } from "@/lib/preorder";
import { allocationFromDocument, orderHash } from "@/lib/preorder-snapshot";
import type { IPreorderSubmission } from "@/models/preorder-submission";
import type { DocDetail, MkPartner, MkSalesOrderResult } from "@/types/documents";
import {
  buyerOrderKey,
  campaignFromSnapshot,
  computeTabTotals,
  snapshotQuantities,
  CUSTOMER_KIND_LABELS,
  VAT_SOURCE_LABELS,
  type AllocationResult,
  type MkOrderState,
} from "@/types/preorder";
import { fmtVatRate, taxCodeForRate } from "@/lib/pricing";
import { getVatSettings } from "@/lib/vat-settings";

export type SubmitActor = { source: "customer" } | { source: "admin"; email: string | null };

export function actorLabel(actor: SubmitActor): string {
  return actor.source === "customer" ? "customer" : actor.email ? `admin:${actor.email}` : "admin";
}

// Everything the service needs from Metakocka, injectable for tests.
export type MkOrderPort = {
  create: (input: SalesOrderInput) => Promise<{ ok: true; order: MkSalesOrderResult } | { ok: false; error: string; status: number }>;
  getByBuyerOrder: (buyerOrder: string) => Promise<SalesOrderLookup>;
  get: (mkId: string) => Promise<DocDetail | null | "error">;
  delete: (mkId: string) => Promise<{ ok: true } | { ok: false; error: string; status: number }>;
  partner: (mkId: string) => Promise<MkPartner | null>;
};

async function getOrderOrError(mkId: string): Promise<DocDetail | null | "error"> {
  const r = await getSalesOrder(mkId);
  if (r.status === "ok") return r.order;
  return r.status === "error" ? "error" : null;
}

export const realMkPort: MkOrderPort = {
  create: createSalesOrder,
  getByBuyerOrder: getSalesOrderByBuyerOrder,
  get: getOrderOrError,
  delete: deleteSalesOrder,
  partner: getPartnerById,
};

export type RegisterResult = {
  state: MkOrderState;
  mkId?: string;
  countCode?: string;
  error?: string;
  adopted?: boolean;
};

type SubmissionId = Types.ObjectId | string;

// A hand-pushed (pre-feature) order: reference without sync state.
function isLegacyDoc(doc: Pick<IPreorderSubmission, "mkOrder" | "mkSalesOrder">): boolean {
  return !!doc.mkSalesOrder?.mkId && !doc.mkOrder?.state;
}

function oid(id: SubmissionId): Types.ObjectId | null {
  return typeof id === "string" ? toObjectId(id) : id;
}

// Try to take the registration lock: allowed from `failed`, or from a `pending` that
// is older than the stale window (an abandoned attempt). Returns the fresh doc when
// acquired, null when someone else holds it.
async function acquireLock(id: Types.ObjectId, now: Date): Promise<IPreorderSubmission | null> {
  const taken = await PreorderSubmission.findOneAndUpdate(
    {
      _id: id,
      status: "submitted",
      $or: [
        { "mkOrder.state": "failed" },
        { "mkOrder.state": "pending", "mkOrder.lockedAt": { $lt: new Date(now.getTime() - REGISTRATION_STALE_MS) } },
      ],
    },
    {
      $set: { "mkOrder.state": "pending", "mkOrder.lockedAt": now, "mkOrder.lastAttemptAt": now },
      $inc: { "mkOrder.attempts": 1 },
    },
    { returnDocument: "after" },
  ).exec();
  if (taken) return taken;
  // A submitted doc that never got a sync state (e.g. an interrupted transition).
  return PreorderSubmission.findOneAndUpdate(
    { _id: id, status: "submitted", mkOrder: null, mkSalesOrder: null },
    { $set: { mkOrder: { state: "pending", buyerOrder: null, attempts: 1, lastError: null, lockedAt: now, lastAttemptAt: now, lastSeen: null } } },
    { returnDocument: "after" },
  ).exec();
}

async function markCreated(id: Types.ObjectId, order: { mkId: string; countCode: string; totalPrice?: string | null }, actor: SubmitActor, buyerOrder: string) {
  await PreorderSubmission.updateOne(
    { _id: id },
    {
      $set: {
        mkSalesOrder: {
          mkId: order.mkId,
          countCode: order.countCode,
          totalPrice: order.totalPrice ?? null,
          createdAt: new Date(),
          createdBy: actorLabel(actor),
        },
        "mkOrder.state": "created",
        "mkOrder.buyerOrder": buyerOrder,
        "mkOrder.lastError": null,
        "mkOrder.lockedAt": null,
      },
    },
  ).exec();
}

async function markFailed(id: Types.ObjectId, error: string, buyerOrder: string) {
  await PreorderSubmission.updateOne(
    { _id: id },
    { $set: { "mkOrder.state": "failed", "mkOrder.lastError": error.slice(0, 500), "mkOrder.lockedAt": null, "mkOrder.buyerOrder": buyerOrder } },
  ).exec();
}

// Build the put_document payload from the FROZEN snapshot: the order contains exactly
// what the customer submitted, at the prices they saw, with each tab's earned volume
// discount baked into the unit price (the document carries no price list and no
// document-level discount, so the price must already be final). The VAT treatment is
// the snapshot's too: a company's lines go as NET price + tax_factor (0 when zero-rated,
// the rate when the layer charges companies), an individual's as the GROSS RRP + the
// country's tax_factor (MK backs out the VAT).
async function buildOrderInput(
  doc: IPreorderSubmission,
  port: MkOrderPort,
  partnerHint: MkPartner | null | undefined,
): Promise<{ ok: true; input: SalesOrderInput } | { ok: false; error: string }> {
  const snap = snapshotView(doc.snapshot);
  if (!snap || snap.lines.length === 0) return { ok: false, error: "Submission carries no priced lines (missing snapshot)." };
  const campaignDoc = await PreorderCampaign.findById(doc.campaignId).exec();
  if (!campaignDoc) return { ok: false, error: "Campaign not found." };

  const pricing = snap.pricing;
  if (!pricing) {
    return { ok: false, error: "This preorder carries no pricing snapshot (submitted before VAT support). Register it again — it is re-priced from the campaign as it is now first." };
  }
  const frozen = campaignFromSnapshot({ id: String(campaignDoc._id), title: campaignDoc.title, season: campaignDoc.season, status: campaignDoc.status }, snap);
  const tabTotals = computeTabTotals(frozen, snapshotQuantities(snap));

  const factor = Math.round(pricing.vatRate * 100) / 10000;
  // Lines go out with MK's `tax_factor` for the rate. A tax code configured for the
  // rate (snapshot, else the settings as they are now — an admin may add one after a
  // failed attempt) is sent as `tax` instead; never guessed. MK_LINE_TAX_MODE=code
  // makes a code mandatory.
  let tax: string | null = pricing.mkTaxCode ?? null;
  if (!tax) {
    const settings = await getVatSettings();
    tax = taxCodeForRate(settings.taxCodes, pricing.vatRate);
  }
  if (!tax && pricing.vatRate === 0 && process.env.MK_ZERO_TAX_CODE?.trim()) tax = process.env.MK_ZERO_TAX_CODE.trim();
  if (!tax && process.env.MK_LINE_TAX_MODE === "code") {
    return { ok: false, error: `No Metakocka tax code is configured for ${fmtVatRate(pricing.vatRate)} VAT — add it under Preorder → VAT rates (Metakocka tax codes) and register again.` };
  }
  const lines: SalesOrderInput["lines"] = [];
  for (const l of snap.lines) {
    if (l.qty <= 0 || !l.code) continue;
    if (l.unitGross == null || l.unitNet == null) {
      return { ok: false, error: `Line ${l.code} carries no frozen VAT figures — unlock and resubmit.` };
    }
    lines.push(
      pricing.basis === "rrp"
        ? { code: l.code, amount: l.qty, priceWithTax: l.unitGross, taxFactor: factor, tax }
        : { code: l.code, amount: l.qty, price: l.unitNet, taxFactor: factor, tax },
    );
  }

  const partner = partnerHint ?? (await port.partner(doc.partnerMkId));
  if (!partner) return { ok: false, error: "Could not resolve this partner in Metakocka." };

  const tierNotes = tabTotals
    .filter((t) => t.discount > 0)
    .map((t) => `${t.tabName}: ${t.tier?.name || "volume discount"} -${t.discountPct}%`);
  const vatNote =
    pricing.basis === "rrp"
      ? `VAT: ${CUSTOMER_KIND_LABELS[pricing.kind]}, RRP incl. ${fmtVatRate(pricing.vatRate)} VAT (${pricing.countryIso ?? "?"}, ${VAT_SOURCE_LABELS[pricing.vatSource].toLowerCase()})`
      : `VAT: ${CUSTOMER_KIND_LABELS[pricing.kind]}, partner prices excl. VAT, ${fmtVatRate(pricing.vatRate)} ${pricing.vatRate > 0 ? "added" : `(${VAT_SOURCE_LABELS[pricing.vatSource].toLowerCase()})`}`;
  const notes =
    [doc.terms?.comment?.trim(), tierNotes.length ? `Volume discounts — ${tierNotes.join("; ")}` : "", vatNote].filter(Boolean).join("\n") ||
    undefined;
  const season = campaignDoc.season?.trim() || campaignDoc.title;
  const deliveryDeadline = doc.terms?.deliveryDate ? new Date(doc.terms.deliveryDate).toISOString().slice(0, 10) : undefined;

  return {
    ok: true,
    input: {
      partner,
      title: season,
      currencyCode: snap.currency || campaignDoc.currency || "EUR",
      notes,
      lines,
      buyerOrder: buyerOrderKey(String(doc._id), doc.submitRevision || 1),
      // No `extra_column` on the document: this MK account rejects it on sales orders
      // ("Extra columns not supported yet on SalesOrder Products"). buyer_order is the
      // link; the submission id rides in the change-log note.
      changeLogNote: `T4A preorder ${String(doc._id)}`.slice(0, 50),
      deliveryDeadline,
    },
  };
}

// Register the submission's MK sales order — from submit (lock already held by the
// transition), or as a retry (takes the lock itself). Never creates twice.
export async function registerSalesOrder(
  submissionId: SubmissionId,
  actor: SubmitActor,
  opts: { port?: MkOrderPort; lockHeld?: boolean; partner?: MkPartner | null; now?: Date } = {},
): Promise<RegisterResult> {
  const port = opts.port ?? realMkPort;
  const now = opts.now ?? new Date();
  const id = oid(submissionId);
  if (!id) return { state: "failed", error: "invalid submission id" };

  let doc: IPreorderSubmission | null = await PreorderSubmission.findById(id).exec();
  if (!doc) return { state: "failed", error: "submission not found" };
  if (doc.status !== "submitted") return { state: "failed", error: "submission is not submitted" };
  if (doc.mkOrder?.state === "created" && doc.mkSalesOrder?.mkId) {
    return { state: "created", mkId: doc.mkSalesOrder.mkId, countCode: doc.mkSalesOrder.countCode };
  }
  if (isLegacyDoc(doc)) {
    return { state: "created", mkId: doc.mkSalesOrder!.mkId, countCode: doc.mkSalesOrder!.countCode };
  }

  if (!opts.lockHeld) {
    const locked = await acquireLock(id, now);
    if (!locked) return { state: "pending", error: "registration already in progress" };
    doc = locked;
  }
  const current: IPreorderSubmission = doc;

  const key = buyerOrderKey(String(current._id), current.submitRevision || 1);

  // 1. Lookup first — always.
  const found = await port.getByBuyerOrder(key);
  if (found.status === "error") {
    await markFailed(id, `lookup inconclusive: ${found.error}`, key);
    return { state: "failed", error: found.error };
  }
  if (found.status === "ok") {
    await markCreated(id, { mkId: found.order.mkId, countCode: found.order.countCode, totalPrice: found.order.sumAll ?? null }, actor, key);
    return { state: "created", mkId: found.order.mkId, countCode: found.order.countCode, adopted: true };
  }

  // 2. Not found → create.
  const built = await buildOrderInput(current, port, opts.partner);
  if (!built.ok) {
    await markFailed(id, built.error, key);
    return { state: "failed", error: built.error };
  }
  const res = await port.create(built.input);
  if (res.ok) {
    await markCreated(id, res.order, actor, key);
    return { state: "created", mkId: res.order.mkId, countCode: res.order.countCode };
  }

  // 3. Create failed — MK may still have committed it (or rejected a duplicate key).
  const again = await port.getByBuyerOrder(key);
  if (again.status === "ok") {
    await markCreated(id, { mkId: again.order.mkId, countCode: again.order.countCode, totalPrice: again.order.sumAll ?? null }, actor, key);
    return { state: "created", mkId: again.order.mkId, countCode: again.order.countCode, adopted: true };
  }
  await markFailed(id, res.error, key);
  return { state: "failed", error: res.error };
}

// ── reading the live order ────────────────────────────────────────────────────

const ORDER_CACHE_MS = 30_000;
const LAST_SEEN_THROTTLE_MS = 60_000;

export function invalidateOrderCache(mkId: string): void {
  invalidateCached(`mk-order:${mkId}`);
}

// The current MK order for a submission, compared to its request. Cached for 30 s
// per order (single-flight) so admin refreshes and portal polling share one MK read.
export async function readSubmissionOrder(
  doc: IPreorderSubmission,
  opts: { port?: MkOrderPort; fresh?: boolean } = {},
): Promise<AllocationResult> {
  const port = opts.port ?? realMkPort;
  const mkId = doc.mkSalesOrder?.mkId;
  if (!mkId) return { state: "none" };
  if (doc.mkOrder && doc.mkOrder.state !== "created") return { state: "none" };
  if (opts.fresh) invalidateOrderCache(mkId);

  const order = await cached(`mk-order:${mkId}`, ORDER_CACHE_MS, () => port.get(mkId));
  if (order === "error") return { state: "unavailable", error: "Metakocka is not reachable right now." };
  if (!order) return { state: "missing" };

  const allocation = allocationFromDocument(snapshotView(doc.snapshot), order, { publishedHash: doc.publishedHash ?? null });

  // Remember a cheap summary so list pages can show allocation without MK calls.
  const seenAt = doc.mkOrder?.lastSeen?.at ? new Date(doc.mkOrder.lastSeen.at).getTime() : 0;
  if (doc.mkOrder && Date.now() - seenAt > LAST_SEEN_THROTTLE_MS) {
    void PreorderSubmission.updateOne(
      { _id: doc._id },
      {
        $set: {
          "mkOrder.lastSeen": {
            at: new Date(),
            sumAll: order.sumAll ?? null,
            statusDesc: order.statusDesc ?? null,
            lineQty: allocation.allocatedQty,
            hash: orderHash(order),
          },
        },
      },
    )
      .exec()
      .catch(() => undefined);
  }
  return { state: "ok", allocation };
}

// ── publication ───────────────────────────────────────────────────────────────

export type PublishResult = { ok: true } | { ok: false; status: number; error: string };

export async function publishResult(
  doc: IPreorderSubmission,
  published: boolean,
  actor: SubmitActor,
  opts: { port?: MkOrderPort } = {},
): Promise<PublishResult> {
  const hasOrder = !!doc.mkSalesOrder?.mkId && (doc.mkOrder?.state === "created" || isLegacyDoc(doc));
  if (!hasOrder) return { ok: false, status: 409, error: "There is no registered Metakocka order to show yet." };

  if (published) {
    const read = await readSubmissionOrder(doc, { port: opts.port, fresh: true });
    if (read.state === "missing") return { ok: false, status: 409, error: "The Metakocka order no longer exists — nothing to show." };
    if (read.state === "unavailable") return { ok: false, status: 502, error: read.error };
    if (read.state === "none") return { ok: false, status: 409, error: "There is no registered Metakocka order to show yet." };
    const order = await (opts.port ?? realMkPort).get(doc.mkSalesOrder!.mkId);
    const hash = order && order !== "error" ? orderHash(order) : null;
    await PreorderSubmission.updateOne(
      { _id: doc._id },
      { $set: { resultPublishedToCustomer: true, resultPublishedAt: new Date(), resultPublishedBy: actorLabel(actor), publishedHash: hash } },
    ).exec();
  } else {
    await PreorderSubmission.updateOne({ _id: doc._id }, { $set: { resultPublishedToCustomer: false } }).exec();
  }
  return { ok: true };
}

// ── detaching (admin unlock) ──────────────────────────────────────────────────

export async function detachSalesOrder(
  doc: IPreorderSubmission,
  opts: { deleteInMk: boolean; actor: SubmitActor; reason?: string | null; port?: MkOrderPort },
): Promise<{ ok: true; deletedInMk: boolean } | { ok: false; status: number; error: string }> {
  if (doc.mkOrder?.state === "pending") {
    const stale = doc.mkOrder.lockedAt && Date.now() - new Date(doc.mkOrder.lockedAt).getTime() > REGISTRATION_STALE_MS;
    if (!stale) return { ok: false, status: 409, error: "The Metakocka order is still being registered — try again in a moment." };
  }
  const ref = doc.mkSalesOrder?.mkId ? doc.mkSalesOrder : null;
  let deletedInMk = false;
  if (ref && opts.deleteInMk) {
    const res = await (opts.port ?? realMkPort).delete(ref.mkId);
    if (!res.ok) return { ok: false, status: res.status, error: `Could not delete the Metakocka order: ${res.error}` };
    deletedInMk = true;
    invalidateOrderCache(ref.mkId);
  }
  await PreorderSubmission.updateOne(
    { _id: doc._id },
    {
      ...(ref
        ? {
            $push: {
              mkSalesOrderHistory: {
                mkId: ref.mkId,
                countCode: ref.countCode,
                buyerOrder: doc.mkOrder?.buyerOrder ?? null,
                detachedAt: new Date(),
                detachedBy: actorLabel(opts.actor),
                deletedInMk,
                reason: opts.reason ?? null,
              },
            },
          }
        : {}),
      $set: { mkSalesOrder: null, mkOrder: null, resultPublishedToCustomer: false, publishedHash: null },
    },
  ).exec();
  return { ok: true, deletedInMk };
}
