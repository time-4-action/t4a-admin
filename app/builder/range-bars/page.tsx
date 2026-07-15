"use client";
import { useMemo, useState } from "react";
import { SlidersHorizontal, GripVertical } from "lucide-react";
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
import { BUILDER_SCRIPT_URL } from "@/lib/builder-role";
import { cn } from "@/lib/utils";
import {
  BuilderShell,
  Group,
  Field,
  TextField,
  NumberField,
  Segmented,
  Select,
  Slider,
  CheckRow,
  ColorField,
  AddButton,
  IconButton,
  RemoveIcon,
  SubCard,
} from "../builder-ui";

// Sentinel band colour. When a bar keeps this value no data-range is emitted,
// so patrik-components.js renders its smooth teal gradient fill. Pick any other
// colour and it is written out as a flat data-range override.
const DEF_RANGE = "#38b6d3";

// Deterministic stop-key counter (stable across SSR/CSR because keys are only
// minted in the same call order). Gives drag-and-drop a stable identity per
// stop even when labels duplicate or are blank.
let _sid = 0;
const sid = () => `s${_sid++}`;

// A single draggable stop row (handle-based, so the label input stays editable).
function SortableStopRow({
  id,
  index,
  value,
  onChange,
  onRemove,
}: {
  id: string;
  index: number;
  value: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
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
      <span className="w-5 h-8 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">
        {index}
      </span>
      <TextField value={value} onChange={onChange} placeholder={`Stop ${index + 1}`} />
      {onRemove && (
        <IconButton onClick={onRemove} title="Remove stop">
          <RemoveIcon />
        </IconButton>
      )}
    </div>
  );
}

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

type BarMode = "two" | "scale";
type Bar = {
  mode: BarMode;
  title: string;
  left: string;
  right: string;
  min: number | "";
  max: number | "";
  marker: boolean;
  value: number;
  range: string;
  scale: string;
  // Stable drag-and-drop keys, one per comma-separated stop in `scale`.
  stopKeys: string[];
  scaleIndex: boolean;
};

type Align = "left" | "center" | "right";
// In comparison mode a "model" supplies each bar's band (start/end); the bars'
// own structure (title, poles, scale) stays fixed. `bands` is index-aligned to
// the bars array.
type Band = { min: number | ""; max: number | "" };
type Model = { name: string; bands: Band[] };

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const newBar = (over: Partial<Bar> = {}): Bar => {
  const base = {
    mode: "two" as BarMode,
    title: "New bar",
    left: "Left",
    right: "Right",
    min: 20 as number | "",
    max: 70 as number | "",
    marker: false,
    value: 50,
    range: DEF_RANGE,
    scale: "Entry,Intermediate,Advanced,Pro",
    scaleIndex: true,
    ...over,
  };
  return { ...base, stopKeys: base.scale.split(",").map(() => sid()) };
};

export default function RangeBarsBuilder() {
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [align, setAlign] = useState<Align>("center");
  const [compareLabel, setCompareLabel] = useState("Compare models");
  const [size, setSize] = useState(720); // group max width in px; 720 = full width
  const [bars, setBars] = useState<Bar[]>([
    newBar({ title: "Power delivery", left: "Direct", right: "Smooth", min: 25, max: 62 }),
    newBar({ title: "Center of effort", left: "Backhanded", right: "Fronthanded", min: 45, max: 80 }),
  ]);
  // Models for comparison mode; bands stay index-aligned to `bars`.
  const [models, setModels] = useState<Model[]>([
    { name: "4Wave FLOW HD", bands: [{ min: 25, max: 62 }, { min: 45, max: 80 }] },
    { name: "4Wave FLASH HD", bands: [{ min: 40, max: 75 }, { min: 55, max: 90 }] },
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const updateBar = (bi: number, patch: Partial<Bar>) =>
    setBars((bs) => bs.map((b, i) => (i === bi ? { ...b, ...patch } : b)));
  // Keep every model's bands index-aligned when bars are added / removed.
  const removeBar = (bi: number) => {
    setBars((bs) => bs.filter((_, i) => i !== bi));
    setModels((ms) => ms.map((m) => ({ ...m, bands: m.bands.filter((_, i) => i !== bi) })));
  };
  const addBar = () => {
    setBars((bs) => [...bs, newBar()]);
    setModels((ms) => ms.map((m) => ({ ...m, bands: [...m.bands, { min: 20, max: 70 }] })));
  };

  /* — model handlers (comparison mode) — */
  const addModel = () =>
    setModels((ms) => [...ms, { name: `Model ${ms.length + 1}`, bands: bars.map(() => ({ min: 20, max: 70 })) }]);
  const removeModel = (mi: number) =>
    setModels((ms) => (ms.length > 1 ? ms.filter((_, i) => i !== mi) : ms));
  const setModelName = (mi: number, name: string) =>
    setModels((ms) => ms.map((m, i) => (i === mi ? { ...m, name } : m)));
  const setBand = (mi: number, bi: number, patch: Partial<Band>) =>
    setModels((ms) =>
      ms.map((m, i) =>
        i !== mi ? m : { ...m, bands: m.bands.map((bd, j) => (j === bi ? { ...bd, ...patch } : bd)) },
      ),
    );

  /* — save / load the whole build (per-user presets) — */
  const getConfig = () => ({ mode, align, size, compareLabel, bars, models });
  const applyConfig = (raw: unknown) => {
    const c = raw as Partial<ReturnType<typeof getConfig>> | null;
    if (!c || typeof c !== "object") return;
    if (c.mode === "single" || c.mode === "compare") setMode(c.mode);
    if (c.align === "left" || c.align === "center" || c.align === "right") setAlign(c.align);
    if (typeof c.size === "number") setSize(c.size);
    if (typeof c.compareLabel === "string") setCompareLabel(c.compareLabel);
    if (Array.isArray(c.bars)) {
      // Regenerate the drag-and-drop stop keys so they can't collide with the
      // live counter.
      setBars(
        c.bars.map((b) => ({ ...b, stopKeys: String(b.scale ?? "").split(",").map(() => sid()) })),
      );
    }
    if (Array.isArray(c.models)) setModels(c.models);
  };

  /* — code generation (faithful port) — */
  const { markup, code } = useMemo(() => {
    // includeBand=false in comparison mode: the band (min/max) comes from the
    // selected model, so it is not written onto the bar.
    const buildBar = (bar: Bar, pad: string, includeBand = true): string => {
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
      if (bar.range && bar.range.toLowerCase() !== DEF_RANGE) push("data-range", bar.range);

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
        models.forEach((mdl) => {
          const val = bars
            .map((_, i) => {
              const bd = mdl.bands[i] ?? { min: 0, max: 0 };
              return `${numOr0(bd.min)}:${numOr0(bd.max)}`;
            })
            .join(",");
          out += `${pad}        <option value="${val}">${esc(mdl.name)}</option>\n`;
        });
        out += `${pad}    </select>\n`;
        out += `${pad}</div>\n`;
      }
      out += bars.map((b) => buildBar(b, pad, !withSelect)).join("\n\n") + `\n</div>`;
      return out;
    };

    let m: string;
    if (mode === "compare") m = buildGroup(true);
    else if (sizeAttr || alignAttr) m = buildGroup(false);
    else m = bars.map((b) => buildBar(b, "")).join("\n\n");
    const full = `${m}\n\n<script src="${BUILDER_SCRIPT_URL}"></script>`;
    return { markup: m, code: full };
  }, [bars, mode, align, size, compareLabel, models]);

  /* — controls — */
  const controls = (
    <>
      <Group num={1} title="Mode & layout">
        <Segmented
          value={mode}
          onChange={setMode}
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
          onChange={setSize}
        />
        {(mode === "compare" || size < 720) && (
          <Field label="Alignment">
            <Segmented
              value={align}
              onChange={setAlign}
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
              onChange={setCompareLabel}
              placeholder="Compare models"
            />
          </Field>
        )}
      </Group>

      <Group num={2} title="Bars">
        {mode === "compare" && (
          <p className="text-[10.5px] text-muted-foreground leading-relaxed">
            These define each bar&apos;s structure. The band start/end come from the models below,
            so the dropdown can switch every bar at once.
          </p>
        )}
        <div className="space-y-3">
          {bars.map((bar, bi) => {
            const stops = bar.scale.split(",");
            // Keep keys aligned to stops defensively (should already match).
            const keys =
              bar.stopKeys.length === stops.length
                ? bar.stopKeys
                : stops.map((_, i) => bar.stopKeys[i] ?? sid());

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
              const patch: Partial<Bar> = {
                scale: arrayMove(stops, from, to).join(","),
                stopKeys: arrayMove(keys, from, to),
              };
              if (bar.scaleIndex) {
                if (typeof bar.min === "number") {
                  const ni = order.indexOf(bar.min);
                  if (ni >= 0) patch.min = ni;
                }
                if (typeof bar.max === "number") {
                  const ni = order.indexOf(bar.max);
                  if (ni >= 0) patch.max = ni;
                }
              }
              updateBar(bi, patch);
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
                              <SortableStopRow
                                key={keys[si]}
                                id={keys[si]}
                                index={si}
                                value={s}
                                onChange={(v) => editStop(si, v)}
                                onRemove={stops.length > 2 ? () => removeStop(si) : undefined}
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
                  <Slider
                    label="Marker"
                    value={bar.value}
                    onChange={(v) => updateBar(bi, { value: v })}
                  />
                )}

                <ColorField
                  label="Band colour"
                  value={bar.range}
                  onChange={(v) => updateBar(bi, { range: v })}
                  onReset={
                    bar.range.toLowerCase() !== DEF_RANGE
                      ? () => updateBar(bi, { range: DEF_RANGE })
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
        <Group num={3} title="Models">
          <div className="space-y-3">
            {models.map((mdl, mi) => (
              <SubCard
                key={mi}
                title={`Model ${mi + 1}`}
                onRemove={models.length > 1 ? () => removeModel(mi) : undefined}
              >
                <Field label="Name (dropdown label)">
                  <TextField
                    value={mdl.name}
                    onChange={(v) => setModelName(mi, v)}
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
            <AddButton onClick={addModel}>Add model</AddButton>
          </div>
        </Group>
      )}
    </>
  );

  return (
    <BuilderShell
      title="Range Bars Builder"
      icon={SlidersHorizontal}
      badge="feel / rider goals"
      description={
        <>
          A range bar shows a highlighted <strong className="text-foreground">band</strong> between
          two poles (or across labelled stops) — ideal for feel and rider-goal scales. Add as many
          bars as you need, then copy the snippet.
        </>
      }
      controls={controls}
      markup={markup}
      code={code}
      presetKey="range-bars"
      getConfig={getConfig}
      applyConfig={applyConfig}
      tip={
        <>
          Load the renderer once per page — it renders every{" "}
          <code className="text-[11px] bg-muted px-1 py-0.5 rounded">.patrik-range-bar</code>{" "}
          automatically.
        </>
      }
    />
  );
}
