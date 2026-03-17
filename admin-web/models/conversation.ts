// models/conversation.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IConversation extends Document {
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  { userId: { type: String, required: true } },
  { timestamps: true }
);

export const Conversation: Model<IConversation> =
  mongoose.models.Conversation ?? mongoose.model<IConversation>("Conversation", ConversationSchema);
