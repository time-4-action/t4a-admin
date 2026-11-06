import "server-only";

// lib/agent-builder.ts
//
// Saved Section Builder configurations for the agent API
// (/api/agent/builder-presets): the product radar charts ("performance octagon":
// axes × values per product) and the range bars ("feel / rider goals": a band per
// bar per model). `config` is the builder's own blob, passed through verbatim;
// `ratings` is a best-effort, readable extraction of the product data in it, read
// through the builders' own normalizers (app/builder/generators.ts) so it means
// exactly what the generated snippet shows. Notes, version history and editor
// identities are not exposed.

import { connectDB } from "@/lib/mongodb";
import { BuilderPreset } from "@/models/builder-preset";
import { normalizeRadarConfig, normalizeRangeBarsConfig, isBuilderId } from "@/app/builder/generators";
import type { Paging } from "@/lib/agent-api";

export type RadarRating = { product: string; axes: Record<string, number> };
export type RangeBarRating = {
  label: string; // the product / model the bands describe
  bars: {
    title: string;
    kind: "two" | "scale"; // two = left↔right poles, scale = a labelled ladder
    left: string | null;
    right: string | null;
    scale: string[] | null;
    min: number | null; // 0–100 position of the band on the bar
    max: number | null;
    value: number | null; // marker position, when the bar shows one
  }[];
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function radarRatings(name: string, raw: unknown): RadarRating[] {
  const c = normalizeRadarConfig(raw);
  const axesOf = (values: unknown): Record<string, number> => {
    const vals = Array.isArray(values) ? values.map(Number) : [];
    const out: Record<string, number> = {};
    c.axes.forEach((axis, i) => {
      if (Number.isFinite(vals[i])) out[axis] = vals[i];
    });
    return out;
  };
  // Compare mode: one dataset per product (the dropdown). Single mode: the chart
  // shows `values`, named after the saved build.
  if (c.mode === "compare") {
    return c.datasets.map((d, i) => ({ product: String(d?.name ?? `Option ${i + 1}`), axes: axesOf(d?.values) }));
  }
  return [{ product: name, axes: axesOf(c.values) }];
}

export function rangeBarRatings(name: string, raw: unknown): RangeBarRating[] {
  const c = normalizeRangeBarsConfig(raw);
  const barView = (b: (typeof c.bars)[number], band: { min: unknown; max: unknown }) => ({
    title: b.title,
    kind: b.mode,
    left: b.mode === "two" ? b.left || null : null,
    right: b.mode === "two" ? b.right || null : null,
    scale: b.mode === "scale" ? b.scale.split(",").map((s) => s.trim()).filter(Boolean) : null,
    min: num(band.min),
    max: num(band.max),
    value: b.marker ? num(b.value) : null,
  });
  // Compare mode: each model carries one band per bar (by index). Single mode: the
  // bands live on the bars themselves.
  if (c.mode === "compare") {
    return c.models.map((m, i) => ({
      label: String(m?.name ?? `Model ${i + 1}`),
      bars: c.bars.map((b, bi) => barView(b, (Array.isArray(m?.bands) ? m.bands[bi] : null) ?? { min: null, max: null })),
    }));
  }
  return [{ label: name, bars: c.bars.map((b) => barView(b, b)) }];
}

export function presetRatings(builder: string, name: string, config: unknown): RadarRating[] | RangeBarRating[] | null {
  try {
    if (builder === "radar-chart") return radarRatings(name, config);
    if (builder === "range-bars") return rangeBarRatings(name, config);
  } catch {
    // A malformed legacy blob: config is still returned as is.
  }
  return null; // layout and unknown builders
}

type PresetLean = { _id: unknown; builder: string; name: string; config: unknown; versionLabel?: string | null; createdAt?: Date; updatedAt?: Date };

export async function listAgentBuilderPresets(query: { builder?: string | null }, paging: Paging) {
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (query.builder) {
    if (!isBuilderId(query.builder)) return { total: 0, items: [] };
    filter.builder = query.builder;
  }
  const [docs, total] = await Promise.all([
    BuilderPreset.find(filter, { builder: 1, name: 1, config: 1, versionLabel: 1, createdAt: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .skip(paging.skip)
      .limit(paging.limit)
      .lean<PresetLean[]>()
      .exec(),
    BuilderPreset.countDocuments(filter).exec(),
  ]);
  return {
    total,
    items: docs.map((d) => ({
      id: String(d._id),
      builder: d.builder,
      name: d.name,
      versionLabel: d.versionLabel ?? null,
      config: d.config,
      ratings: presetRatings(d.builder, d.name, d.config),
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
    })),
  };
}
