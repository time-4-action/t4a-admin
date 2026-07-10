// models/preorder-submission.ts
//
// One partner's response to a campaign. Keyed uniquely by (campaignId, partnerMkId) so
// a partner has exactly one submission per campaign (draft → submitted). The partner is
// always resolved from the session email server-side (never trusted from the client).
// Wire view is PreorderSubmission in types/preorder.ts.
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { SubmissionStatus, LineStatus } from "@/types/preorder";

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

export interface IPreorderSubmission extends Document {
  campaignId: Types.ObjectId;
  partnerMkId: string;
  partnerName: string;
  partnerEmail?: string;
  status: SubmissionStatus;
  terms: IPreorderTerms;
  lines: ISubmissionLine[];
  totals: { qty: number; amount: number };
  // Value/qty of the lines an admin has actually CONFIRMED (subset of totals).
  confirmedTotals: { qty: number; amount: number };
  submittedAt?: Date | null;
  // Customer-initiated request to unlock a submitted preorder for further edits.
  unlockRequestNote?: string | null;
  unlockRequestedAt?: Date | null;
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
    },
    confirmedTotals: {
      qty: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },
    submittedAt: { type: Date, default: null },
    unlockRequestNote: { type: String, default: null },
    unlockRequestedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One submission per partner per campaign.
PreorderSubmissionSchema.index({ campaignId: 1, partnerMkId: 1 }, { unique: true });

export const PreorderSubmission: Model<IPreorderSubmission> =
  mongoose.models.PreorderSubmission ??
  mongoose.model<IPreorderSubmission>("PreorderSubmission", PreorderSubmissionSchema);
