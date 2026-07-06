"use client";
import { useMemo, useRef, useState } from "react";
import { Radar, GripVertical } from "lucide-react";
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
  Segmented,
  Slider,
  CheckRow,
  ColorField,
  IconButton,
  RemoveIcon,
  AddButton,
  SubCard,
} from "../builder-ui";

/* A draggable axis row (handle-based, so the text input stays editable). */
function SortableAxisRow({
  id,
  name,
  onChange,
  onRemove,
}: {
  id: string;
  name: string;
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
        className="w-6 h-8 flex items-center justify-center text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <TextField value={name} onChange={onChange} placeholder="Axis label" />
      {onRemove && (
        <IconButton onClick={onRemove} title="Remove axis">
          <RemoveIcon />
        </IconButton>
      )}
    </div>
  );
}

/* ── defaults & colour config (mirrors the reference builder) ─────────────── */

const DEF = {
  fill: "#b4ff64",
  fillOpacity: 0.6,
  stroke: "#b4ff64",
  point: "#1a3a4a",
  grid: "#b0c4cf",
  axisColor: "#b0c4cf",
  labelColor: "#1a3a4a",
};

const COLOR_FIELDS = [
  { key: "fill", attr: "data-fill", label: "Fill" },
  { key: "stroke", attr: "data-stroke", label: "Outline" },
  { key: "point", attr: "data-point", label: "Points" },
  { key: "grid", attr: "data-grid", label: "Grid" },
  { key: "axisColor", attr: "data-axis-color", label: "Axis lines" },
  { key: "labelColor", attr: "data-label-color", label: "Labels" },
] as const;

type ColorKey = (typeof COLOR_FIELDS)[number]["key"];
type Colors = Record<ColorKey, string> & { fillOpacity: number };

type Dataset = { name: string; values: number[] };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── page ─────────────────────────────────────────────────────────────────── */

export default function RadarChartBuilder() {
  const [wrap, setWrap] = useState(true);
  const [heading, setHeading] = useState("Programme");
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [axes, setAxes] = useState<string[]>([
    "LIGHTWIND", "FREERIDE", "FOIL", "FREEFLY", "WAVE", "SURF", "RACING", "FREESTYLE",
  ]);
  // Stable keys for drag-and-drop identity, kept in lockstep with `axes`.
  const [axisKeys, setAxisKeys] = useState<string[]>(() => axes.map((_, i) => `ax${i}`));
  const idRef = useRef(axes.length);
  const mkKey = () => `ax${idRef.current++}`;
  const [values, setValues] = useState<number[]>([100, 90, 70, 85, 95, 60, 80, 75]);
  const [datasets, setDatasets] = useState<Dataset[]>([
    { name: "4Wave FLOW HD", values: [100, 85, 70, 100, 40, 100, 90, 100] },
    { name: "4Wave FLASH HD", values: [90, 100, 95, 80, 75, 90, 100, 90] },
  ]);
  const [colors, setColors] = useState<Colors>({
    fill: DEF.fill,
    fillOpacity: DEF.fillOpacity,
    stroke: DEF.stroke,
    point: DEF.point,
    grid: DEF.grid,
    axisColor: DEF.axisColor,
    labelColor: DEF.labelColor,
  });

  const fit = (arr: number[]) => axes.map((_, i) => (arr[i] != null ? arr[i] : 50));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* — axis handlers (keep keys + values + datasets aligned) — */
  const addAxis = () => {
    setAxisKeys((k) => [...k, mkKey()]);
    setAxes((a) => [...a, "NEW"]);
    setValues((v) => [...v, 50]);
    setDatasets((ds) => ds.map((d) => ({ ...d, values: [...d.values, 50] })));
  };
  const removeAxis = (i: number) => {
    if (axes.length <= 3) return;
    setAxisKeys((k) => k.filter((_, idx) => idx !== i));
    setAxes((a) => a.filter((_, idx) => idx !== i));
    setValues((v) => v.filter((_, idx) => idx !== i));
    setDatasets((ds) => ds.map((d) => ({ ...d, values: d.values.filter((_, idx) => idx !== i) })));
  };
  const setAxis = (i: number, name: string) =>
    setAxes((a) => a.map((v, idx) => (idx === i ? name : v)));

  // Reorder axes and every index-aligned array together.
  const onAxisDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = axisKeys.indexOf(String(active.id));
    const to = axisKeys.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setAxisKeys((k) => arrayMove(k, from, to));
    setAxes((a) => arrayMove(a, from, to));
    setValues((v) => arrayMove(v, from, to));
    setDatasets((ds) => ds.map((d) => ({ ...d, values: arrayMove(d.values, from, to) })));
  };

  /* — value / dataset handlers — */
  const setValue = (i: number, val: number) =>
    setValues((v) => v.map((x, idx) => (idx === i ? val : x)));
  const setDatasetValue = (di: number, i: number, val: number) =>
    setDatasets((ds) =>
      ds.map((d, idx) =>
        idx !== di ? d : { ...d, values: d.values.map((x, j) => (j === i ? val : x)) },
      ),
    );
  const setDatasetName = (di: number, name: string) =>
    setDatasets((ds) => ds.map((d, idx) => (idx === di ? { ...d, name } : d)));
  const addDataset = () =>
    setDatasets((ds) => [...ds, { name: "New model", values: axes.map(() => 60) }]);
  const removeDataset = (di: number) =>
    setDatasets((ds) => (ds.length > 1 ? ds.filter((_, idx) => idx !== di) : ds));

  const setColor = (key: ColorKey, v: string) => setColors((c) => ({ ...c, [key]: v }));
  const resetColor = (key: ColorKey) => setColors((c) => ({ ...c, [key]: DEF[key] }));

  /* — code generation (faithful port) — */
  const { markup, code } = useMemo(() => {
    const colorAttrs = (): [string, string][] => {
      const out: [string, string][] = [];
      if (colors.fill.toLowerCase() !== DEF.fill || Number(colors.fillOpacity) !== DEF.fillOpacity)
        out.push(["data-fill", hexToRgba(colors.fill, Number(colors.fillOpacity))]);
      if (colors.stroke.toLowerCase() !== DEF.stroke) out.push(["data-stroke", colors.stroke]);
      if (colors.point.toLowerCase() !== DEF.point) out.push(["data-point", colors.point]);
      if (colors.grid.toLowerCase() !== DEF.grid) out.push(["data-grid", colors.grid]);
      if (colors.axisColor.toLowerCase() !== DEF.axisColor)
        out.push(["data-axis-color", colors.axisColor]);
      if (colors.labelColor.toLowerCase() !== DEF.labelColor)
        out.push(["data-label-color", colors.labelColor]);
      return out;
    };

    const buildChart = (pad: string): string => {
      const axesStr = axes.join(",");
      const extra = colorAttrs();
      const L: string[] = [];
      L.push(`${pad}<div class="patrik-radar-chart"`);
      L.push(`${pad}     data-axes="${esc(axesStr)}"`);

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
        L.push(`${pad}    <div style="margin-bottom:20px;">`);
        L.push(
          `${pad}        <label style="font-size:13px;color:#1a3a4a;font-weight:bold;margin-right:8px;">Compare models:</label>`,
        );
        L.push(
          `${pad}        <select class="patrik-radar-select" style="padding:6px 12px;font-size:14px;border-radius:5px;border:1px solid #b0c4cf;color:#1a3a4a;background:#fff;font-weight:bold;cursor:pointer;">`,
        );
        datasets.forEach((ds) => {
          L.push(
            `${pad}            <option value="${fit(ds.values).join(",")}">${esc(ds.name)}</option>`,
          );
        });
        L.push(`${pad}        </select>`);
        L.push(`${pad}    </div>`);
        L.push(`${pad}</div>`);
      }
      return L.join("\n");
    };

    const buildMarkup = (): string => {
      if (!wrap) return buildChart("");
      const pad = "    ";
      let out = `<div style="background-color:#efefef; padding:20px; border-radius:10px; font-family:sans-serif; max-width:550px; margin:30px auto;">\n`;
      if (heading.trim())
        out += `${pad}<h2 style="color:#1a3a4a; margin-top:0; font-size:22px;">${esc(heading)}</h2>\n\n`;
      out += buildChart(pad) + `\n</div>`;
      return out;
    };

    const m = buildMarkup();
    const full = `${m}\n\n<!-- load once per page, near the end of <body> -->\n<script src="${BUILDER_SCRIPT_URL}"></script>`;
    return { markup: m, code: full };
  }, [wrap, heading, mode, axes, values, datasets, colors]);

  /* — controls — */
  const controls = (
    <>
      <Group num={1} title="Card wrapper">
        <CheckRow checked={wrap} onChange={setWrap}>
          Wrap in a grey card with a heading
        </CheckRow>
        {wrap && (
          <Field label="Heading">
            <TextField value={heading} onChange={setHeading} placeholder="Programme" />
          </Field>
        )}
      </Group>

      <Group num={2} title="Mode">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "single", label: "Single dataset" },
            { value: "compare", label: "Comparison" },
          ]}
        />
      </Group>

      <Group num={3} title="Axes">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onAxisDragEnd}>
          <SortableContext items={axisKeys} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {axes.map((name, i) => (
                <SortableAxisRow
                  key={axisKeys[i]}
                  id={axisKeys[i]}
                  name={name}
                  onChange={(v) => setAxis(i, v)}
                  onRemove={axes.length > 3 ? () => removeAxis(i) : undefined}
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

      <Group num={4} title={mode === "single" ? "Values" : "Datasets"}>
        {mode === "single" ? (
          <div className="space-y-2.5">
            {axes.map((ax, i) => (
              <Slider
                key={i}
                label={ax}
                value={values[i] ?? 50}
                onChange={(v) => setValue(i, v)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {datasets.map((ds, di) => (
              <SubCard
                key={di}
                title={`Dataset ${di + 1}`}
                onRemove={datasets.length > 1 ? () => removeDataset(di) : undefined}
              >
                <TextField
                  value={ds.name}
                  onChange={(v) => setDatasetName(di, v)}
                  placeholder="Dataset name (dropdown label)"
                />
                <div className="space-y-2.5 pt-1">
                  {axes.map((ax, i) => (
                    <Slider
                      key={i}
                      label={ax}
                      value={ds.values[i] ?? 50}
                      onChange={(v) => setDatasetValue(di, i, v)}
                    />
                  ))}
                </div>
              </SubCard>
            ))}
            <AddButton onClick={addDataset}>Add dataset</AddButton>
          </div>
        )}
      </Group>

      <Group num={5} title="Colours" optional>
        <div className="grid grid-cols-2 gap-2.5">
          {COLOR_FIELDS.map((f) => (
            <ColorField
              key={f.key}
              label={f.label}
              value={colors[f.key]}
              onChange={(v) => setColor(f.key, v)}
              onReset={colors[f.key].toLowerCase() !== DEF[f.key] ? () => resetColor(f.key) : undefined}
            />
          ))}
        </div>
        <div className="pt-1">
          <Slider
            label="Fill opacity"
            value={colors.fillOpacity}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setColors((c) => ({ ...c, fillOpacity: v }))}
          />
        </div>
        <p className="text-[10.5px] text-muted-foreground leading-relaxed">
          Only colours you change are written into the snippet. Everything else uses the component
          defaults.
        </p>
      </Group>
    </>
  );

  return (
    <BuilderShell
      title="Radar Chart Builder"
      icon={Radar}
      badge="performance octagon"
      description={
        <>
          A performance octagon — a single dataset, or a comparison dropdown that switches between
          several models. Set the axes and values, tweak the colours if you like, then copy the
          snippet. At least three axes are required.
        </>
      }
      controls={controls}
      markup={markup}
      code={code}
      tip={
        <>
          Load the renderer once per page (near the end of{" "}
          <code className="text-[11px] bg-muted px-1 py-0.5 rounded">&lt;body&gt;</code>). It
          auto-renders every component on the page — no inline JavaScript needed.
        </>
      }
    />
  );
}
