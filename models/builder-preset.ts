// models/builder-preset.ts
//
// A saved Section Builder configuration, scoped to the Auth0 user who created
// it. The `config` is the builder's own state blob (opaque to the server) so a
// user can name a build, come back later, load it, and keep editing. One doc per
// saved build; small (a few KB of JSON).
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBuilderPreset extends Document {
  userId: string; // Auth0 sub — the owner
  userEmail?: string | null;
  builder: string; // "radar-chart" | "range-bars"
  name: string;
  config: unknown; // the builder's state, stored verbatim
  createdAt: Date;
  updatedAt: Date;
}

const BuilderPresetSchema = new Schema<IBuilderPreset>(
  {
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, default: null },
    builder: { type: String, required: true },
    name: { type: String, required: true },
    config: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

// List a user's saves for one builder, newest first.
BuilderPresetSchema.index({ userId: 1, builder: 1, updatedAt: -1 });

export const BuilderPreset: Model<IBuilderPreset> =
  mongoose.models.BuilderPreset ??
  mongoose.model<IBuilderPreset>("BuilderPreset", BuilderPresetSchema);
