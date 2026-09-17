// models/vat-settings.ts
//
// The GLOBAL VAT rate table (Admin → Settings → VAT rates): one singleton document
// keyed "vat" holding a rate per country (any country, not only the EU) plus an
// optional fallback rate for countries without one. Read by the preorder pricing
// resolver (lib/pricing.ts resolveVatRate) — a campaign can override single
// countries (PreorderCampaign.vatOverrides). Never hardcode a rate elsewhere.
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IVatSettings extends Document {
  key: "vat";
  rates: { iso: string; rate: number }[];
  fallbackRate: number | null;
  // Metakocka tax code per VAT rate (account-specific, e.g. 22 → "EX4", 0 → "000").
  taxCodes: { rate: number; code: string }[];
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const VatSettingsSchema = new Schema<IVatSettings>(
  {
    key: { type: String, required: true, unique: true, default: "vat" },
    rates: {
      type: [
        new Schema(
          {
            iso: { type: String, required: true },
            rate: { type: Number, required: true, min: 0, max: 100 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    fallbackRate: { type: Number, default: null, min: 0, max: 100 },
    taxCodes: {
      type: [
        new Schema(
          {
            rate: { type: Number, required: true, min: 0, max: 100 },
            code: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true, minimize: false },
);

export const VatSettings: Model<IVatSettings> =
  mongoose.models.VatSettings ?? mongoose.model<IVatSettings>("VatSettings", VatSettingsSchema);
