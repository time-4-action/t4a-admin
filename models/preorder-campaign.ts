// models/preorder-campaign.ts
//
// The admin-authored order sheet: tabs → groups → product rows. Template and campaign
// in one document. Rows are embedded (one doc per campaign; hundreds of rows stays well
// under the 16 MB limit and keeps builder + fill reads single-fetch). Wire view is
// PreorderCampaign in types/preorder.ts.
import mongoose, { Schema, Document, Model } from "mongoose";
import type { CampaignStatus, RowSource, RowTag } from "@/types/preorder";

export interface IPreorderRow {
  id: string;
  source: RowSource;
  code: string;
  ean?: string | null;
  name: string;
  variantLabel?: string | null;
  size?: string | null;
  tag?: RowTag;
  rrp?: number | null;
  partnerPrice?: number | null;
  discountedPrice?: number | null;
  image?: string | null;
  order: number;
}

export interface IPreorderGroup {
  id: string;
  name: string;
  order: number;
  parentCode?: string | null;
  description?: string | null;
  images?: string[];
  rows: IPreorderRow[];
}

export interface IPreorderTab {
  id: string;
  name: string;
  order: number;
  discountNote?: string | null;
  groups: IPreorderGroup[];
}

export interface IPreorderCampaign extends Document {
  title: string;
  season?: string | null;
  currency: string;
  status: CampaignStatus;
  deadline?: Date | null;
  // Metakocka price-list titles that feed the two price columns when catalogue
  // products are added/repriced (matched against ProductPrice.name). Null → fall
  // back to the built-in name heuristic in products/resolve.
  rrpPricelist?: string | null;
  partnerPricelist?: string | null;
  tabs: IPreorderTab[];
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// _id: false on embedded subdocs — we key rows/groups/tabs by our own string `id`.
const RowSchema = new Schema<IPreorderRow>(
  {
    id: { type: String, required: true },
    source: { type: String, enum: ["catalogue", "manual"], required: true },
    code: { type: String, required: true },
    ean: { type: String, default: null },
    name: { type: String, required: true },
    variantLabel: { type: String, default: null },
    size: { type: String, default: null },
    tag: { type: String, default: null },
    rrp: { type: Number, default: null },
    partnerPrice: { type: Number, default: null },
    discountedPrice: { type: Number, default: null },
    image: { type: String, default: null },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const GroupSchema = new Schema<IPreorderGroup>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    parentCode: { type: String, default: null },
    description: { type: String, default: null },
    images: { type: [String], default: undefined },
    rows: { type: [RowSchema], default: [] },
  },
  { _id: false },
);

const TabSchema = new Schema<IPreorderTab>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    discountNote: { type: String, default: null },
    groups: { type: [GroupSchema], default: [] },
  },
  { _id: false },
);

const PreorderCampaignSchema = new Schema<IPreorderCampaign>(
  {
    title: { type: String, required: true },
    season: { type: String, default: null },
    currency: { type: String, default: "EUR" },
    status: {
      type: String,
      enum: ["draft", "open", "closed"],
      default: "draft",
    },
    deadline: { type: Date, default: null },
    rrpPricelist: { type: String, default: null },
    partnerPricelist: { type: String, default: null },
    tabs: { type: [TabSchema], default: [] },
    createdBy: { type: String, default: null },
  },
  { timestamps: true },
);

export const PreorderCampaign: Model<IPreorderCampaign> =
  mongoose.models.PreorderCampaign ??
  mongoose.model<IPreorderCampaign>("PreorderCampaign", PreorderCampaignSchema);
