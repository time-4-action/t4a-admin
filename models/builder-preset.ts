// models/builder-preset.ts
//
// A saved Section Builder configuration, SHARED across everyone with builder
// access (not user-scoped — the section gate in lib/access.ts is the ACL). The
// `config` is the builder's own state blob (opaque to the server). Each save
// also carries a notes thread and a capped version history so any teammate can
// see who changed what and revert.
import mongoose, { Schema, Document, Model, Types } from "mongoose";

// Who did something — stamped server-side from the Auth0 session.
export interface IPresetActor {
  id: string; // Auth0 sub
  name: string;
  email: string;
}

export interface IPresetNote {
  _id: Types.ObjectId;
  author: IPresetActor;
  text: string;
  createdAt: Date;
}

// A superseded snapshot of `config`: the state as it existed before an edit
// replaced it, stamped with the version name it was saved under, who had saved
// that state, and when.
export interface IPresetVersion {
  _id: Types.ObjectId;
  config: unknown;
  label: string; // the version name that state was saved under
  savedBy: IPresetActor;
  savedAt: Date;
}

export interface IBuilderPreset extends Document {
  userId: string; // Auth0 sub — the creator (kept for legacy docs)
  userEmail?: string | null;
  userName?: string | null;
  builder: string; // "radar-chart" | "range-bars"
  name: string;
  config: unknown; // the builder's current state, stored verbatim
  versionLabel?: string | null; // the version name the current state was saved under
  updatedBy?: IPresetActor | null; // who last edited (config or rename)
  notes: IPresetNote[];
  versions: IPresetVersion[];
  createdAt: Date;
  updatedAt: Date;
}

const ActorSchema = new Schema<IPresetActor>(
  {
    id: { type: String, default: "" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
  },
  { _id: false },
);

const NoteSchema = new Schema<IPresetNote>(
  {
    author: { type: ActorSchema, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const VersionSchema = new Schema<IPresetVersion>(
  {
    config: { type: Schema.Types.Mixed, required: true },
    label: { type: String, default: "" },
    savedBy: { type: ActorSchema, required: true },
    savedAt: { type: Date, required: true },
  },
  { _id: true },
);

const BuilderPresetSchema = new Schema<IBuilderPreset>(
  {
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, default: null },
    userName: { type: String, default: null },
    builder: { type: String, required: true },
    name: { type: String, required: true },
    config: { type: Schema.Types.Mixed, required: true },
    versionLabel: { type: String, default: null },
    updatedBy: { type: ActorSchema, default: null },
    notes: { type: [NoteSchema], default: [] },
    versions: { type: [VersionSchema], default: [] },
  },
  { timestamps: true },
);

// Keep the version history bounded — the newest snapshots win.
export const MAX_PRESET_VERSIONS = 30;

// List saves for one builder, newest first.
BuilderPresetSchema.index({ builder: 1, updatedAt: -1 });

export const BuilderPreset: Model<IBuilderPreset> =
  mongoose.models.BuilderPreset ??
  mongoose.model<IBuilderPreset>("BuilderPreset", BuilderPresetSchema);
