// app/builder/generators.ts
//
// Pure markup generation for every section builder, extracted from the builder
// pages so any surface (the builders themselves, the Saved Builds list/detail
// pages, version previews) can turn a saved config blob into the exact same
// snippet. Faithful ports of the reference builders' logic — keep these in
// lockstep with the controls on each /builder/<id> page.

import { BUILDER_SCRIPT_URL } from "@/lib/builder-role";

export type BuilderId = "radar-chart" | "range-bars" | "layout";

export const BUILDER_META: Record<BuilderId, { label: string; badge: string }> = {
  "radar-chart": { label: "Radar Chart", badge: "performance octagon" },
  "range-bars": { label: "Range Bars", badge: "feel / rider goals" },
  layout: { label: "Section Layout", badge: "rows & columns" },
};

export function isBuilderId(v: string): v is BuilderId {
  return v in BUILDER_META;
}

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Which entry of a compare dropdown is shown when the page loads. Kept in the
// config (and written into the snippet as `selected`) so the option you picked
// in the live preview is the one the pasted markup opens on.
function clampIndex(v: unknown, len: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n >= len) return 0;
  return n;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── radar chart ──────────────────────────────────────────────────────────── */

// Dark-native teal defaults that mirror patrik-components.js. Leaving `fill`
// and `fillOpacity` untouched emits no data-fill, so the renderer draws its
// smooth teal gradient; the grid/axis sentinels below map to the renderer's
// faint white hairlines (which are alpha-based, so not written as hex).
export const RADAR_DEF = {
  fill: "#38b6d3",
  fillOpacity: 0.45,
  stroke: "#38b6d3",
  point: "#eaf7fb",
  grid: "#7c93a0",
  axisColor: "#6a828f",
  labelColor: "#c7dce4",
};

export type RadarColors = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  point: string;
  grid: string;
  axisColor: string;
  labelColor: string;
};

export type RadarConfig = {
  mode: "single" | "compare";
  align: "left" | "center" | "right";
  size: number;
  compareLabel: string;
  axes: string[];
  values: number[];
  datasets: { name: string; values: number[] }[];
  // Comparison mode only: index of the dataset the dropdown opens on.
  defaultIndex: number;
  colors: RadarColors;
};

// The state a fresh Radar Chart builder (or a freshly inserted layout block)
// starts from. A factory, not a constant, so no two consumers share arrays.
export function radarDefaultConfig(): RadarConfig {
  return {
    mode: "single",
    align: "center",
    size: 460,
    compareLabel: "Compare models",
    axes: ["LIGHTWIND", "FREERIDE", "FOIL", "FREEFLY", "WAVE", "SURF", "RACING", "FREESTYLE"],
    values: [100, 90, 70, 85, 95, 60, 80, 75],
    datasets: [
      { name: "4Wave FLOW HD", values: [100, 85, 70, 100, 40, 100, 90, 100] },
      { name: "4Wave FLASH HD", values: [90, 100, 95, 80, 75, 90, 100, 90] },
    ],
    defaultIndex: 0,
    colors: { ...RADAR_DEF },
  };
}

// Coerce an opaque saved blob into a usable RadarConfig. Defensive on purpose —
// legacy and partial configs must degrade, never throw.
export function normalizeRadarConfig(raw: unknown): RadarConfig {
  const c = (raw ?? {}) as Partial<RadarConfig>;
  const d = radarDefaultConfig();
  const datasets = Array.isArray(c.datasets) ? c.datasets : d.datasets;
  return {
    mode: c.mode === "compare" ? "compare" : "single",
    align: c.align === "left" || c.align === "right" ? c.align : "center",
    size: typeof c.size === "number" ? c.size : d.size,
    compareLabel: typeof c.compareLabel === "string" ? c.compareLabel : d.compareLabel,
    axes: Array.isArray(c.axes) ? c.axes.map(String) : d.axes,
    values: Array.isArray(c.values) ? c.values.map(Number) : d.values,
    datasets,
    defaultIndex: clampIndex(c.defaultIndex, datasets.length),
    colors: { ...RADAR_DEF, ...((c.colors as RadarColors) ?? {}) },
  };
}

export function generateRadarChart(cfg: RadarConfig): { markup: string; code: string } {
  const { mode, align, size, compareLabel, axes, values, datasets, colors } = cfg;
  const fit = (arr: number[]) => axes.map((_, i) => (arr[i] != null ? arr[i] : 50));
  // The renderer reads select.selectedIndex, so a plain `selected` attribute on
  // the option is all it takes to make that dataset the one shown on load.
  const defaultIndex = clampIndex(cfg.defaultIndex, datasets.length);

  const colorAttrs = (): [string, string][] => {
    const out: [string, string][] = [];
    if (colors.fill.toLowerCase() !== RADAR_DEF.fill || Number(colors.fillOpacity) !== RADAR_DEF.fillOpacity)
      out.push(["data-fill", hexToRgba(colors.fill, Number(colors.fillOpacity))]);
    if (colors.stroke.toLowerCase() !== RADAR_DEF.stroke) out.push(["data-stroke", colors.stroke]);
    if (colors.point.toLowerCase() !== RADAR_DEF.point) out.push(["data-point", colors.point]);
    if (colors.grid.toLowerCase() !== RADAR_DEF.grid) out.push(["data-grid", colors.grid]);
    if (colors.axisColor.toLowerCase() !== RADAR_DEF.axisColor)
      out.push(["data-axis-color", colors.axisColor]);
    if (colors.labelColor.toLowerCase() !== RADAR_DEF.labelColor)
      out.push(["data-label-color", colors.labelColor]);
    return out;
  };

  const buildChart = (pad: string): string => {
    const axesStr = axes.join(",");
    const extra = colorAttrs();
    const L: string[] = [];
    L.push(`${pad}<div class="patrik-radar-chart"`);
    L.push(`${pad}     data-axes="${esc(axesStr)}"`);
    if (align !== "center") L.push(`${pad}     data-align="${align}"`);
    if (size !== 460) L.push(`${pad}     data-size="${size}"`);

    if (mode === "single") {
      let last = `${pad}     data-values="${fit(values).join(",")}"`;
      extra.forEach(([a, v]) => (last += `\n${pad}     ${a}="${v}"`));
      L.push(last + ">");
      L.push(`${pad}</div>`);
    } else {
      if (extra.length) {
        L.push(`${pad}     ` + extra.map(([a, v]) => `${a}="${v}"`).join(`\n${pad}     `) + ">");
      } else {
        L[L.length - 1] += ">";
      }
      L.push(`${pad}    <div class="patrik-rc-compare">`);
      if (compareLabel.trim())
        L.push(`${pad}        <span class="patrik-rc-compare-label">${esc(compareLabel)}</span>`);
      L.push(`${pad}        <select class="patrik-radar-select">`);
      datasets.forEach((ds, i) => {
        const sel = i === defaultIndex ? " selected" : "";
        L.push(
          `${pad}            <option value="${fit(ds.values).join(",")}"${sel}>${esc(ds.name)}</option>`,
        );
      });
      L.push(`${pad}        </select>`);
      L.push(`${pad}    </div>`);
      L.push(`${pad}</div>`);
    }
    return L.join("\n");
  };

  const markup = buildChart("");
  const code = `${markup}\n\n<script src="${BUILDER_SCRIPT_URL}"></script>`;
  return { markup, code };
}

/* ── range bars ───────────────────────────────────────────────────────────── */

// Sentinel band colour. When a bar keeps this value no data-range is emitted,
// so patrik-components.js renders its smooth teal gradient fill. Pick any other
// colour and it is written out as a flat data-range override.
export const RANGE_DEF_RANGE = "#38b6d3";

export type RangeBar = {
  mode: "two" | "scale";
  title: string;
  left: string;
  right: string;
  min: number | "";
  max: number | "";
  marker: boolean;
  value: number;
  range: string;
  scale: string;
  scaleIndex: boolean;
  // Volatile drag-and-drop identities, one per comma-separated stop in `scale`.
  // Owned by the controls, ignored here and by the dirty check.
  stopKeys?: string[];
};

export type RangeBand = { min: number | ""; max: number | "" };
export type RangeModel = { name: string; bands: RangeBand[] };

export type RangeBarsConfig = {
  mode: "single" | "compare";
  align: "left" | "center" | "right";
  size: number;
  compareLabel: string;
  bars: RangeBar[];
  models: RangeModel[];
  // Comparison mode only: index of the model the dropdown opens on.
  defaultIndex: number;
};

// A single bar's starting state. `over` lets callers seed a preset bar.
export function rangeBarDefault(over: Partial<RangeBar> = {}): RangeBar {
  return {
    mode: "two",
    title: "New bar",
    left: "Left",
    right: "Right",
    min: 20,
    max: 70,
    marker: false,
    value: 50,
    range: RANGE_DEF_RANGE,
    scale: "Entry,Intermediate,Advanced,Pro",
    scaleIndex: true,
    ...over,
  };
}

export function rangeBarsDefaultConfig(): RangeBarsConfig {
  return {
    mode: "single",
    align: "center",
    size: 720,
    compareLabel: "Compare models",
    bars: [
      rangeBarDefault({ title: "Power delivery", left: "Direct", right: "Smooth", min: 25, max: 62 }),
      rangeBarDefault({
        title: "Center of effort",
        left: "Backhanded",
        right: "Fronthanded",
        min: 45,
        max: 80,
      }),
    ],
    models: [
      { name: "4Wave FLOW HD", bands: [{ min: 25, max: 62 }, { min: 45, max: 80 }] },
      { name: "4Wave FLASH HD", bands: [{ min: 40, max: 75 }, { min: 55, max: 90 }] },
    ],
    defaultIndex: 0,
  };
}

export function normalizeRangeBarsConfig(raw: unknown): RangeBarsConfig {
  const c = (raw ?? {}) as Partial<RangeBarsConfig>;
  const d = rangeBarsDefaultConfig();
  const models = Array.isArray(c.models) ? c.models : d.models;
  return {
    mode: c.mode === "compare" ? "compare" : "single",
    align: c.align === "left" || c.align === "right" ? c.align : "center",
    size: typeof c.size === "number" ? c.size : d.size,
    compareLabel: typeof c.compareLabel === "string" ? c.compareLabel : d.compareLabel,
    bars: Array.isArray(c.bars) && c.bars.length ? c.bars.map((b) => rangeBarDefault(b)) : d.bars,
    models,
    defaultIndex: clampIndex(c.defaultIndex, models.length),
  };
}

export function generateRangeBars(cfg: RangeBarsConfig): { markup: string; code: string } {
  const { mode, align, size, compareLabel, bars, models } = cfg;
  // See generateRadarChart: `selected` is what makes the pasted snippet open on
  // the model you picked, not always the first one.
  const defaultIndex = clampIndex(cfg.defaultIndex, models.length);

  // includeBand=false in comparison mode: the band (min/max) comes from the
  // selected model, so it is not written onto the bar.
  const buildBar = (bar: RangeBar, pad: string, includeBand = true): string => {
    const A: string[] = [];
    const push = (name: string, val: string | number) => A.push(`${pad}     ${name}="${esc(String(val))}"`);
    if (bar.title) push("data-title", bar.title);
    if (bar.mode === "two") {
      if (bar.left) push("data-left", bar.left);
      if (bar.right) push("data-right", bar.right);
    } else {
      push("data-scale", bar.scale);
      if (bar.scaleIndex) push("data-scale-index", "true");
    }
    if (includeBand) {
      push("data-min", bar.min);
      push("data-max", bar.max);
    }
    if (bar.marker) push("data-value", bar.value);
    if (bar.range && bar.range.toLowerCase() !== RANGE_DEF_RANGE) push("data-range", bar.range);

    const last = (A.pop() ?? "") + ">";
    return `${pad}<div class="patrik-range-bar"\n${A.join("\n")}${A.length ? "\n" : ""}${last}\n${pad}</div>`;
  };

  const numOr0 = (v: number | "") => (v === "" ? 0 : v);
  const alignAttr = align !== "center" ? ` data-align="${align}"` : "";
  const sizeAttr = size < 720 ? ` data-size="${size}"` : "";

  // withSelect=true → comparison group (a model dropdown drives every band).
  // withSelect=false → a plain group wrapper, used in single mode only when a
  // size/alignment needs a container to act on.
  const buildGroup = (withSelect: boolean): string => {
    const pad = "    ";
    let out = `<div class="patrik-range-bar-group"${alignAttr}${sizeAttr}>\n`;
    if (withSelect) {
      out += `${pad}<div class="patrik-rc-compare">\n`;
      if (compareLabel.trim())
        out += `${pad}    <span class="patrik-rc-compare-label">${esc(compareLabel)}</span>\n`;
      out += `${pad}    <select class="patrik-range-select">\n`;
      models.forEach((mdl, mi) => {
        const val = bars
          .map((_, i) => {
            const bd = mdl.bands[i] ?? { min: 0, max: 0 };
            return `${numOr0(bd.min)}:${numOr0(bd.max)}`;
          })
          .join(",");
        const sel = mi === defaultIndex ? " selected" : "";
        out += `${pad}        <option value="${val}"${sel}>${esc(mdl.name)}</option>\n`;
      });
      out += `${pad}    </select>\n`;
      out += `${pad}</div>\n`;
    }
    out += bars.map((b) => buildBar(b, pad, !withSelect)).join("\n\n") + `\n</div>`;
    return out;
  };

  let markup: string;
  if (mode === "compare") markup = buildGroup(true);
  else if (sizeAttr || alignAttr) markup = buildGroup(false);
  else markup = bars.map((b) => buildBar(b, "")).join("\n\n");
  const code = `${markup}\n\n<script src="${BUILDER_SCRIPT_URL}"></script>`;
  return { markup, code };
}

/* ── section layout (rows & columns composer) ─────────────────────────────── */

// The layout markup is pure STRUCTURE: classes + data-* config, no inline
// styles. patrik-components.js owns all of the styling (flex, gaps, bands,
// typography) and all of the responsive behaviour — it watches the section's
// own rendered width and scales gaps / paddings / headings fluidly from it,
// while columns stack via flex-wrap + min-width. The hosted renderer must be
// the current build of public/patrik-components.js for layout snippets to
// style themselves (older inline-styled snippets keep working: the script
// detects and skips them).

export type LayoutAlign = "left" | "center" | "right";

// Where a chart block's configuration came from — the saved build it was
// inserted from. Provenance only: the config is a copy, so editing the block
// never touches the saved build (and vice versa).
export type LayoutBlockSource = { id: string; name: string };

// What every block has regardless of what it draws.
//
// `insetX` is a PERCENTAGE of the column, not px — aesthetic breathing room
// between side-by-side columns. The renderer applies it to the block's own
// cell wrapper, so it is always relative to the column, never to the whole
// row — and it ramps the inset down as the section narrows (gone at ≤480px),
// because stacked mobile columns should give the content the full width.
// (It is no longer needed for radar axis labels: the renderer grows the SVG
// viewBox to contain them.)
export type LayoutBlockBase = {
  id: string;
  span: number;
  insetX: number;
  insetY: number;
};

export type LayoutBlock =
  | (LayoutBlockBase & {
      type: "radar-chart";
      config: RadarConfig;
      source?: LayoutBlockSource;
    })
  | (LayoutBlockBase & {
      type: "range-bars";
      config: RangeBarsConfig;
      source?: LayoutBlockSource;
    })
  | (LayoutBlockBase & {
      type: "heading";
      text: string;
      level: 2 | 3 | 4;
      align: LayoutAlign;
      color: string;
      size: number;
    })
  | (LayoutBlockBase & {
      type: "text";
      text: string;
      align: LayoutAlign;
      color: string;
      size: number;
    })
  | (LayoutBlockBase & {
      type: "image";
      src: string;
      alt: string;
      width: number;
      radius: number;
      align: LayoutAlign;
    })
  | (LayoutBlockBase & {
      type: "button";
      text: string;
      href: string;
      variant: "solid" | "outline";
      align: LayoutAlign;
      newTab: boolean;
      color: string;
    })
  | (LayoutBlockBase & { type: "spacer"; height: number })
  | (LayoutBlockBase & { type: "divider"; color: string });

export type LayoutBlockType = LayoutBlock["type"];

export type LayoutRow = {
  id: string;
  // Space between the columns of this row, in px.
  gap: number;
  // Below this column width the row stacks (each column's min-width).
  wrapAt: number;
  valign: "top" | "center" | "bottom" | "stretch";
  justify: LayoutAlign;
  // Optional band styling — an empty background means "no band at all", so the
  // row emits exactly the same markup it always did.
  background: string;
  padX: number;
  padY: number;
  radius: number;
  blocks: LayoutBlock[];
};

export type LayoutConfig = {
  maxWidth: number;
  rowGap: number;
  rows: LayoutRow[];
};

export const LAYOUT_HEADING_COLOR = "#eaf7fb";
export const LAYOUT_TEXT_COLOR = "#c7dce4";
export const LAYOUT_DIVIDER_COLOR = "#c7dce4";
export const LAYOUT_BUTTON_COLOR = "#38b6d3";
export const LAYOUT_ROW_BG = "#0b131c";

// LEGACY: the side room (% of the column) a radar block used to reserve, from
// when the renderer painted axis labels outside the SVG box. The renderer now
// grows the viewBox to contain the labels, so the room is pure wasted width —
// it is what made a chart look small next to a full-column neighbour. Kept
// only so normalizeLayoutBlock can recognise (and drop) the old auto-default
// in saved layouts.
export const LAYOUT_LABEL_ROOM = 10;

// Insets are aesthetic breathing room now — no block type needs one to render
// correctly, so nothing starts with one.
export function layoutBlockInsetDefault(_type: LayoutBlockType): number {
  return 0;
}

const indent = (markup: string, pad: string) =>
  markup
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");

export function layoutDefaultRow(over: Partial<LayoutRow> = {}): LayoutRow {
  return {
    id: "",
    gap: 32,
    wrapAt: 320,
    valign: "top",
    justify: "center",
    background: "",
    padX: 0,
    padY: 0,
    radius: 20,
    blocks: [],
    ...over,
  };
}

// A freshly inserted block of each kind. `id` is filled in by the caller.
export function layoutDefaultBlock(type: LayoutBlockType, id: string): LayoutBlock {
  const base = { id, span: 1, insetX: layoutBlockInsetDefault(type), insetY: 0 };
  switch (type) {
    case "radar-chart":
      return { ...base, type, config: radarDefaultConfig() };
    case "range-bars":
      return { ...base, type, config: rangeBarsDefaultConfig() };
    case "heading":
      return {
        ...base,
        type,
        text: "Section heading",
        level: 2,
        align: "center",
        color: LAYOUT_HEADING_COLOR,
        size: 28,
      };
    case "text":
      return {
        ...base,
        type,
        text: "A short paragraph describing this section.",
        align: "center",
        color: LAYOUT_TEXT_COLOR,
        size: 15,
      };
    case "image":
      return { ...base, type, src: "", alt: "", width: 100, radius: 14, align: "center" };
    case "button":
      return {
        ...base,
        type,
        text: "Learn more",
        href: "",
        variant: "solid",
        align: "center",
        newTab: false,
        color: LAYOUT_BUTTON_COLOR,
      };
    case "spacer":
      return { ...base, type, height: 48 };
    case "divider":
      return { ...base, type, color: LAYOUT_DIVIDER_COLOR };
  }
}

// A new layout starts as one empty row: chart blocks are always inserted from a
// saved build, so there is nothing sensible to pre-fill.
export function layoutDefaultConfig(): LayoutConfig {
  return {
    maxWidth: 1200,
    rowGap: 56,
    rows: [layoutDefaultRow({ id: "r1" })],
  };
}

const asSpan = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? Math.round(n) : 1;
};

const isAlign = (v: unknown): v is LayoutAlign =>
  v === "left" || v === "center" || v === "right";

const numOr = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function normalizeLayoutBlock(raw: unknown, fallbackId: string): LayoutBlock | null {
  const b = (raw ?? {}) as Partial<LayoutBlock> & Record<string, unknown>;
  const id = typeof b.id === "string" && b.id ? b.id : fallbackId;
  const type = b.type as LayoutBlockType | undefined;
  const src = b.source as LayoutBlockSource | undefined;
  const source =
    src && typeof src.id === "string" && typeof src.name === "string"
      ? { id: src.id, name: src.name }
      : undefined;
  if (!type) return null;
  // Migration: radar blocks used to be auto-seeded with LAYOUT_LABEL_ROOM (10%)
  // side room for axis labels the renderer no longer paints outside its box.
  // That exact value is dropped back to 0 so old saved layouts stop rendering
  // their charts smaller than their neighbours; any other inset is a deliberate
  // author choice and is kept.
  const rawInsetX = numOr(b.insetX, layoutBlockInsetDefault(type));
  const insetX = type === "radar-chart" && rawInsetX === LAYOUT_LABEL_ROOM ? 0 : rawInsetX;
  const base: LayoutBlockBase = {
    id,
    span: asSpan(b.span),
    insetX: Math.max(0, Math.min(40, insetX)),
    insetY: Math.max(0, numOr(b.insetY, 0)),
  };
  switch (type) {
    case "radar-chart":
      return { ...base, type: "radar-chart", source, config: normalizeRadarConfig(b.config) };
    case "range-bars":
      return { ...base, type: "range-bars", source, config: normalizeRangeBarsConfig(b.config) };
    case "heading": {
      const d = layoutDefaultBlock("heading", id) as Extract<LayoutBlock, { type: "heading" }>;
      const lvl = Number(b.level);
      return {
        ...d,
        ...base,
        type: "heading",
        text: typeof b.text === "string" ? b.text : d.text,
        level: lvl === 3 || lvl === 4 ? (lvl as 3 | 4) : 2,
        align: isAlign(b.align) ? b.align : d.align,
        color: typeof b.color === "string" ? b.color : d.color,
        size: numOr(b.size, d.size),
      };
    }
    case "text": {
      const d = layoutDefaultBlock("text", id) as Extract<LayoutBlock, { type: "text" }>;
      return {
        ...d,
        ...base,
        type: "text",
        text: typeof b.text === "string" ? b.text : d.text,
        align: isAlign(b.align) ? b.align : d.align,
        color: typeof b.color === "string" ? b.color : d.color,
        size: numOr(b.size, d.size),
      };
    }
    case "image": {
      const d = layoutDefaultBlock("image", id) as Extract<LayoutBlock, { type: "image" }>;
      return {
        ...d,
        ...base,
        type: "image",
        src: typeof b.src === "string" ? b.src : d.src,
        alt: typeof b.alt === "string" ? b.alt : d.alt,
        width: Math.max(5, Math.min(100, numOr(b.width, d.width))),
        radius: Math.max(0, numOr(b.radius, d.radius)),
        align: isAlign(b.align) ? b.align : d.align,
      };
    }
    case "button": {
      const d = layoutDefaultBlock("button", id) as Extract<LayoutBlock, { type: "button" }>;
      return {
        ...d,
        ...base,
        type: "button",
        text: typeof b.text === "string" ? b.text : d.text,
        href: typeof b.href === "string" ? b.href : d.href,
        variant: b.variant === "outline" ? "outline" : "solid",
        align: isAlign(b.align) ? b.align : d.align,
        newTab: b.newTab === true,
        color: typeof b.color === "string" ? b.color : d.color,
      };
    }
    case "spacer":
      return { ...base, type: "spacer", height: numOr(b.height, 48) };
    case "divider":
      return {
        ...base,
        type: "divider",
        color: typeof b.color === "string" ? b.color : LAYOUT_DIVIDER_COLOR,
      };
    default:
      return null;
  }
}

export function normalizeLayoutConfig(raw: unknown): LayoutConfig {
  const c = (raw ?? {}) as Partial<LayoutConfig>;
  const rows = Array.isArray(c.rows) ? c.rows : [];
  const out: LayoutRow[] = rows.map((r, ri) => {
    const row = (r ?? {}) as Partial<LayoutRow>;
    return layoutDefaultRow({
      id: typeof row.id === "string" && row.id ? row.id : `r${ri}`,
      gap: numOr(row.gap, 32),
      wrapAt: numOr(row.wrapAt, 320),
      valign: (["top", "center", "bottom", "stretch"] as const).includes(row.valign as never)
        ? (row.valign as LayoutRow["valign"])
        : "top",
      justify: isAlign(row.justify) ? row.justify : "center",
      background: typeof row.background === "string" ? row.background : "",
      padX: Math.max(0, numOr(row.padX, 0)),
      padY: Math.max(0, numOr(row.padY, 0)),
      radius: Math.max(0, numOr(row.radius, 20)),
      blocks: (Array.isArray(row.blocks) ? row.blocks : [])
        .map((b, bi) => normalizeLayoutBlock(b, `r${ri}b${bi}`))
        .filter((b): b is LayoutBlock => b != null),
    });
  });
  return {
    maxWidth: typeof c.maxWidth === "number" ? c.maxWidth : 1200,
    rowGap: typeof c.rowGap === "number" ? c.rowGap : 56,
    rows: out.length ? out : layoutDefaultConfig().rows,
  };
}

// data-* attribute list → ` data-a="1" data-b="2"`, skipping empty values.
// Blocks only carry what differs from the renderer's stylesheet defaults, so
// the emitted HTML stays minimal.
const dataAttrs = (pairs: [string, string | number | false | null | undefined][]): string =>
  pairs
    .filter((p): p is [string, string | number] => p[1] !== false && p[1] !== null && p[1] !== undefined && p[1] !== "")
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join("");

// The markup of one block, WITHOUT its column wrapper. Pure structure — the
// renderer's injected stylesheet does the styling (fluidly, from the section's
// own width), so there are no inline styles to fight it.
export function generateLayoutBlock(block: LayoutBlock): string {
  switch (block.type) {
    case "radar-chart":
      return generateRadarChart(block.config).markup;
    case "range-bars":
      return generateRangeBars(block.config).markup;
    case "heading": {
      const tag = `h${block.level}`;
      const attrs = dataAttrs([
        ["data-size", block.size !== 28 && block.size],
        ["data-align", block.align !== "center" && block.align],
        ["data-color", block.color.toLowerCase() !== LAYOUT_HEADING_COLOR && block.color],
      ]);
      return `<${tag} class="patrik-layout-heading"${attrs}>${esc(block.text)}</${tag}>`;
    }
    case "text": {
      const attrs = dataAttrs([
        ["data-size", block.size !== 15 && block.size],
        ["data-align", block.align !== "center" && block.align],
        ["data-color", block.color.toLowerCase() !== LAYOUT_TEXT_COLOR && block.color],
      ]);
      // Author-entered newlines become <br> so the paragraph keeps its shape.
      const body = esc(block.text).replace(/\r?\n/g, "<br>\n");
      return `<p class="patrik-layout-text"${attrs}>${body}</p>`;
    }
    case "image": {
      if (!block.src.trim()) return `<!-- image block: no image URL set -->`;
      const attrs = dataAttrs([
        ["data-width", block.width !== 100 && block.width],
        ["data-radius", block.radius !== 14 && block.radius],
        ["data-align", block.align !== "center" && block.align],
      ]);
      return `<img class="patrik-layout-image" src="${esc(block.src.trim())}" alt="${esc(
        block.alt,
      )}"${attrs} loading="lazy">`;
    }
    case "button": {
      // A snippet is pasted straight into a live page — never emit a scripted
      // URL from a free-text field.
      const raw = block.href.trim();
      const href = /^\s*javascript:/i.test(raw) ? "" : raw;
      const ctaAttrs = dataAttrs([["data-align", block.align !== "center" && block.align]]);
      const btnAttrs = [
        href ? ` href="${esc(href)}"` : "",
        block.newTab ? ` target="_blank" rel="noopener noreferrer"` : "",
        dataAttrs([
          ["data-variant", block.variant === "outline" && "outline"],
          ["data-color", block.color.toLowerCase() !== LAYOUT_BUTTON_COLOR && block.color],
        ]),
      ].join("");
      return (
        `<div class="patrik-layout-cta"${ctaAttrs}>\n` +
        `    <a class="patrik-layout-button"${btnAttrs}>${esc(block.text)}</a>\n` +
        `</div>`
      );
    }
    case "spacer":
      return `<div class="patrik-layout-spacer" data-height="${block.height}" aria-hidden="true"></div>`;
    case "divider": {
      const attrs = dataAttrs([
        ["data-color", block.color.toLowerCase() !== LAYOUT_DIVIDER_COLOR && block.color],
      ]);
      return `<div class="patrik-layout-divider"${attrs} aria-hidden="true"></div>`;
    }
  }
}

export function generateLayout(cfg: LayoutConfig): { markup: string; code: string } {
  const rows = cfg.rows.filter((r) => r.blocks.length > 0);

  const buildRow = (row: LayoutRow, pad: string): string => {
    const n = row.blocks.length;
    const banded = !!row.background.trim();
    const rowAttrs = dataAttrs([
      ["data-gap", row.gap !== 32 && row.gap],
      ["data-wrap", row.wrapAt !== 320 && row.wrapAt],
      ["data-valign", row.valign !== "top" && row.valign],
      ["data-justify", row.justify !== "center" && row.justify],
      ["data-band", banded && row.background.trim()],
      ["data-pad-x", row.padX > 0 && row.padX],
      ["data-pad-y", row.padY > 0 && row.padY],
      ["data-radius", banded && row.radius !== 20 && row.radius],
    ]);

    const cols = row.blocks.map((block) => {
      const colAttrs = dataAttrs([
        ["data-span", n > 1 && Math.max(1, block.span)],
        ["data-inset-x", block.insetX > 0 && block.insetX],
        ["data-inset-y", block.insetY > 0 && block.insetY],
      ]);

      // The renderer applies the insets to an inner cell, never to the column:
      // a percentage padding resolves against the *containing block*, so on
      // the column it would be a share of the whole row instead of of the
      // column itself. The cell wrapper is only emitted when there is an inset.
      const inset = block.insetX > 0 || block.insetY > 0;
      const body = inset
        ? `${pad}        <div class="patrik-layout-cell">\n` +
          `${indent(generateLayoutBlock(block), pad + "            ")}\n` +
          `${pad}        </div>`
        : indent(generateLayoutBlock(block), pad + "        ");

      return (
        `${pad}    <div class="patrik-layout-col"${colAttrs}>\n` +
        `${body}\n` +
        `${pad}    </div>`
      );
    });

    return `${pad}<div class="patrik-layout-row"${rowAttrs}>\n${cols.join("\n")}\n${pad}</div>`;
  };

  // data-max is always written: besides carrying the width it marks the markup
  // as the data-* format (the renderer leaves legacy inline-styled layouts,
  // which have no data-max, exactly as they are).
  const rootAttrs = dataAttrs([
    ["data-max", cfg.maxWidth],
    ["data-row-gap", cfg.rowGap !== 56 && cfg.rowGap],
  ]);

  const markup = rows.length
    ? `<div class="patrik-layout"${rootAttrs}>\n${rows
        .map((r) => buildRow(r, "    "))
        .join("\n")}\n</div>`
    : `<div class="patrik-layout"${rootAttrs}></div>`;

  const code = `${markup}\n\n<script src="${BUILDER_SCRIPT_URL}"></script>`;
  return { markup, code };
}

/* ── dispatcher ───────────────────────────────────────────────────────────── */

// Turn a saved (opaque) config blob into a snippet. Defensive: a malformed or
// legacy config returns null instead of throwing, so saved-build surfaces can
// degrade gracefully.
export function generateSnippet(
  builder: string,
  config: unknown,
): { markup: string; code: string } | null {
  try {
    if (builder === "radar-chart") return generateRadarChart(normalizeRadarConfig(config));
    if (builder === "range-bars") return generateRangeBars(normalizeRangeBarsConfig(config));
    if (builder === "layout") return generateLayout(normalizeLayoutConfig(config));
    return null;
  } catch {
    return null;
  }
}
