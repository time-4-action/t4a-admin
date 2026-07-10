// models/preorder-access.ts
//
// A partner's ACCESS to a preorder campaign, granted when they open the campaign's
// magic invite link while logged in (their session email matched a Metakocka partner).
// Campaigns are NOT visible to every logged-in customer — a partner sees a campaign
// only once they hold an access grant (this) or already have a submission on it.
// Keyed uniquely by (campaignId, partnerMkId).
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IPreorderAccess extends Document {
  campaignId: Types.ObjectId;
  partnerMkId: string;
  partnerName: string;
  partnerEmail?: string;
  grantedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PreorderAccessSchema = new Schema<IPreorderAccess>(
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
    grantedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// One access grant per partner per campaign.
PreorderAccessSchema.index({ campaignId: 1, partnerMkId: 1 }, { unique: true });

export const PreorderAccess: Model<IPreorderAccess> =
  mongoose.models.PreorderAccess ??
  mongoose.model<IPreorderAccess>("PreorderAccess", PreorderAccessSchema);
