// models/portal-agent.ts
//
// A portal AGENT: a Metakocka partner (logging in to the portal with their own
// email, like any customer) who may also see — and place preorders for — a set of
// assigned CLIENT partners. Keyed by the agent's own partner id, so the identity
// stays "session email → Metakocka partner" and an admin "viewing as" that partner
// sees exactly the agent view. A client may be assigned to several agents.
import mongoose, { Schema, Model } from "mongoose";

export interface IPortalAgentClient {
  partnerMkId: string;
  partnerName: string;
  addedAt: Date;
  addedBy?: string | null;
}

export interface IPortalAgent {
  partnerMkId: string;
  partnerName: string;
  clients: IPortalAgentClient[];
  note?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema = new Schema<IPortalAgentClient>(
  {
    partnerMkId: { type: String, required: true },
    partnerName: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: String, default: null },
  },
  { _id: false },
);

const PortalAgentSchema = new Schema<IPortalAgent>(
  {
    partnerMkId: { type: String, required: true, unique: true },
    partnerName: { type: String, required: true },
    clients: { type: [ClientSchema], default: [] },
    note: { type: String, default: null },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

// "Which agents serve this customer" (the Customers list badges).
PortalAgentSchema.index({ "clients.partnerMkId": 1 });

export const PortalAgent: Model<IPortalAgent> =
  mongoose.models.PortalAgent ?? mongoose.model<IPortalAgent>("PortalAgent", PortalAgentSchema);
