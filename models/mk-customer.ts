// models/mk-customer.ts
//
// A local directory of Metakocka partners ("customers" in the admin UI), campaign-
// independent. Populated by the explicit "Sync from Metakocka" action (every partner in
// one pull), and kept warm by cheap upserts whenever a partner passes through the
// preorder flow (invite join, portal load, admin picker). It exists so the Markets &
// Customers views never fan out to MK on render: country, address and the (manual)
// coordinates are all here.
//
// MK carries no coordinates. `manualGeo` is the only per-customer position — set by an
// admin in the customer drawer; everyone else is placed on their country's centroid
// client-side. `countryIso` is resolved from MK's localized country NAME
// (lib/countries.ts); `countryIsoManual` lets an admin fix an unresolvable one.
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMkCustomer extends Document {
  partnerMkId: string;
  countCode?: string | null;
  name: string;
  emails: string[];
  phone?: string | null;
  taxId?: string | null;
  businessEntity?: boolean | null;
  foreignCountry?: boolean | null;
  address: { street?: string | null; postNumber?: string | null; city?: string | null; countryRaw?: string | null };
  countryIso?: string | null; // resolved from MK
  countrySource?: "mk" | "home-fallback" | null;
  countryIsoManual?: string | null; // admin override
  manualGeo?: { lat: number; lng: number; setBy?: string | null; setAt: Date } | null;
  mkSyncedAt: Date;
  lastSeenInMk: Date;
  stale: boolean; // not returned by the last full sync
  createdAt: Date;
  updatedAt: Date;
}

const MkCustomerSchema = new Schema<IMkCustomer>(
  {
    partnerMkId: { type: String, required: true, unique: true },
    countCode: { type: String, default: null },
    name: { type: String, required: true },
    emails: { type: [String], default: [] },
    phone: { type: String, default: null },
    taxId: { type: String, default: null },
    businessEntity: { type: Boolean, default: null },
    foreignCountry: { type: Boolean, default: null },
    address: {
      street: { type: String, default: null },
      postNumber: { type: String, default: null },
      city: { type: String, default: null },
      countryRaw: { type: String, default: null },
    },
    countryIso: { type: String, default: null },
    countrySource: { type: String, default: null },
    countryIsoManual: { type: String, default: null },
    manualGeo: {
      type: new Schema(
        {
          lat: { type: Number, required: true },
          lng: { type: Number, required: true },
          setBy: { type: String, default: null },
          setAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    mkSyncedAt: { type: Date, required: true },
    lastSeenInMk: { type: Date, required: true },
    stale: { type: Boolean, default: false },
  },
  { timestamps: true },
);

MkCustomerSchema.index({ countryIso: 1 });
MkCustomerSchema.index({ countryIsoManual: 1 });
MkCustomerSchema.index({ stale: 1 });
MkCustomerSchema.index({ name: 1 });
MkCustomerSchema.index({ name: "text", emails: "text", "address.city": "text", countCode: "text" });

export const MkCustomer: Model<IMkCustomer> =
  mongoose.models.MkCustomer ?? mongoose.model<IMkCustomer>("MkCustomer", MkCustomerSchema);

// Singleton status document for the full directory sync (_id "mk-customers").
export interface IMkCustomerSyncState extends Document<string> {
  running: boolean;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  ok?: boolean | null;
  count: number;
  error?: string | null;
}

const MkCustomerSyncStateSchema = new Schema<IMkCustomerSyncState>(
  {
    _id: { type: String, required: true },
    running: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    ok: { type: Boolean, default: null },
    count: { type: Number, default: 0 },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

export const MK_CUSTOMER_SYNC_ID = "mk-customers";

export const MkCustomerSyncState: Model<IMkCustomerSyncState> =
  mongoose.models.MkCustomerSyncState ??
  mongoose.model<IMkCustomerSyncState>("MkCustomerSyncState", MkCustomerSyncStateSchema);
