// types/builder.ts
//
// Wire types for the Saved Builds (builder presets) API — shared by the API
// routes and the client pages.

export type PresetActor = {
  id: string;
  name: string;
  email: string;
};

export type PresetNote = {
  id: string;
  author: PresetActor;
  text: string;
  createdAt: string;
};

// A superseded config snapshot — the version name it was saved under, who had
// saved that state, and when.
export type PresetVersion = {
  id: string;
  config: unknown;
  label: string;
  savedBy: PresetActor;
  savedAt: string;
};

// List item: everything a list/dropdown needs, without the heavy history.
export type PresetSummary = {
  id: string;
  builder: string;
  name: string;
  config: unknown;
  versionLabel: string; // the version name the current state was saved under
  createdAt: string;
  updatedAt: string;
  createdBy: PresetActor;
  updatedBy: PresetActor;
  noteCount: number;
  versionCount: number;
};

// Full detail: the summary plus the notes thread and version history.
export type PresetDetail = PresetSummary & {
  notes: PresetNote[];
  versions: PresetVersion[];
};
