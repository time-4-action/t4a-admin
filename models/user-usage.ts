// models/user-usage.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserUsage extends Document {
  userId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  conversationCount: number;
  totalCostUsd: number;
}

const UserUsageSchema = new Schema<IUserUsage>({
  userId:              { type: String, required: true },
  modelId:             { type: String, required: true },
  inputTokens:         { type: Number, default: 0 },
  outputTokens:        { type: Number, default: 0 },
  cacheReadTokens:     { type: Number, default: 0 },
  cacheCreationTokens: { type: Number, default: 0 },
  conversationCount:   { type: Number, default: 0 },
  totalCostUsd:        { type: Number, default: 0 },
});

UserUsageSchema.index({ userId: 1, modelId: 1 }, { unique: true });

export const UserUsage: Model<IUserUsage> =
  mongoose.models.UserUsage ?? mongoose.model<IUserUsage>("UserUsage", UserUsageSchema);
