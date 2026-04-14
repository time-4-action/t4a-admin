// models/user-limit.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserLimit extends Document {
  userId: string;
  limitUsd: number;
  period: "monthly" | "weekly" | "daily" | "total";
  currentSpendUsd: number;
  periodStart: Date;
  updatedAt: Date;
}

const UserLimitSchema = new Schema<IUserLimit>({
  userId:          { type: String, required: true, unique: true },
  limitUsd:        { type: Number, required: true },
  period:          { type: String, enum: ["monthly", "weekly", "daily", "total"], required: true },
  currentSpendUsd: { type: Number, default: 0 },
  periodStart:     { type: Date, default: Date.now },
  updatedAt:       { type: Date, default: Date.now },
});

export const UserLimit: Model<IUserLimit> =
  mongoose.models.UserLimit ?? mongoose.model<IUserLimit>("UserLimit", UserLimitSchema);
