// models/preorder-submission.ts
//
// One partner's response to a campaign. Keyed uniquely by (campaignId, partnerMkId) so
// a partner has exactly one submission per campaign (draft → submitted). The partner is
// always resolved from the session email server-side (never trusted from the client).
// Wire view is PreorderSubmission / PortalSubmission in types/preorder.ts.
//
// Lifecycle (lib/preorder-submit.ts + lib/preorder-mk.ts):
//   draft ──submit──▶ submitted (+ snapshot, mkOrder.state=pending)
//                        ├─ MK put_document ok   → mkSalesOrder ref, mkOrder.state=created
//                        └─ MK failed            → mkOrder.state=failed (retryable)
//   admin "Show order to customer" → resultPublishedToCustomer=true
//   admin unlock (→ draft) detaches the order into mkSalesOrderHistory.
//
// `mkSalesOrder` is the REFERENCE (unchanged legacy shape, only written once an order
// exists); `mkOrder` is the registration STATE. They are separate so a pending attempt
// never has to satisfy the reference's `required` fields — every later doc.save()
// on the legacy PATCH path still validates.
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { SubmissionStatus, LineStatus, MkOrderState, ConfigSource } from "@/types/preorder";
import type { IPreorderTier } from "@/models/preorder-campaign";

export interface ISubmissionLine {
  rowId: string;
  code: string;
  qty: number;
  confirmedQty?: number | null;
  lineStatus?: LineStatus;
}

export interface IPreorderTerms {
  invoiceAddress?: string;
  shippingAddress?: string;
  country?: string;
  phone?: string;
  deliveryDate?: Date | null;
  comment?: string;
}

export interface ISalesOrderRef {
  mkId: string;
  countCode: string;
  totalPrice?: string | null;
  createdAt?: Date | null;
  createdBy?: string | null;
}

export interface IMkOrderSync {
  state: MkOrderState;
  buyerOrder?: string | null;
  attempts: number;
  lastError?: string | null;
  lastAttemptAt?: Date | null;
  lockedAt?: Date | null;
  lastSeen?: {
    at: Date;
    sumAll?: string | null;
    statusDesc?: string | null;
    lineQty: number;
    hash: string;
  } | null;
}

export interface IDetachedOrder {
  mkId: string;
  countCode: string;
  buyerOrder?: string | null;
  detachedAt: Date;
  detachedBy?: string | null;
  deletedInMk: boolean;
  reason?: string | null;
}

export interface ISnapshotLine {
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
  unitPrice: number;
  rrp?: number | null;
  taxCode?: string | null;
  priceSource: "sheet" | "manual" | "book" | "fallback";
}

export interface ICommercialSnapshot {
  resolvedAt: Date;
  countryIso?: string | null;
  market?: { id: string; name: string } | null;
  marketSource?: "country" | "manual" | null;
  partnerPricelist?: string | null;
  currency: string;
  deadline?: Date | null;
  note?: string | null;
  sources: {
    pricelist: ConfigSource;
    currency: ConfigSource;
    deadline: ConfigSource;
    note: ConfigSource;
    minOrderAmount: ConfigSource;
    tiers: Map<string, ConfigSource> | Record<string, ConfigSource>;
  };
  tabs: { tabId: string; tabName: string; tiers: IPreorderTier[] }[];
  lines: ISnapshotLine[];
}

export interface IPreorderSubmission extends Document {
  campaignId: Types.ObjectId;
  partnerMkId: string;
  partnerName: string;
  partnerEmail?: string;
  status: SubmissionStatus;
  terms: IPreorderTerms;
  lines: ISubmissionLine[];
  // `amount` = gross line sum, `discount` = Σ per-tab volume discounts, `net` = payable.
  totals: { qty: number; amount: number; discount?: number; net?: number };
  // Value/qty of the lines an admin has actually CONFIRMED (legacy review flow).
  confirmedTotals: { qty: number; amount: number; discount?: number; net?: number };
  submittedAt?: Date | null;
  firstSubmittedAt?: Date | null;
  submitRevision: number;
  submitSource?: "customer" | "admin" | null;
  submittedBy?: string | null;
  // Customer-initiated request to unlock a submitted preorder for further edits.
  unlockRequestNote?: string | null;
  unlockRequestedAt?: Date | null;
  // The Metakocka sales order currently linked to this submission (reference).
  mkSalesOrder?: ISalesOrderRef | null;
  // Registration state of that order (absent on legacy, hand-pushed submissions).
  mkOrder?: IMkOrderSync | null;
  mkSalesOrderHistory: IDetachedOrder[];
  resultPublishedToCustomer: boolean;
  resultPublishedAt?: Date | null;
  resultPublishedBy?: string | null;
  publishedHash?: string | null;
  snapshot?: ICommercialSnapshot | null;
  createdAt: Date;
  updatedAt: Date;
}

const LineSchema = new Schema<ISubmissionLine>(
  {
    rowId: { type: String, required: true },
    code: { type: String, required: true },
    qty: { type: Number, required: true, min: 0 },
    confirmedQty: { type: Number, default: null },
    lineStatus: {
      type: String,
      enum: ["pending", "confirmed", "backorder", "cancelled"],
      default: "pending",
    },
  },
  { _id: false },
);

const TermsSchema = new Schema<IPreorderTerms>(
  {
    invoiceAddress: { type: String },
    shippingAddress: { type: String },
    country: { type: String },
    phone: { type: String },
    deliveryDate: { type: Date, default: null },
    comment: { type: String },
  },
  { _id: false },
);

const SalesOrderRefSchema = new Schema<ISalesOrderRef>(
  {
    mkId: { type: String, required: true },
    countCode: { type: String, required: true },
    totalPrice: { type: String, default: null },
    createdAt: { type: Date, default: null },
    createdBy: { type: String, default: null },
  },
  { _id: false },
);

// Nothing here is `required`: the sync state is written with $set from the
// atomic transitions in lib/preorder-submit.ts / lib/preorder-mk.ts.
const MkOrderSyncSchema = new Schema<IMkOrderSync>(
  {
    state: { type: String, enum: ["pending", "created", "failed"] },
    buyerOrder: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    lastAttemptAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    lastSeen: {
      type: new Schema(
        {
          at: { type: Date, required: true },
          sumAll: { type: String, default: null },
          statusDesc: { type: String, default: null },
          lineQty: { type: Number, default: 0 },
          hash: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { _id: false },
);

const DetachedOrderSchema = new Schema<IDetachedOrder>(
  {
    mkId: { type: String, required: true },
    countCode: { type: String, default: "" },
    buyerOrder: { type: String, default: null },
    detachedAt: { type: Date, required: true },
    detachedBy: { type: String, default: null },
    deletedInMk: { type: Boolean, default: false },
    reason: { type: String, default: null },
  },
  { _id: false },
);

const SnapshotTierSchema = new Schema<IPreorderTier>(
  {
    id: { type: String, required: true },
    name: { type: String, default: "" },
    minAmount: { type: Number, default: 0 },
    discountPct: { type: Number, default: 0 },
  },
  { _id: false },
);

const SnapshotLineSchema = new Schema<ISnapshotLine>(
  {
    rowId: { type: String, required: true },
    code: { type: String, required: true },
    name: { type: String, default: "" },
    variantLabel: { type: String, default: null },
    image: { type: String, default: null },
    tabId: { type: String, required: true },
    tabName: { type: String, default: "" },
    groupId: { type: String, required: true },
    groupName: { type: String, default: "" },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    rrp: { type: Number, default: null },
    taxCode: { type: String, default: null },
    priceSource: { type: String, enum: ["sheet", "manual", "book", "fallback"], default: "sheet" },
  },
  { _id: false },
);

const SnapshotSchema = new Schema<ICommercialSnapshot>(
  {
    resolvedAt: { type: Date, required: true },
    countryIso: { type: String, default: null },
    market: {
      type: new Schema({ id: { type: String }, name: { type: String } }, { _id: false }),
      default: null,
    },
    marketSource: { type: String, default: null },
    partnerPricelist: { type: String, default: null },
    currency: { type: String, required: true },
    deadline: { type: Date, default: null },
    note: { type: String, default: null },
    sources: {
      type: new Schema(
        {
          pricelist: { type: String, default: "campaign" },
          currency: { type: String, default: "campaign" },
          deadline: { type: String, default: "campaign" },
          note: { type: String, default: "campaign" },
          minOrderAmount: { type: String, default: "campaign" },
          tiers: { type: Map, of: String, default: {} },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    tabs: {
      type: [
        new Schema(
          {
            tabId: { type: String, required: true },
            tabName: { type: String, default: "" },
            tiers: { type: [SnapshotTierSchema], default: [] },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    lines: { type: [SnapshotLineSchema], default: [] },
  },
  { _id: false },
);

const PreorderSubmissionSchema = new Schema<IPreorderSubmission>(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "PreorderCampaign",
      required: true,
      index: true,
    },
    partnerMkId: { type: String, required: true },
    partnerName: { type: String, required: true },
    partnerEmail: { type: String },
    status: {
      type: String,
      enum: ["draft", "submitted", "confirmed", "closed"],
      default: "draft",
    },
    terms: { type: TermsSchema, default: {} },
    lines: { type: [LineSchema], default: [] },
    totals: {
      qty: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      net: { type: Number, default: 0 },
    },
    confirmedTotals: {
      qty: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      net: { type: Number, default: 0 },
    },
    submittedAt: { type: Date, default: null },
    firstSubmittedAt: { type: Date, default: null },
    submitRevision: { type: Number, default: 0 },
    submitSource: { type: String, default: null },
    submittedBy: { type: String, default: null },
    unlockRequestNote: { type: String, default: null },
    unlockRequestedAt: { type: Date, default: null },
    mkSalesOrder: { type: SalesOrderRefSchema, default: null },
    mkOrder: { type: MkOrderSyncSchema, default: null },
    mkSalesOrderHistory: { type: [DetachedOrderSchema], default: [] },
    resultPublishedToCustomer: { type: Boolean, default: false },
    resultPublishedAt: { type: Date, default: null },
    resultPublishedBy: { type: String, default: null },
    publishedHash: { type: String, default: null },
    snapshot: { type: SnapshotSchema, default: null },
  },
  { timestamps: true },
);

// One submission per partner per campaign — also the lock for the submit transition.
PreorderSubmissionSchema.index({ campaignId: 1, partnerMkId: 1 }, { unique: true });
// Documents/Orders exclusion: a partner's registered-but-unpublished orders.
PreorderSubmissionSchema.index({ partnerMkId: 1, "mkOrder.state": 1 });
PreorderSubmissionSchema.index({ "mkSalesOrder.mkId": 1 }, { sparse: true });
PreorderSubmissionSchema.index({ "mkOrder.buyerOrder": 1 }, { sparse: true });
PreorderSubmissionSchema.index({ "mkSalesOrderHistory.mkId": 1 }, { sparse: true });

export const PreorderSubmission: Model<IPreorderSubmission> =
  mongoose.models.PreorderSubmission ??
  mongoose.model<IPreorderSubmission>("PreorderSubmission", PreorderSubmissionSchema);
