"use client";
// The control panels of the individual section components, extracted from the
// builder pages so they can be driven from anywhere: the dedicated
// /builder/radar-chart and /builder/range-bars pages own the whole config, and
// the /builder/layout composer drives the very same controls for whichever
// block is selected on its canvas.
//
// Each panel is fully controlled — it takes a config object and hands back a
// new one. The only state it owns is drag-and-drop identity (axis keys, stop
// keys), which is UI-only and never meaningful to the generated markup.
import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import {
  RADAR_DEF,
  RANGE_DEF_RANGE,
  normalizeRadarConfig,
  normalizeRangeBarsConfig,
  rangeBarDefault,
  type RadarConfig,
  type RangeBar,
  type RangeBand,
  type RangeBarsConfig,
} from "./generators";
import {
  Group,
  Field,
  TextField,
  NumberField,
  Segmented,
  Select,
  Slider,
  CheckRow,
  ColorField,
  IconButton,
  RemoveIcon,
  AddButton,
  SubCard,
  DefaultPill,
} from "./builder-ui";

/* ── shared bits ──────────────────────────────────────────────────────────── */

// Keep the "shown first" pointer valid after an entry is removed: it follows
// its entry, and falls back to the first one if that entry was the one removed.
function indexAfterRemove(current: number, removed: number, len: number): number {
  const next = removed === current ? 0 : removed < current ? current - 1 : current;
  return next >= 0 && next < len ? next : 0;
}

function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/* A draggable row (handle-based, so the text input stays editable). */
function SortableRow({
  id,
  index,
  value,
  placeholder,
  onChange,
  onRemove,
  removeTitle,
}: {
  id: string;
  index?: number;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
  removeTitle: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1.5 rounded-lg",
        isDragging && "relative z-10 bg-surface shadow-lg ring-1 ring-blue-400/50",
      )}
    >
      <button
        type="button"
        className="w-5 h-8 flex items-center justify-center text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      {index != null && (
        <span className="w-5 h-8 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">
          {index}
        </span>
      )}
      <TextField value={value} onChange={onChange} placeholder={placeholder} />
      {onRemove && (
        <IconButton onClick={onRemove} title={removeTitle}>
          <RemoveIcon />
        </IconButton>
      )}
    </div>
  );
}

/* ── radar chart ──────────────────────────────────────────────────────────── */

const COLOR_FIELDS = [
  { key: "fill", label: "Fill" },
  { key: "stroke", label: "Outline" },
  { key: "point", label: "Points" },
  { key: "grid", label: "Grid" },
  { key: "axisColor", label: "Axis lines" },
  { key: "labelColor", label: "Labels" },
] as const;

type ColorKey = (typeof COLOR_FIELDS)[number]["key"];

export function RadarControls({
  value,
  onChange,
  startNum = 1,
}: {
  value: RadarConfig;
  onChange: (next: RadarConfig) => void;
  // Where this panel's numbered groups start — so the layout composer can slot
  // them in after its own canvas / row groups.
  startNum?: number;
}) {
  const { mode, align, size, compareLabel, axes, values, datasets, defaultIndex, colors } = value;
  const sensors = useDragSensors();
  const patch = (p: Partial<RadarConfig>) => onChange({ ...value, ...p });

  // Stable drag-and-drop identity per axis, kept in lockstep with `axes`. Only
  // regenerated when the config is replaced from the outside (preset load,
  // block switch) with a different number of axes.
  const seq = useRef(0);
  const mkKey = () => `ax${seq.current++}`;
  const [axisKeys, setAxisKeys] = useState<string[]>(() => axes.map(mkKey));
  useEffect(() => {
    setAxisKeys((k) => (k.length === axes.length ? k : axes.map(() => mkKey())));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axes.length]);

  const addAxis = () => {
    setAxisKeys((k) => [...k, mkKey()]);
    patch({
      axes: [...axes, "NEW"],
      values: [...values, 50],
      datasets: datasets.map((d) => ({ ...d, values: [...d.values, 50] })),
    });
  };
  const removeAxis = (i: number) => {
    if (axes.length <= 3) return;
    setAxisKeys((k) => k.filter((_, idx) => idx !== i));
    patch({
      axes: axes.filter((_, idx) => idx !== i),
      values: values.filter((_, idx) => idx !== i),
      datasets: datasets.map((d) => ({ ...d, values: d.values.filter((_, idx) => idx !== i) })),
    });
  };

  // Reorder axes and every index-aligned array together.
  const onAxisDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = axisKeys.indexOf(String(active.id));
    const to = axisKeys.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setAxisKeys((k) => arrayMove(k, from, to));
    patch({
      axes: arrayMove(axes, from, to),
      values: arrayMove(values, from, to),
      datasets: datasets.map((d) => ({ ...d, values: arrayMove(d.values, from, to) })),
    });
  };

  const setColor = (key: ColorKey, v: string) => patch({ colors: { ...colors, [key]: v } });

  return (
    <>
      <Group num={startNum} title="Mode & layout">
        <Segmented
          value={mode}
          onChange={(m) => patch({ mode: m })}
          options={[
            { value: "single", label: "Single dataset" },
            { value: "compare", label: "Comparison" },
          ]}
        />
        <Field label="Alignment">
          <Segmented
            value={align}
            onChange={(a) => patch({ align: a })}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
              { value: "right", label: "Right" },
            ]}
          />
        </Field>
        <Slider
          label="Size (px)"
          value={size}
          min={240}
          max={640}
          step={10}
          onChange={(v) => patch({ size: v })}
        />
        {mode === "compare" && (
          <Field label="Compare label">
            <TextField
              value={compareLabel}
              onChange={(v) => patch({ compareLabel: v })}
              placeholder="Compare models"
            />
          </Field>
        )}
      </Group>

      <Group num={startNum + 1} title="Axes">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onAxisDragEnd}>
          <SortableContext items={axisKeys} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {axes.map((name, i) => (
                <SortableRow
                  key={axisKeys[i] ?? i}
                  id={axisKeys[i] ?? String(i)}
                  value={name}
                  placeholder="Axis label"
                  onChange={(v) => patch({ axes: axes.map((x, idx) => (idx === i ? v : x)) })}
                  onRemove={axes.length > 3 ? () => removeAxis(i) : undefined}
                  removeTitle="Remove axis"
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <p className="text-[10.5px] text-muted-foreground mt-2">
          Drag the handle to reorder. At least 3 axes are required.
        </p>
        <AddButton onClick={addAxis}>Add axis</AddButton>
      </Group>

      <Group num={startNum + 2} title={mode === "single" ? "Values" : "Datasets"}>
        {mode === "single" ? (
          <div className="space-y-2.5">
            {axes.map((ax, i) => (
              <Slider
                key={i}
                label={ax}
                value={values[i] ?? 50}
                onChange={(v) => patch({ values: values.map((x, idx) => (idx === i ? v : x)) })}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[10.5px] text-muted-foreground leading-relaxed">
              The dataset marked <strong className="text-foreground">shown first</strong> is what the
              dropdown displays when the page loads — switching models in the live preview sets it
              too.
            </p>
            {datasets.map((ds, di) => (
              <SubCard
                key={di}
                title={`Dataset ${di + 1}`}
                action={
                  datasets.length > 1 ? (
                    <DefaultPill
                      active={di === defaultIndex}
                      onClick={() => patch({ defaultIndex: di })}
                      title={
                        di === defaultIndex
                          ? "This dataset is shown when the page loads"
                          : "Show this dataset when the page loads"
                      }
                    />
                  ) : undefined
                }
                onRemove={
                  datasets.length > 1
                    ? () =>
                        patch({
                          datasets: datasets.filter((_, idx) => idx !== di),
                          defaultIndex: indexAfterRemove(defaultIndex, di, datasets.length - 1),
                        })
                    : undefined
                }
              >
                <TextField
                  value={ds.name}
                  onChange={(v) =>
                    patch({ datasets: datasets.map((d, idx) => (idx === di ? { ...d, name: v } : d)) })
                  }
                  placeholder="Dataset name (dropdown label)"
                />
                <div className="space-y-2.5 pt-1">
                  {axes.map((ax, i) => (
                    <Slider
                      key={i}
                      label={ax}
                      value={ds.values[i] ?? 50}
                      onChange={(v) =>
                        patch({
                          datasets: datasets.map((d, idx) =>
                            idx !== di
                              ? d
                              : { ...d, values: d.values.map((x, j) => (j === i ? v : x)) },
                          ),
                        })
                      }
                    />
                  ))}
                </div>
              </SubCard>
            ))}
            <AddButton
              onClick={() =>
                patch({ datasets: [...datasets, { name: "New model", values: axes.map(() => 60) }] })
              }
            >
              Add dataset
            </AddButton>
          </div>
        )}
      </Group>

      <Group num={startNum + 3} title="Colours" optional>
        <div className="grid grid-cols-2 gap-2.5">
          {COLOR_FIELDS.map((f) => (
            <ColorField
              key={f.key}
              label={f.label}
              value={colors[f.key]}
              onChange={(v) => setColor(f.key, v)}
              onReset={
                colors[f.key].toLowerCase() !== RADAR_DEF[f.key]
                  ? () => setColor(f.key, RADAR_DEF[f.key])
                  : undefined
              }
            />
          ))}
        </div>
        <div className="pt-1">
          <Slider
            label="Fill intensity"
            value={colors.fillOpacity}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => patch({ colors: { ...colors, fillOpacity: v } })}
          />
        </div>
        <p className="text-[10.5px] text-muted-foreground leading-relaxed">
          The fill renders as a smooth gradient of the colour you pick — intensity sets how strong it
          is at the top. Only colours you change are written into the snippet; everything else uses
          the component defaults.
        </p>
      </Group>
    </>
  );
}

/* ── range bars ───────────────────────────────────────────────────────────── */

// Deterministic stop-key counter (stable across SSR/CSR because keys are only
// minted in the same call order). Gives drag-and-drop a stable identity per
// stop even when labels duplicate or are blank.
let _sid = 0;
const sid = () => `s${_sid++}`;

// Mint fresh stop keys for every bar — used whenever a config arrives from
// outside (preset load, block switch) so saved keys can never collide with the
// live counter.
export function withFreshStopKeys(cfg: RangeBarsConfig): RangeBarsConfig {
  return {
    ...cfg,
    bars: cfg.bars.map((b) => ({
      ...b,
      stopKeys: String(b.scale ?? "").split(",").map(() => sid()),
    })),
  };
}

export const readRangeBarsConfig = (raw: unknown): RangeBarsConfig =>
  withFreshStopKeys(normalizeRangeBarsConfig(raw));

export const readRadarConfig = (raw: unknown): RadarConfig => normalizeRadarConfig(raw);

export const newRangeBar = (over: Partial<RangeBar> = {}): RangeBar => {
  const bar = rangeBarDefault(over);
  return { ...bar, stopKeys: bar.scale.split(",").map(() => sid()) };
};

// A dropdown that picks one of the scale's stops by its 0-based index — used
// for the band start/end when the band snaps to stops, so the values are the
// actual labels rather than raw numbers.
function StopSelect({
  value,
  stops,
  onChange,
}: {
  value: number | "";
  stops: string[];
  onChange: (v: number) => void;
}) {
  return (
    <Select
      value={value === "" ? 0 : value}
      onChange={(v) => onChange(Number(v))}
      ariaLabel="Select stop"
      options={stops.map((s, i) => ({ value: i, label: `${i} · ${s.trim() || "(blank)"}` }))}
    />
  );
}

export function RangeBarsControls({
  value,
  onChange,
  startNum = 1,
}: {
  value: RangeBarsConfig;
  onChange: (next: RangeBarsConfig) => void;
  startNum?: number;
}) {
  const { mode, align, size, compareLabel, bars, models, defaultIndex } = value;
  const sensors = useDragSensors();
  const patch = (p: Partial<RangeBarsConfig>) => onChange({ ...value, ...p });

  const updateBar = (bi: number, p: Partial<RangeBar>) =>
    patch({ bars: bars.map((b, i) => (i === bi ? { ...b, ...p } : b)) });

  // Keep every model's bands index-aligned when bars are added / removed.
  const removeBar = (bi: number) =>
    patch({
      bars: bars.filter((_, i) => i !== bi),
      models: models.map((m) => ({ ...m, bands: m.bands.filter((_, i) => i !== bi) })),
    });
  const addBar = () =>
    patch({
      bars: [...bars, newRangeBar()],
      models: models.map((m) => ({ ...m, bands: [...m.bands, { min: 20, max: 70 }] })),
    });

  const setBand = (mi: number, bi: number, p: Partial<RangeBand>) =>
    patch({
      models: models.map((m, i) =>
        i !== mi ? m : { ...m, bands: m.bands.map((bd, j) => (j === bi ? { ...bd, ...p } : bd)) },
      ),
    });

  return (
    <>
      <Group num={startNum} title="Mode & layout">
        <Segmented
          value={mode}
          onChange={(m) => patch({ mode: m })}
          options={[
            { value: "single", label: "Single" },
            { value: "compare", label: "Comparison" },
          ]}
        />
        <Slider
          label={size >= 720 ? "Width: full" : "Width (px)"}
          value={size}
          min={320}
          max={720}
          step={20}
          onChange={(v) => patch({ size: v })}
        />
        {(mode === "compare" || size < 720) && (
          <Field label="Alignment">
            <Segmented
              value={align}
              onChange={(a) => patch({ align: a })}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Center" },
                { value: "right", label: "Right" },
              ]}
            />
          </Field>
        )}
        {mode === "compare" && (
          <Field label="Compare label">
            <TextField
              value={compareLabel}
              onChange={(v) => patch({ compareLabel: v })}
              placeholder="Compare models"
            />
          </Field>
        )}
      </Group>

      <Group num={startNum + 1} title="Bars">
        {mode === "compare" && (
          <p className="text-[10.5px] text-muted-foreground leading-relaxed">
            These define each bar&apos;s structure. The band start/end come from the models below, so
            the dropdown can switch every bar at once.
          </p>
        )}
        <div className="space-y-3">
          {bars.map((bar, bi) => {
            const stops = bar.scale.split(",");
            // Keep keys aligned to stops defensively (should already match).
            const keys =
              bar.stopKeys && bar.stopKeys.length === stops.length
                ? bar.stopKeys
                : stops.map((_, i) => bar.stopKeys?.[i] ?? sid());

            const editStop = (si: number, v: string) =>
              updateBar(bi, { scale: stops.map((x, j) => (j === si ? v : x)).join(",") });
            const addStop = () =>
              updateBar(bi, {
                scale: [...stops, `Stop ${stops.length + 1}`].join(","),
                stopKeys: [...keys, sid()],
              });
            const removeStop = (si: number) =>
              updateBar(bi, {
                scale: stops.filter((_, j) => j !== si).join(","),
                stopKeys: keys.filter((_, j) => j !== si),
              });
            const reorderStops = (e: DragEndEvent) => {
              const { active, over } = e;
              if (!over || active.id === over.id) return;
              const from = keys.indexOf(String(active.id));
              const to = keys.indexOf(String(over.id));
              if (from < 0 || to < 0) return;
              // order[newPos] = oldIndex — used to remap the band's stop indexes.
              const order = arrayMove(stops.map((_, i) => i), from, to);
              const p: Partial<RangeBar> = {
                scale: arrayMove(stops, from, to).join(","),
                stopKeys: arrayMove(keys, from, to),
              };
              if (bar.scaleIndex) {
                if (typeof bar.min === "number") {
                  const ni = order.indexOf(bar.min);
                  if (ni >= 0) p.min = ni;
                }
                if (typeof bar.max === "number") {
                  const ni = order.indexOf(bar.max);
                  if (ni >= 0) p.max = ni;
                }
              }
              updateBar(bi, p);
            };

            return (
              <SubCard
                key={bi}
                title={`Bar ${bi + 1}`}
                onRemove={bars.length > 1 ? () => removeBar(bi) : undefined}
              >
                <Segmented
                  value={bar.mode}
                  onChange={(m) => updateBar(bi, { mode: m })}
                  options={[
                    { value: "two", label: "Two-pole" },
                    { value: "scale", label: "Scale" },
                  ]}
                />

                <Field label="Title">
                  <TextField
                    value={bar.title}
                    onChange={(v) => updateBar(bi, { title: v })}
                    placeholder="e.g. Power delivery"
                  />
                </Field>

                {bar.mode === "two" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Left label">
                        <TextField
                          value={bar.left}
                          onChange={(v) => updateBar(bi, { left: v })}
                          placeholder="Direct"
                        />
                      </Field>
                      <Field label="Right label">
                        <TextField
                          value={bar.right}
                          onChange={(v) => updateBar(bi, { right: v })}
                          placeholder="Smooth"
                        />
                      </Field>
                    </div>
                    {mode === "single" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Band start" hint="(0–100%)">
                          <NumberField value={bar.min} onChange={(v) => updateBar(bi, { min: v })} />
                        </Field>
                        <Field label="Band end" hint="(0–100%)">
                          <NumberField value={bar.max} onChange={(v) => updateBar(bi, { max: v })} />
                        </Field>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Stops{" "}
                        <span className="text-muted-foreground/60 font-normal">
                          (drag to reorder, left → right)
                        </span>
                      </span>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={reorderStops}
                      >
                        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1.5 mt-1.5">
                            {stops.map((s, si) => (
                              <SortableRow
                                key={keys[si]}
                                id={keys[si]}
                                index={si}
                                value={s}
                                placeholder={`Stop ${si + 1}`}
                                onChange={(v) => editStop(si, v)}
                                onRemove={stops.length > 2 ? () => removeStop(si) : undefined}
                                removeTitle="Remove stop"
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                      <div className="mt-1.5">
                        <AddButton onClick={addStop}>Add stop</AddButton>
                      </div>
                    </div>

                    <CheckRow
                      checked={bar.scaleIndex}
                      onChange={(v) => updateBar(bi, { scaleIndex: v })}
                    >
                      Band snaps to stops
                    </CheckRow>

                    {mode === "single" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Band start" hint={bar.scaleIndex ? undefined : "(0–100%)"}>
                          {bar.scaleIndex ? (
                            <StopSelect
                              value={bar.min}
                              stops={stops}
                              onChange={(v) => updateBar(bi, { min: v })}
                            />
                          ) : (
                            <NumberField value={bar.min} onChange={(v) => updateBar(bi, { min: v })} />
                          )}
                        </Field>
                        <Field label="Band end" hint={bar.scaleIndex ? undefined : "(0–100%)"}>
                          {bar.scaleIndex ? (
                            <StopSelect
                              value={bar.max}
                              stops={stops}
                              onChange={(v) => updateBar(bi, { max: v })}
                            />
                          ) : (
                            <NumberField value={bar.max} onChange={(v) => updateBar(bi, { max: v })} />
                          )}
                        </Field>
                      </div>
                    )}
                  </>
                )}

                <CheckRow checked={bar.marker} onChange={(v) => updateBar(bi, { marker: v })}>
                  Add a single marker line
                </CheckRow>
                {bar.marker && (
                  <Slider label="Marker" value={bar.value} onChange={(v) => updateBar(bi, { value: v })} />
                )}

                <ColorField
                  label="Band colour"
                  value={bar.range}
                  onChange={(v) => updateBar(bi, { range: v })}
                  onReset={
                    bar.range.toLowerCase() !== RANGE_DEF_RANGE
                      ? () => updateBar(bi, { range: RANGE_DEF_RANGE })
                      : undefined
                  }
                />
              </SubCard>
            );
          })}
        </div>
        <AddButton onClick={addBar}>Add bar</AddButton>
        <p className="text-[10.5px] text-muted-foreground leading-relaxed pt-1">
          Each band renders as a smooth gradient of its colour — matching the radar chart&apos;s
          fill. Leave the band colour at the default for the brand teal.
        </p>
      </Group>

      {mode === "compare" && (
        <Group num={startNum + 2} title="Models">
          <div className="space-y-3">
            <p className="text-[10.5px] text-muted-foreground leading-relaxed">
              The model marked <strong className="text-foreground">shown first</strong> is what the
              dropdown displays when the page loads — switching models in the live preview sets it
              too.
            </p>
            {models.map((mdl, mi) => (
              <SubCard
                key={mi}
                title={`Model ${mi + 1}`}
                action={
                  models.length > 1 ? (
                    <DefaultPill
                      active={mi === defaultIndex}
                      onClick={() => patch({ defaultIndex: mi })}
                      title={
                        mi === defaultIndex
                          ? "This model is shown when the page loads"
                          : "Show this model when the page loads"
                      }
                    />
                  ) : undefined
                }
                onRemove={
                  models.length > 1
                    ? () =>
                        patch({
                          models: models.filter((_, i) => i !== mi),
                          defaultIndex: indexAfterRemove(defaultIndex, mi, models.length - 1),
                        })
                    : undefined
                }
              >
                <Field label="Name (dropdown label)">
                  <TextField
                    value={mdl.name}
                    onChange={(v) =>
                      patch({ models: models.map((m, i) => (i === mi ? { ...m, name: v } : m)) })
                    }
                    placeholder="e.g. 4Wave FLOW HD"
                  />
                </Field>
                <div className="space-y-2 pt-1">
                  {bars.map((bar, bi) => {
                    const stops = bar.scale.split(",");
                    const band = mdl.bands[bi] ?? { min: "" as number | "", max: "" as number | "" };
                    const isIdx = bar.mode === "scale" && bar.scaleIndex;
                    return (
                      <div
                        key={bi}
                        className="rounded-lg border border-border/60 bg-background/40 p-2.5 space-y-1.5"
                      >
                        <span
                          className="text-[11px] font-medium text-muted-foreground truncate block"
                          title={bar.title}
                        >
                          {bar.title || `Bar ${bi + 1}`}
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Start" hint={isIdx ? undefined : "(0–100%)"}>
                            {isIdx ? (
                              <StopSelect
                                value={band.min}
                                stops={stops}
                                onChange={(v) => setBand(mi, bi, { min: v })}
                              />
                            ) : (
                              <NumberField
                                value={band.min}
                                onChange={(v) => setBand(mi, bi, { min: v })}
                              />
                            )}
                          </Field>
                          <Field label="End" hint={isIdx ? undefined : "(0–100%)"}>
                            {isIdx ? (
                              <StopSelect
                                value={band.max}
                                stops={stops}
                                onChange={(v) => setBand(mi, bi, { max: v })}
                              />
                            ) : (
                              <NumberField
                                value={band.max}
                                onChange={(v) => setBand(mi, bi, { max: v })}
                              />
                            )}
                          </Field>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SubCard>
            ))}
            <AddButton
              onClick={() =>
                patch({
                  models: [
                    ...models,
                    { name: `Model ${models.length + 1}`, bands: bars.map(() => ({ min: 20, max: 70 })) },
                  ],
                })
              }
            >
              Add model
            </AddButton>
          </div>
        </Group>
      )}
    </>
  );
}
