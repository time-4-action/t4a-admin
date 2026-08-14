// Shared helpers for the builder-presets API routes. Saved builds are SHARED:
// every user with builder access (enforced by the middleware section gate) can
// see and edit all of them; the routes only stamp WHO did what.
import { auth0 } from "@/lib/auth";
import type { IBuilderPreset, IPresetActor } from "@/models/builder-preset";
import type { PresetActor, PresetSummary, PresetDetail } from "@/types/builder";

export const VALID_BUILDERS = new Set(["radar-chart", "range-bars", "layout"]);

// The current session user as an actor stamp (never trusted from the browser).
export async function sessionActor(): Promise<IPresetActor | null> {
  const session = await auth0.getSession();
  const sub = session?.user?.sub;
  if (!sub) return null;
  return {
    id: sub,
    name: session?.user?.name ?? session?.user?.email ?? "Admin",
    email: session?.user?.email ?? "",
  };
}

function actorView(a?: IPresetActor | null): PresetActor {
  return { id: a?.id ?? "", name: a?.name ?? "", email: a?.email ?? "" };
}

// The creator, with fallbacks for legacy (pre-shared) docs that only carried
// userId/userEmail.
function creatorOf(d: IBuilderPreset): PresetActor {
  return {
    id: d.userId,
    name: d.userName ?? d.userEmail ?? "",
    email: d.userEmail ?? "",
  };
}

export function summaryView(d: IBuilderPreset): PresetSummary {
  const createdBy = creatorOf(d);
  return {
    id: String(d._id),
    builder: d.builder,
    name: d.name,
    config: d.config,
    versionLabel: d.versionLabel ?? "",
    createdAt: d.createdAt?.toISOString?.() ?? String(d.createdAt),
    updatedAt: d.updatedAt?.toISOString?.() ?? String(d.updatedAt),
    createdBy,
    updatedBy: d.updatedBy?.id ? actorView(d.updatedBy) : createdBy,
    noteCount: d.notes?.length ?? 0,
    versionCount: d.versions?.length ?? 0,
  };
}

export function detailView(d: IBuilderPreset): PresetDetail {
  return {
    ...summaryView(d),
    notes: (d.notes ?? [])
      .map((n) => ({
        id: String(n._id),
        author: actorView(n.author),
        text: n.text,
        createdAt: n.createdAt?.toISOString?.() ?? String(n.createdAt),
      }))
      // newest first for display
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    versions: (d.versions ?? [])
      .map((v) => ({
        id: String(v._id),
        config: v.config,
        label: v.label ?? "",
        savedBy: actorView(v.savedBy),
        savedAt: v.savedAt?.toISOString?.() ?? String(v.savedAt),
      }))
      // newest first for display
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)),
  };
}

// Push the preset's CURRENT config onto its version history (the version name
// it was saved under, who had saved it, and when), keeping the history bounded.
// Call before overwriting `config`.
export function snapshotCurrent(d: IBuilderPreset, max: number) {
  d.versions.push({
    config: d.config,
    label: d.versionLabel ?? "",
    savedBy: d.updatedBy?.id
      ? d.updatedBy
      : { id: d.userId, name: d.userName ?? d.userEmail ?? "", email: d.userEmail ?? "" },
    savedAt: d.updatedAt ?? d.createdAt ?? new Date(),
  } as IBuilderPreset["versions"][number]);
  if (d.versions.length > max) d.versions.splice(0, d.versions.length - max);
}
