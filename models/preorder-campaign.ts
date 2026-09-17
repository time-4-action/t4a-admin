// models/preorder-campaign.ts
//
// The admin-authored order sheet: tabs → groups → product rows. Template and campaign
// in one document. Rows are embedded (one doc per campaign; hundreds of rows stays well
// under the 16 MB limit and keeps builder + fill reads single-fetch). Wire view is
// PreorderCampaign / PreorderCampaignAdmin in types/preorder.ts.
//
// The inheritance configuration (markets, customer rules, price books) is embedded
// too: there is ONE master campaign, and these small arrays decide what each partner
// effectively sees (lib/preorder-effective.ts). Legacy documents simply read as empty
// arrays ⇒ "campaign default only".
import mongoose, { Schema, Document, Model } from "mongoose";
import type { CampaignStatus, MarketColor, RowSource, RowTag } from "@/types/preorder";

// A volume-discount tier on a tab (see PreorderTier in types/preorder.ts): reach
// `minAmount` of ordered value inside the tab and every line in it drops by `discountPct`.
export interface IPreorderTier {
  id: string;
  name: string;
  minAmount: number;
  discountPct: number;
}

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
  restricted?: boolean;
  taxCode?: string | null;
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
  tiers?: IPreorderTier[];
  groups: IPreorderGroup[];
}

// A config layer (market or customer). Absent field = inherit. Arrays default to
// `undefined` on purpose — an empty array is a meaningful override.
export interface ICommercialConfig {
  partnerPricelist?: string | null;
  currency?: string | null;
  deadline?: Date | null;
  note?: string | null;
  minOrderAmount?: number | null;
  hiddenIds?: string[];
  exposedIds?: string[];
  tiersByTab?: { tabId: string; tiers: IPreorderTier[] }[];
}

export interface IPreorderMarket {
  id: string;
  name: string;
  color: MarketColor;
  countries: string[];
  kinds?: ("business" | "person")[];
  config: ICommercialConfig;
  updatedAt?: Date | null;
}

export interface ICustomerRule {
  partnerMkId: string;
  partnerName: string;
  marketId?: string | null;
  countryIso?: string | null;
  config: ICommercialConfig;
  note?: string | null;
  updatedAt?: Date | null;
  updatedBy?: string | null;
}

export interface IPriceBook {
  pricelist: string;
  currency?: string | null;
  fetchedAt?: Date | null;
  entries: { code: string; gross: number | null; taxCode?: string | null }[];
  missing: number;
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
  // Secret token for the customer invite ("magic") link. A partner who opens the
  // link is granted access to this campaign. Generated at create, backfilled lazily.
  shareToken?: string | null;
  tabs: IPreorderTab[];
  markets: IPreorderMarket[];
  customerRules: ICustomerRule[];
  priceBooks: IPriceBook[];
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
    restricted: { type: Boolean, default: false },
    taxCode: { type: String, default: null },
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

const TierSchema = new Schema<IPreorderTier>(
  {
    id: { type: String, required: true },
    name: { type: String, default: "" },
    minAmount: { type: Number, default: 0, min: 0 },
    discountPct: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false },
);

const TabSchema = new Schema<IPreorderTab>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    discountNote: { type: String, default: null },
    tiers: { type: [TierSchema], default: [] },
    groups: { type: [GroupSchema], default: [] },
  },
  { _id: false },
);

const TiersByTabSchema = new Schema<{ tabId: string; tiers: IPreorderTier[] }>(
  {
    tabId: { type: String, required: true },
    tiers: { type: [TierSchema], default: [] },
  },
  { _id: false },
);

// Every field defaults to `undefined` so "not set" survives a round trip (mongoose
// would otherwise materialise `[]` / `null` and turn inherit into override).
const CommercialConfigSchema = new Schema<ICommercialConfig>(
  {
    partnerPricelist: { type: String, default: undefined },
    currency: { type: String, default: undefined },
    deadline: { type: Date, default: undefined },
    note: { type: String, default: undefined },
    minOrderAmount: { type: Number, default: undefined },
    hiddenIds: { type: [String], default: undefined },
    exposedIds: { type: [String], default: undefined },
    tiersByTab: { type: [TiersByTabSchema], default: undefined },
  },
  { _id: false, minimize: false },
);

const MarketSchema = new Schema<IPreorderMarket>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    color: {
      type: String,
      enum: ["sky", "violet", "amber", "rose", "emerald", "indigo", "fuchsia", "teal"],
      default: "sky",
    },
    countries: { type: [String], default: [] },
    kinds: { type: [String], enum: ["business", "person"], default: [] },
    config: { type: CommercialConfigSchema, default: () => ({}) },
    updatedAt: { type: Date, default: null },
  },
  { _id: false, minimize: false },
);

const CustomerRuleSchema = new Schema<ICustomerRule>(
  {
    partnerMkId: { type: String, required: true },
    partnerName: { type: String, default: "" },
    marketId: { type: String, default: null },
    countryIso: { type: String, default: null },
    config: { type: CommercialConfigSchema, default: () => ({}) },
    note: { type: String, default: null },
    updatedAt: { type: Date, default: null },
    updatedBy: { type: String, default: null },
  },
  { _id: false, minimize: false },
);

const PriceBookSchema = new Schema<IPriceBook>(
  {
    pricelist: { type: String, required: true },
    currency: { type: String, default: null },
    fetchedAt: { type: Date, default: null },
    entries: {
      type: [
        new Schema(
          {
            code: { type: String, required: true },
            gross: { type: Number, default: null },
            taxCode: { type: String, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    missing: { type: Number, default: 0 },
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
    shareToken: { type: String, default: null, index: true },
    tabs: { type: [TabSchema], default: [] },
    markets: { type: [MarketSchema], default: [] },
    customerRules: { type: [CustomerRuleSchema], default: [] },
    priceBooks: { type: [PriceBookSchema], default: [] },
    createdBy: { type: String, default: null },
  },
  { timestamps: true, minimize: false },
);

// Customer views look rules up across campaigns by partner.
PreorderCampaignSchema.index({ "customerRules.partnerMkId": 1 });

export const PreorderCampaign: Model<IPreorderCampaign> =
  mongoose.models.PreorderCampaign ??
  mongoose.model<IPreorderCampaign>("PreorderCampaign", PreorderCampaignSchema);
