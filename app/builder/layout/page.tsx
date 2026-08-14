"use client";
// Section Layout — the composer. Every other builder makes ONE component; this
// one arranges any number of them into rows and columns: stack them vertically,
// sit two or three side by side, drag them between rows, and set how wide each
// column is. It emits a single clean snippet — classes + data-* config wrapping
// the normal .patrik-* components, no inline styles — and patrik-components.js
// styles the layout and drives its responsive behaviour (fluid gaps / paddings /
// type, columns stacking by container width). The hosted renderer must be the
// current build of public/patrik-components.js for layout snippets.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns3,
  Copy,
  ExternalLink,
  GripVertical,
  Heading2,
  ImageIcon,
  LayoutGrid,
  Minus,
  MousePointerClick,
  MoveVertical,
  Plus,
  Radar,
  Rows3,
  SlidersHorizontal,
  Trash2,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PresetSummary } from "@/types/builder";
import {
  LAYOUT_ROW_BG,
  generateLayout,
  layoutDefaultBlock,
  layoutDefaultConfig,
  layoutDefaultRow,
  normalizeLayoutConfig,
  type LayoutBlock,
  type LayoutBlockType,
  type LayoutConfig,
  type LayoutRow,
} from "../generators";
import {
  readRadarConfig,
  readRangeBarsConfig,
  withFreshStopKeys,
} from "../section-controls";
import {
  AddButton,
  BuilderShell,
  CheckRow,
  ColorField,
  Field,
  Group,
  Segmented,
  Select,
  Slider,
  TextArea,
  TextField,
  relativeTime,
} from "../builder-ui";

/* ── block metadata ───────────────────────────────────────────────────────── */

const BLOCK_META: Record<
  LayoutBlockType,
  { label: string; icon: React.ElementType; hint: string }
> = {
  "radar-chart": { label: "Radar chart", icon: Radar, hint: "performance octagon" },
  "range-bars": { label: "Range bars", icon: SlidersHorizontal, hint: "feel / rider goals" },
  heading: { label: "Heading", icon: Heading2, hint: "section title" },
  text: { label: "Text", icon: Type, hint: "paragraph" },
  image: { label: "Image", icon: ImageIcon, hint: "photo or graphic" },
  button: { label: "Button", icon: MousePointerClick, hint: "call to action" },
  spacer: { label: "Spacer", icon: MoveVertical, hint: "vertical gap" },
  divider: { label: "Divider", icon: Minus, hint: "hairline rule" },
};

const BLOCK_ORDER: LayoutBlockType[] = [
  "radar-chart",
  "range-bars",
  "heading",
  "text",
  "image",
  "button",
  "divider",
  "spacer",
];

// Point a chart block at a saved build: its config is a CACHED COPY of that
// build, kept in the layout so the snippet and the Saved Builds thumbnails can
// be generated from the layout config alone. `source` is the live link — the
// composer refreshes the copy from the build whenever the build list loads.
// Which option a compare block opens on is a placement choice, not part of the
// build — so it survives a refresh from the saved build (clamped, in case the
// build lost datasets since).
const fitIndex = (i: number, len: number) => (i >= 0 && i < len ? i : 0);

function applyPresetToBlock(
  block: LayoutBlock,
  preset: PresetSummary,
  // true when refreshing a block's cached copy: keep the block's own "shown
  // first" pick. false when inserting or switching the build: take the build's.
  keepDefaultIndex = false,
): LayoutBlock {
  const source = { id: preset.id, name: preset.name };
  if (block.type === "radar-chart" && preset.builder === "radar-chart") {
    const config = readRadarConfig(preset.config);
    if (keepDefaultIndex)
      config.defaultIndex = fitIndex(block.config.defaultIndex, config.datasets.length);
    return { ...block, source, config };
  }
  if (block.type === "range-bars" && preset.builder === "range-bars") {
    const config = readRangeBarsConfig(preset.config);
    if (keepDefaultIndex)
      config.defaultIndex = fitIndex(block.config.defaultIndex, config.models.length);
    return { ...block, source, config };
  }
  return block;
}

// The dropdown labels of a compare chart block — datasets for a radar chart,
// models for range bars.
function compareOptionNames(block: LayoutBlock): string[] {
  if (block.type === "radar-chart") return block.config.datasets.map((d, i) => d.name || `Dataset ${i + 1}`);
  if (block.type === "range-bars") return block.config.models.map((m, i) => m.name || `Model ${i + 1}`);
  return [];
}

// The compare dropdowns the layout emits, in the order they appear in the
// markup (rows top to bottom, columns left to right) — which is exactly the
// order the preview reports its dropdowns in.
function compareBlockIds(cfg: LayoutConfig): string[] {
  return cfg.rows.flatMap((r) =>
    r.blocks
      .filter(
        (b) =>
          (b.type === "radar-chart" || b.type === "range-bars") && b.config.mode === "compare",
      )
      .map((b) => b.id),
  );
}

// Pull every chart block back in line with the saved build it points at, so a
// layout always shows the current state of its builds. A block whose build was
// deleted keeps its last copy (and says so in the editor).
function syncBlocksToPresets(cfg: LayoutConfig, presets: PresetSummary[]): LayoutConfig {
  if (!presets.length) return cfg;
  return {
    ...cfg,
    rows: cfg.rows.map((r) => ({
      ...r,
      blocks: r.blocks.map((b) => {
        if (b.type !== "radar-chart" && b.type !== "range-bars") return b;
        const p = b.source && presets.find((x) => x.id === b.source?.id);
        return p ? applyPresetToBlock(b, p, true) : b;
      }),
    })),
  };
}

function blockSummary(b: LayoutBlock): string {
  switch (b.type) {
    case "radar-chart":
    case "range-bars":
      return b.source?.name ?? "(no saved build)";
    case "heading":
    case "text":
      return b.text.trim().slice(0, 42) || "(empty)";
    case "image":
      return b.src.trim() ? b.src.trim().split("/").pop()!.slice(0, 42) : "(no image URL)";
    case "button":
      return `${b.text.trim() || "(no label)"} → ${b.href.trim() || "(no link)"}`.slice(0, 48);
    case "spacer":
      return `${b.height}px tall`;
    case "divider":
      return "hairline rule";
  }
}

// One-click column splits for the selected row. Spans are relative shares, so
// "60 / 40" is just 6 and 4 — the generator turns them into percentages.
function splitPresets(n: number): { label: string; spans: number[] }[] {
  const equal = { label: "Equal", spans: Array.from({ length: n }, () => 1) };
  if (n === 2)
    return [
      equal,
      { label: "60 / 40", spans: [6, 4] },
      { label: "40 / 60", spans: [4, 6] },
      { label: "70 / 30", spans: [7, 3] },
    ];
  if (n === 3)
    return [
      equal,
      { label: "50/25/25", spans: [2, 1, 1] },
      { label: "25/50/25", spans: [1, 2, 1] },
      { label: "25/25/50", spans: [1, 1, 2] },
    ];
  return [equal];
}

// Range-bar blocks carry volatile drag-and-drop stop keys — mint fresh ones
// whenever a config arrives from outside (saved layout, block insert).
function readLayoutConfig(raw: unknown): LayoutConfig {
  const c = normalizeLayoutConfig(raw);
  return {
    ...c,
    rows: c.rows.map((r) => ({
      ...r,
      blocks: r.blocks.map((b) =>
        b.type === "range-bars" ? { ...b, config: withFreshStopKeys(b.config) } : b,
      ),
    })),
  };
}

/* ── add-block menu ───────────────────────────────────────────────────────── */

const CHART_TYPES: LayoutBlockType[] = ["radar-chart", "range-bars"];

// Two-step for the chart components: pick the component, then pick WHICH saved
// build to drop in. There is no ad-hoc chart here — a chart block always IS a
// saved build, so the only way to change one is to edit it in its own builder.
function AddBlockMenu({
  onPick,
  presets,
  label,
  compact,
}: {
  onPick: (type: LayoutBlockType, presetId?: string) => void;
  presets: PresetSummary[];
  label: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pickingFor, setPickingFor] = useState<LayoutBlockType | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setPickingFor(null);
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (type: LayoutBlockType, presetId?: string) => {
    onPick(type, presetId);
    setOpen(false);
  };

  const forType = pickingFor ? presets.filter((p) => p.builder === pickingFor) : [];

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-dashed text-[11px] font-medium transition-colors",
          compact ? "h-8 px-2.5" : "h-8 px-3 w-full justify-center",
          open
            ? "border-blue-400 text-foreground bg-blue-500/5"
            : "border-border text-muted-foreground hover:text-foreground hover:border-blue-400 hover:bg-blue-500/5",
        )}
        title={label}
      >
        <Plus className="w-3.5 h-3.5" />
        {label}
      </button>

      {open && !pickingFor && (
        <div
          className={cn(
            "absolute z-30 top-full mt-1.5 w-60 rounded-xl border border-border bg-popover shadow-xl p-1",
            // The row-header button sits at the right edge — hang the menu off
            // its right so it never runs past the panel.
            compact ? "right-0" : "left-0",
          )}
        >
          {BLOCK_ORDER.map((t) => {
            const { label: l, icon: Icon, hint } = BLOCK_META[t];
            const isChart = CHART_TYPES.includes(t);
            const count = presets.filter((p) => p.builder === t).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => (isChart ? setPickingFor(t) : choose(t))}
                className="flex items-center gap-2.5 w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted transition-colors"
              >
                <span className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Icon className="w-3 h-3 text-blue-500" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-foreground leading-tight">{l}</span>
                  <span className="block text-[10px] text-muted-foreground leading-tight">
                    {isChart
                      ? `${count} saved build${count === 1 ? "" : "s"}`
                      : hint}
                  </span>
                </span>
                {isChart && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {open && pickingFor && (
        <div
          className={cn(
            "absolute z-30 top-full mt-1.5 w-72 rounded-xl border border-border bg-popover shadow-xl p-1",
            compact ? "right-0" : "left-0",
          )}
        >
          <button
            type="button"
            onClick={() => setPickingFor(null)}
            className="flex items-center gap-1.5 w-full rounded-lg px-2 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
            {BLOCK_META[pickingFor].label} — pick a build
          </button>
          <div className="border-t border-border/60 my-1" />
          <div className="max-h-64 overflow-auto">
            {forType.length === 0 && (
              <p className="text-[11px] text-muted-foreground px-2 py-2 leading-snug">
                Nothing saved for this component yet. Build one on the{" "}
                {BLOCK_META[pickingFor].label} page and save it — it shows up here.
              </p>
            )}
            {forType.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => choose(pickingFor, p.id)}
                className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted transition-colors"
              >
                <Bookmark className="w-3 h-3 text-blue-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-foreground leading-tight truncate">
                    {p.name}
                  </span>
                  <span className="block text-[10px] text-muted-foreground leading-tight truncate">
                    {p.updatedBy?.name || p.updatedBy?.email || "—"} · {relativeTime(p.updatedAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── canvas ───────────────────────────────────────────────────────────────── */

// Presentational card. Rendered both inside the row (wrapped by the sortable
// below) and inside the drag overlay, which sits outside any SortableContext.
function BlockCard({
  block,
  summary,
  share,
  selected,
  onSelect,
  onDuplicate,
  onRemove,
  handleProps,
  overlay,
}: {
  block: LayoutBlock;
  summary: string;
  share: number;
  selected: boolean;
  onSelect?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  handleProps?: Record<string, unknown>;
  overlay?: boolean;
}) {
  const { label, icon: Icon } = BLOCK_META[block.type];

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative rounded-xl border p-2.5 h-full transition-colors",
        overlay ? "w-56 shadow-2xl cursor-grabbing" : "min-w-[132px] cursor-pointer",
        selected
          ? "border-blue-400 bg-blue-500/10 ring-2 ring-blue-500/20"
          : "border-border bg-background/60 hover:border-blue-300 dark:hover:border-blue-700/60",
      )}
      title={overlay ? undefined : "Click to edit this block"}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="w-4 h-6 -ml-1 flex items-center justify-center text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
          title="Drag to move — within the row or into another row"
          aria-label="Drag to move"
          {...handleProps}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <span className="w-5 h-5 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
          <Icon className="w-3 h-3 text-blue-500" />
        </span>
        <span className="text-[11.5px] font-semibold text-foreground truncate flex-1 min-w-0">
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {Math.round(share * 100)}%
        </span>
      </div>

      <span className="block text-[10.5px] text-muted-foreground truncate mt-1.5" title={summary}>
        {summary}
      </span>

      {!overlay && (
        <div className="absolute -top-2 -right-2 hidden group-hover:flex items-center gap-1">
          {onDuplicate && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              className="w-6 h-6 rounded-md border border-border bg-background shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground"
              title="Duplicate block"
              aria-label="Duplicate block"
            >
              <Copy className="w-3 h-3" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="w-6 h-6 rounded-md border border-border bg-background shadow-sm flex items-center justify-center text-muted-foreground hover:text-rose-500"
              title="Remove block"
              aria-label="Remove block"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// The card as it lives on the canvas: its flex-grow mirrors the block's width
// share, so the map reads like the section it produces.
function SortableBlockCard(props: {
  block: LayoutBlock;
  summary: string;
  share: number;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.block.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        flexGrow: Math.max(1, props.block.span),
        flexBasis: 0,
        minWidth: 0,
      }}
      className={cn(isDragging && "opacity-40")}
    >
      <BlockCard {...props} handleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function RowStrip({
  row,
  index,
  selectedRowId,
  selectedBlockId,
  onSelectRow,
  onSelectBlock,
  onAddBlock,
  onDuplicateBlock,
  onRemoveBlock,
  onRemoveRow,
  onMoveRow,
  canMoveUp,
  canMoveDown,
  presets,
}: {
  row: LayoutRow;
  index: number;
  presets: PresetSummary[];
  selectedRowId: string | null;
  selectedBlockId: string | null;
  onSelectRow: () => void;
  onSelectBlock: (id: string) => void;
  onAddBlock: (type: LayoutBlockType, presetId?: string) => void;
  onDuplicateBlock: (id: string) => void;
  onRemoveBlock: (id: string) => void;
  onRemoveRow: () => void;
  onMoveRow: (delta: number) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `row:${row.id}` });
  const total = row.blocks.reduce((s, b) => s + Math.max(1, b.span), 0) || 1;
  const active = selectedRowId === row.id;

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        active ? "border-blue-400/70 bg-blue-500/[0.04]" : "border-border/70 bg-muted/20",
      )}
    >
      <div className="flex items-center gap-2 px-2.5 h-9 border-b border-border/50">
        <button
          type="button"
          onClick={onSelectRow}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground hover:text-blue-500 transition-colors"
          title="Row settings"
        >
          <Rows3 className="w-3.5 h-3.5 text-muted-foreground" />
          Row {index + 1}
        </button>
        <span className="text-[10px] text-muted-foreground">
          {row.blocks.length} {row.blocks.length === 1 ? "column" : "columns"} · gap {row.gap}px
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => onMoveRow(-1)}
              disabled={!canMoveUp}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Move row up"
              aria-label="Move row up"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMoveRow(1)}
              disabled={!canMoveDown}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Move row down"
              aria-label="Move row down"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
          <AddBlockMenu compact label="Block" onPick={onAddBlock} presets={presets} />
          <button
            type="button"
            onClick={onRemoveRow}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/70 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
            title="Delete row"
            aria-label="Delete row"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex items-stretch gap-2 p-2.5 min-h-[76px] rounded-b-xl transition-colors",
          isOver && "bg-blue-500/10",
        )}
      >
        <SortableContext items={row.blocks.map((b) => b.id)} strategy={horizontalListSortingStrategy}>
          {row.blocks.length === 0 ? (
            <div className="flex-1 rounded-lg border border-dashed border-border flex items-center justify-center text-[11px] text-muted-foreground">
              Empty row — drop a block here
            </div>
          ) : (
            row.blocks.map((b) => (
              <SortableBlockCard
                key={b.id}
                block={b}
                summary={blockSummary(b)}
                share={Math.max(1, b.span) / total}
                selected={selectedBlockId === b.id}
                onSelect={() => onSelectBlock(b.id)}
                onDuplicate={() => onDuplicateBlock(b.id)}
                onRemove={() => onRemoveBlock(b.id)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function NewRowDropZone({ dragging }: { dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "row:__new" });
  if (!dragging) return null;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "h-12 rounded-xl border border-dashed flex items-center justify-center text-[11px] font-medium transition-colors",
        isOver
          ? "border-blue-400 bg-blue-500/10 text-blue-600 dark:text-blue-400"
          : "border-border text-muted-foreground",
      )}
    >
      Drop here to start a new row
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

export default function LayoutBuilder() {
  const [config, setConfig] = useState<LayoutConfig>(() => readLayoutConfig(layoutDefaultConfig()));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [presets, setPresets] = useState<PresetSummary[]>([]);

  // Unique ids for rows/blocks. Minted only from event handlers, so the
  // timestamp can never differ between server and client render.
  const seq = useRef(0);
  const mkId = useCallback((p: string) => `${p}${Date.now().toString(36)}${seq.current++}`, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Every saved build — the only source a chart block can come from. Loading
  // them also refreshes the copy each chart block holds, so a layout always
  // reflects the current state of the builds it points at.
  useEffect(() => {
    let alive = true;
    fetch("/api/builder/presets")
      .then((r) => (r.ok ? r.json() : { presets: [] }))
      .then((d: { presets?: PresetSummary[] }) => {
        if (!alive) return;
        const list = d.presets ?? [];
        setPresets(list);
        setConfig((c) => syncBlocksToPresets(c, list));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const { rows } = config;

  /* — lookups — */
  const located = useMemo(() => {
    for (let ri = 0; ri < rows.length; ri++) {
      const bi = rows[ri].blocks.findIndex((b) => b.id === selectedBlockId);
      if (bi >= 0) return { row: rows[ri], rowIndex: ri, block: rows[ri].blocks[bi], blockIndex: bi };
    }
    return null;
  }, [rows, selectedBlockId]);

  const activeRow = located?.row ?? rows.find((r) => r.id === selectedRowId) ?? null;
  const activeRowIndex = activeRow ? rows.findIndex((r) => r.id === activeRow.id) : -1;
  const draggingBlock = useMemo(
    () => rows.flatMap((r) => r.blocks).find((b) => b.id === draggingId) ?? null,
    [rows, draggingId],
  );
  const rowIdOfBlock = useCallback(
    (id: string) => rows.find((r) => r.blocks.some((b) => b.id === id))?.id ?? null,
    [rows],
  );

  /* — mutations — */
  const setRows = (fn: (rows: LayoutRow[]) => LayoutRow[]) =>
    setConfig((c) => ({ ...c, rows: fn(c.rows) }));

  const patchRow = (rowId: string, p: Partial<LayoutRow>) =>
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, ...p } : r)));

  const setRowSpans = (rowId: string, spans: number[]) =>
    setRows((rs) =>
      rs.map((r) =>
        r.id === rowId
          ? { ...r, blocks: r.blocks.map((b, i) => ({ ...b, span: spans[i] ?? b.span })) }
          : r,
      ),
    );

  // The block union makes a typed partial awkward at every call site, so the
  // patch is a loose bag of fields — each caller only ever passes fields that
  // exist on the block type it is editing.
  const patchBlock = (blockId: string, p: Record<string, unknown>) =>
    setRows((rs) =>
      rs.map((r) => ({
        ...r,
        blocks: r.blocks.map((b) =>
          b.id === blockId ? ({ ...b, ...p } as unknown as LayoutBlock) : b,
        ),
      })),
    );

  const addRow = (atIndex?: number) => {
    const row = layoutDefaultRow({ id: mkId("r") });
    setRows((rs) => {
      const next = [...rs];
      next.splice(atIndex ?? next.length, 0, row);
      return next;
    });
    setSelectedRowId(row.id);
    setSelectedBlockId(null);
  };

  const moveRow = (index: number, delta: number) =>
    setRows((rs) => {
      const to = index + delta;
      return to < 0 || to >= rs.length ? rs : arrayMove(rs, index, to);
    });

  const removeRow = (rowId: string) => {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== rowId) : rs));
    if (selectedRowId === rowId) setSelectedRowId(null);
    if (located?.row.id === rowId) setSelectedBlockId(null);
  };

  // Insert a block. A chart block ALWAYS comes from a saved build — there is no
  // ad-hoc chart in the composer, so `presetId` is required for those types.
  const addBlock = (rowId: string, type: LayoutBlockType, presetId?: string) => {
    let block = layoutDefaultBlock(type, mkId("b"));
    if (block.type === "radar-chart" || block.type === "range-bars") {
      const preset = presets.find((p) => p.id === presetId && p.builder === block.type);
      if (!preset) return;
      block = applyPresetToBlock(block, preset);
    }
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, blocks: [...r.blocks, block] } : r)));
    setSelectedBlockId(block.id);
    setSelectedRowId(rowId);
  };

  const duplicateBlock = (blockId: string) => {
    const copyId = mkId("b");
    setRows((rs) =>
      rs.map((r) => {
        const i = r.blocks.findIndex((b) => b.id === blockId);
        if (i < 0) return r;
        const src = r.blocks[i];
        const copy = JSON.parse(JSON.stringify({ ...src, id: copyId })) as LayoutBlock;
        const blocks = [...r.blocks];
        blocks.splice(i + 1, 0, copy.type === "range-bars" ? { ...copy, config: withFreshStopKeys(copy.config) } : copy);
        return { ...r, blocks };
      }),
    );
    setSelectedBlockId(copyId);
  };

  const removeBlock = (blockId: string) => {
    setRows((rs) => rs.map((r) => ({ ...r, blocks: r.blocks.filter((b) => b.id !== blockId) })));
    if (selectedBlockId === blockId) setSelectedBlockId(null);
  };

  /* — drag & drop: reorder within a row, move between rows — */
  const onDragStart = (e: DragStartEvent) => setDraggingId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId === "row:__new") return; // handled on drop
    const fromRow = rowIdOfBlock(activeId);
    const toRow = overId.startsWith("row:") ? overId.slice(4) : rowIdOfBlock(overId);
    if (!fromRow || !toRow || fromRow === toRow) return;

    setRows((rs) => {
      const next = rs.map((r) => ({ ...r, blocks: [...r.blocks] }));
      const src = next.find((r) => r.id === fromRow);
      const dst = next.find((r) => r.id === toRow);
      if (!src || !dst) return rs;
      const i = src.blocks.findIndex((b) => b.id === activeId);
      if (i < 0) return rs;
      const [moved] = src.blocks.splice(i, 1);
      const at = overId.startsWith("row:")
        ? dst.blocks.length
        : Math.max(0, dst.blocks.findIndex((b) => b.id === overId));
      dst.blocks.splice(at, 0, moved);
      return next;
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Dropped on the trailing zone → pull the block out into a brand-new row.
    if (overId === "row:__new") {
      const rowId = mkId("r");
      setRows((rs) => {
        const next = rs.map((r) => ({ ...r, blocks: [...r.blocks] }));
        const src = next.find((r) => r.blocks.some((b) => b.id === activeId));
        if (!src) return rs;
        const i = src.blocks.findIndex((b) => b.id === activeId);
        const [moved] = src.blocks.splice(i, 1);
        next.push(layoutDefaultRow({ id: rowId, blocks: [moved] }));
        return next;
      });
      setSelectedRowId(rowId);
      return;
    }

    if (overId.startsWith("row:") || activeId === overId) return;
    const rowId = rowIdOfBlock(activeId);
    if (!rowId || rowId !== rowIdOfBlock(overId)) return;
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== rowId) return r;
        const from = r.blocks.findIndex((b) => b.id === activeId);
        const to = r.blocks.findIndex((b) => b.id === overId);
        return from < 0 || to < 0 ? r : { ...r, blocks: arrayMove(r.blocks, from, to) };
      }),
    );
  };

  /* — code generation — */
  const { markup, code } = useMemo(() => generateLayout(config), [config]);

  // Switching a chart's model in the live preview makes it the one that chart
  // opens on in the copied snippet — same as on the single-component builders,
  // but here each dropdown has to be matched back to its block. The preview
  // reports every dropdown in document order, which is the order the markup
  // emits them, so they line up with `compareBlockIds`.
  const applyPreviewDefaults = (indices: number[]) =>
    setConfig((c) => {
      const ids = compareBlockIds(c);
      const wanted = new Map<string, number>();
      ids.forEach((id, i) => {
        if (indices[i] != null) wanted.set(id, indices[i]);
      });
      let changed = false;
      const rows = c.rows.map((r) => ({
        ...r,
        blocks: r.blocks.map((b) => {
          const next = wanted.get(b.id);
          if (next == null) return b;
          // Branch per type: a shared `{...b, config}` spread would widen the
          // block union and lose the type↔config pairing.
          if (b.type === "radar-chart" && next !== b.config.defaultIndex) {
            changed = true;
            return { ...b, config: { ...b.config, defaultIndex: next } };
          }
          if (b.type === "range-bars" && next !== b.config.defaultIndex) {
            changed = true;
            return { ...b, config: { ...b.config, defaultIndex: next } };
          }
          return b;
        }),
      }));
      return changed ? { ...c, rows } : c;
    });

  /* — saved builds of this layout — */
  const applyConfig = (raw: unknown) => {
    setConfig(syncBlocksToPresets(readLayoutConfig(raw), presets));
    setSelectedBlockId(null);
    setSelectedRowId(null);
  };

  /* — canvas — */
  const canvas = (
    /* No overflow-hidden here — the per-row "add block" menu drops out of it. */
    <div className="bg-surface border border-border rounded-xl">
      <div className="flex items-center gap-2 px-4 h-11 border-b border-border/60">
        <LayoutGrid className="w-3.5 h-3.5 text-blue-500" />
        <h2 className="text-[12px] font-semibold text-foreground tracking-tight">Layout</h2>
        <span className="hidden sm:inline text-[10px] text-muted-foreground">
          drag blocks to reorder or move them between rows
        </span>
        <button
          type="button"
          onClick={() => addRow()}
          className="ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Row
        </button>
      </div>
      <div className="p-3 space-y-2.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDraggingId(null)}
        >
          {rows.map((row, i) => (
            <RowStrip
              key={row.id}
              row={row}
              index={i}
              selectedRowId={activeRow?.id ?? null}
              selectedBlockId={selectedBlockId}
              onSelectRow={() => {
                setSelectedRowId(row.id);
                setSelectedBlockId(null);
              }}
              onSelectBlock={(id) => {
                setSelectedBlockId(id);
                setSelectedRowId(row.id);
              }}
              presets={presets}
              onAddBlock={(t, presetId) => addBlock(row.id, t, presetId)}
              onDuplicateBlock={duplicateBlock}
              onRemoveBlock={removeBlock}
              onRemoveRow={() => removeRow(row.id)}
              onMoveRow={(d) => moveRow(i, d)}
              canMoveUp={i > 0}
              canMoveDown={i < rows.length - 1}
            />
          ))}
          <NewRowDropZone dragging={draggingId != null} />
          <DragOverlay>
            {draggingBlock ? (
              <BlockCard
                block={draggingBlock}
                summary={blockSummary(draggingBlock)}
                share={1}
                selected
                overlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
        <AddButton onClick={() => addRow()}>Add a row</AddButton>
      </div>
    </div>
  );

  /* — controls — */
  const selectedBlock = located?.block ?? null;
  const rowTotalSpan = activeRow
    ? activeRow.blocks.reduce((s, b) => s + Math.max(1, b.span), 0) || 1
    : 1;

  const presetsFor = (builder: string) => presets.filter((p) => p.builder === builder);

  // Swap which saved build this block shows. The config is copied in, so the
  // saved build itself is never modified from here.
  const loadPresetIntoBlock = (presetId: string) => {
    const p = presets.find((x) => x.id === presetId);
    if (!p || !selectedBlock) return;
    setRows((rs) =>
      rs.map((r) => ({
        ...r,
        blocks: r.blocks.map((b) => (b.id === selectedBlock.id ? applyPresetToBlock(b, p) : b)),
      })),
    );
  };

  // Did the build this block points at get deleted from Saved Builds?
  const sourceExists = (b: LayoutBlock) =>
    b.type !== "radar-chart" && b.type !== "range-bars"
      ? true
      : !b.source || presets.some((p) => p.id === b.source?.id);

  const controls = (
    <>
      <Group num={1} title="Canvas">
        <Slider
          label="Max width (px)"
          value={config.maxWidth}
          min={640}
          max={1600}
          step={20}
          onChange={(v) => setConfig((c) => ({ ...c, maxWidth: v }))}
        />
        <Slider
          label="Space between rows"
          value={config.rowGap}
          min={0}
          max={140}
          step={4}
          onChange={(v) => setConfig((c) => ({ ...c, rowGap: v }))}
        />
        <p className="text-[10.5px] text-muted-foreground leading-relaxed">
          {rows.length} row{rows.length === 1 ? "" : "s"} ·{" "}
          {rows.reduce((s, r) => s + r.blocks.length, 0)} block
          {rows.reduce((s, r) => s + r.blocks.length, 0) === 1 ? "" : "s"}. Columns stack
          automatically on narrow screens, and gaps, padding and headings scale down with
          the section&apos;s own width.
        </p>
      </Group>

      {activeRow ? (
        <Group num={2} title={`Row ${activeRowIndex + 1}`}>
          <Field label="Horizontal alignment">
            <Segmented
              value={activeRow.justify}
              onChange={(v) => patchRow(activeRow.id, { justify: v })}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Center" },
                { value: "right", label: "Right" },
              ]}
            />
          </Field>
          <Field label="Vertical alignment" hint="of columns in this row">
            <Segmented
              value={activeRow.valign}
              onChange={(v) => patchRow(activeRow.id, { valign: v })}
              options={[
                { value: "top", label: "Top" },
                { value: "center", label: "Middle" },
                { value: "bottom", label: "Bottom" },
                { value: "stretch", label: "Fill" },
              ]}
            />
          </Field>
          <Slider
            label="Column gap (px)"
            value={activeRow.gap}
            min={0}
            max={96}
            step={4}
            onChange={(v) => patchRow(activeRow.id, { gap: v })}
          />
          <Slider
            label="Stack below (px)"
            value={activeRow.wrapAt}
            min={160}
            max={640}
            step={10}
            onChange={(v) => patchRow(activeRow.id, { wrapAt: v })}
          />
          <p className="text-[10.5px] text-muted-foreground leading-relaxed">
            A column never gets narrower than the stack width — once they no longer fit side by
            side, the row wraps and the blocks sit on top of each other.
          </p>

          {activeRow.blocks.length > 1 && (
            <Field label="Column split" hint="sets every column's share at once">
              <div className="grid grid-cols-4 gap-1.5">
                {splitPresets(activeRow.blocks.length).map((p) => {
                  const on = p.spans.every((s, i) => activeRow.blocks[i]?.span === s);
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setRowSpans(activeRow.id, p.spans)}
                      aria-pressed={on}
                      className={cn(
                        "h-7 rounded-md border text-[10.5px] font-medium tabular-nums transition-colors",
                        on
                          ? "border-blue-400 bg-blue-500/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {/* Row band — background, inner padding, corner radius. A row with no
              background emits exactly the markup it always did. */}
          <div className="pt-1 space-y-2.5">
            <CheckRow
              checked={!!activeRow.background}
              onChange={(v) => patchRow(activeRow.id, { background: v ? LAYOUT_ROW_BG : "" })}
            >
              Background band
            </CheckRow>
            {!!activeRow.background && (
              <>
                <ColorField
                  label="Band colour"
                  value={activeRow.background}
                  onChange={(v) => patchRow(activeRow.id, { background: v })}
                  onReset={
                    activeRow.background.toLowerCase() !== LAYOUT_ROW_BG
                      ? () => patchRow(activeRow.id, { background: LAYOUT_ROW_BG })
                      : undefined
                  }
                />
                <Slider
                  label="Corner radius"
                  value={activeRow.radius}
                  min={0}
                  max={48}
                  step={2}
                  onChange={(v) => patchRow(activeRow.id, { radius: v })}
                />
              </>
            )}
            <Slider
              label="Padding ↔ (px)"
              value={activeRow.padX}
              min={0}
              max={96}
              step={4}
              onChange={(v) => patchRow(activeRow.id, { padX: v })}
            />
            <Slider
              label="Padding ↕ (px)"
              value={activeRow.padY}
              min={0}
              max={96}
              step={4}
              onChange={(v) => patchRow(activeRow.id, { padY: v })}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => addRow(activeRowIndex)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Row above
            </button>
            <button
              type="button"
              onClick={() => addRow(activeRowIndex + 1)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Row below
            </button>
          </div>
        </Group>
      ) : (
        <Group num={2} title="Row">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Pick a row header on the canvas to set its alignment, column gap, and the width at which
            it stacks.
          </p>
        </Group>
      )}

      {selectedBlock ? (
        <Group num={3} title={BLOCK_META[selectedBlock.type].label}>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/50 rounded-full px-2 py-0.5">
              <Columns3 className="w-3 h-3" />
              Row {activeRowIndex + 1} · column {(located?.blockIndex ?? 0) + 1}
            </span>
            <button
              type="button"
              onClick={() => setSelectedBlockId(null)}
              className="ml-auto text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              Deselect
            </button>
          </div>

          <Slider
            label="Width share"
            value={selectedBlock.span}
            min={1}
            max={12}
            step={1}
            onChange={(v) => patchBlock(selectedBlock.id, { span: v })}
          />
          <p className="text-[10.5px] text-muted-foreground">
            Takes{" "}
            <span className="text-foreground font-medium tabular-nums">
              {Math.round((Math.max(1, selectedBlock.span) / rowTotalSpan) * 100)}%
            </span>{" "}
            of the row — shares are relative to the other columns in it.
          </p>

          {(selectedBlock.type === "radar-chart" || selectedBlock.type === "range-bars") && (
            <>
              <Field label="Saved build" hint="what this block shows">
                <Select
                  value={selectedBlock.source?.id ?? ""}
                  placeholder="Pick a saved build…"
                  ariaLabel="Which saved build this block shows"
                  onChange={(v) => loadPresetIntoBlock(String(v))}
                  options={presetsFor(selectedBlock.type).map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
              </Field>
              {selectedBlock.source && !sourceExists(selectedBlock) && (
                <p className="text-[10.5px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  “{selectedBlock.source.name}” is no longer in Saved Builds — this block still shows
                  the last copy of it. Pick another build to replace it.
                </p>
              )}
              {selectedBlock.config.mode === "compare" && (
                <>
                  <Field label="Shown first" hint="what the dropdown opens on">
                    <Select
                      value={selectedBlock.config.defaultIndex}
                      ariaLabel="Which model this chart opens on"
                      onChange={(v) =>
                        patchBlock(selectedBlock.id, {
                          config: { ...selectedBlock.config, defaultIndex: Number(v) },
                        })
                      }
                      options={compareOptionNames(selectedBlock).map((name, i) => ({
                        value: i,
                        label: name,
                      }))}
                    />
                  </Field>
                  <p className="text-[10.5px] text-muted-foreground leading-relaxed">
                    Switching the model in the live preview sets this too — and it stays with the
                    layout, so the same build can open on a different model in another section.
                  </p>
                </>
              )}
              {selectedBlock.source && (
                <Link
                  href={`/builder/${selectedBlock.type}?preset=${selectedBlock.source.id}`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Edit “{selectedBlock.source.name}” in its builder
                </Link>
              )}
              <p className="text-[10.5px] text-muted-foreground leading-relaxed">
                The layout arranges saved builds — it never edits them. Change the chart on its own
                builder page, save it there, and every layout using it follows.
              </p>
            </>
          )}

          {selectedBlock.type === "heading" && (
            <>
              <Field label="Heading text">
                <TextField
                  value={selectedBlock.text}
                  onChange={(v) => patchBlock(selectedBlock.id, { text: v })}
                  placeholder="Section heading"
                />
              </Field>
              <Field label="Level">
                <Segmented
                  value={String(selectedBlock.level)}
                  onChange={(v) =>
                    patchBlock(selectedBlock.id, { level: Number(v) as 2 | 3 | 4 })
                  }
                  options={[
                    { value: "2", label: "H2" },
                    { value: "3", label: "H3" },
                    { value: "4", label: "H4" },
                  ]}
                />
              </Field>
            </>
          )}

          {selectedBlock.type === "text" && (
            <Field label="Paragraph" hint="line breaks are kept">
              <TextArea
                value={selectedBlock.text}
                rows={4}
                onChange={(v) => patchBlock(selectedBlock.id, { text: v })}
                placeholder="A short paragraph…"
              />
            </Field>
          )}

          {(selectedBlock.type === "heading" || selectedBlock.type === "text") && (
            <>
              <Field label="Alignment">
                <Segmented
                  value={selectedBlock.align}
                  onChange={(v) => patchBlock(selectedBlock.id, { align: v })}
                  options={[
                    { value: "left", label: "Left" },
                    { value: "center", label: "Center" },
                    { value: "right", label: "Right" },
                  ]}
                />
              </Field>
              <Slider
                label="Font size (px)"
                value={selectedBlock.size}
                min={11}
                max={64}
                step={1}
                onChange={(v) => patchBlock(selectedBlock.id, { size: v })}
              />
              <ColorField
                label="Colour"
                value={selectedBlock.color}
                onChange={(v) => patchBlock(selectedBlock.id, { color: v })}
              />
            </>
          )}

          {selectedBlock.type === "image" && (
            <>
              <Field label="Image URL" hint="hosted on the site">
                <TextField
                  value={selectedBlock.src}
                  onChange={(v) => patchBlock(selectedBlock.id, { src: v })}
                  placeholder="https://www.patrikinternational.com/…/photo.jpg"
                  mono
                />
              </Field>
              <Field label="Alt text" hint="describes the image">
                <TextField
                  value={selectedBlock.alt}
                  onChange={(v) => patchBlock(selectedBlock.id, { alt: v })}
                  placeholder="4Wave FLOW HD on the water"
                />
              </Field>
              <Slider
                label="Width (% of column)"
                value={selectedBlock.width}
                min={10}
                max={100}
                step={5}
                onChange={(v) => patchBlock(selectedBlock.id, { width: v })}
              />
              <Slider
                label="Corner radius"
                value={selectedBlock.radius}
                min={0}
                max={48}
                step={2}
                onChange={(v) => patchBlock(selectedBlock.id, { radius: v })}
              />
              {!selectedBlock.src.trim() && (
                <p className="text-[10.5px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  Without a URL this block emits a comment instead of an image. Upload the file to
                  the website first and paste its address here.
                </p>
              )}
            </>
          )}

          {selectedBlock.type === "button" && (
            <>
              <Field label="Label">
                <TextField
                  value={selectedBlock.text}
                  onChange={(v) => patchBlock(selectedBlock.id, { text: v })}
                  placeholder="Learn more"
                />
              </Field>
              <Field label="Links to">
                <TextField
                  value={selectedBlock.href}
                  onChange={(v) => patchBlock(selectedBlock.id, { href: v })}
                  placeholder="/collections/4wave"
                  mono
                />
              </Field>
              <Field label="Style">
                <Segmented
                  value={selectedBlock.variant}
                  onChange={(v) => patchBlock(selectedBlock.id, { variant: v })}
                  options={[
                    { value: "solid", label: "Solid" },
                    { value: "outline", label: "Outline" },
                  ]}
                />
              </Field>
              <ColorField
                label="Accent colour"
                value={selectedBlock.color}
                onChange={(v) => patchBlock(selectedBlock.id, { color: v })}
              />
              <CheckRow
                checked={selectedBlock.newTab}
                onChange={(v) => patchBlock(selectedBlock.id, { newTab: v })}
              >
                Open in a new tab
              </CheckRow>
            </>
          )}

          {(selectedBlock.type === "image" || selectedBlock.type === "button") && (
            <Field label="Alignment">
              <Segmented
                value={selectedBlock.align}
                onChange={(v) => patchBlock(selectedBlock.id, { align: v })}
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                  { value: "right", label: "Right" },
                ]}
              />
            </Field>
          )}

          {selectedBlock.type === "spacer" && (
            <Slider
              label="Height (px)"
              value={selectedBlock.height}
              min={4}
              max={240}
              step={4}
              onChange={(v) => patchBlock(selectedBlock.id, { height: v })}
            />
          )}

          {selectedBlock.type === "divider" && (
            <ColorField
              label="Line colour"
              value={selectedBlock.color}
              onChange={(v) => patchBlock(selectedBlock.id, { color: v })}
            />
          )}

          {/* Spacing inside the column — every block type has it. */}
          <div className="pt-2 mt-1 border-t border-border/50 space-y-2.5">
            <Slider
              label="Side room (%)"
              value={selectedBlock.insetX}
              min={0}
              max={40}
              step={1}
              onChange={(v) => patchBlock(selectedBlock.id, { insetX: v })}
            />
            <Slider
              label="Space above/below"
              value={selectedBlock.insetY}
              min={0}
              max={120}
              step={4}
              onChange={(v) => patchBlock(selectedBlock.id, { insetY: v })}
            />
            <p className="text-[10.5px] text-muted-foreground leading-relaxed">
              Keeps this block clear of the column edges — a share of the column, so it holds at
              every screen width.
            </p>
          </div>
        </Group>
      ) : (
        <Group num={3} title="Block">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Add a block to a row, then click it on the canvas to set its width. Charts come from{" "}
            <Link href="/builder/saved" className="text-blue-600 dark:text-blue-400 hover:underline">
              Saved Builds
            </Link>{" "}
            — build and save a chart on its own page first, then place it here.
          </p>
          <AddBlockMenu
            label="Add a block to the last row"
            presets={presets}
            onPick={(t, presetId) => addBlock(rows[rows.length - 1]?.id ?? "", t, presetId)}
          />
        </Group>
      )}

    </>
  );

  return (
    <BuilderShell
      title="Section Layout"
      icon={LayoutGrid}
      badge="rows & columns"
      description={
        <>
          Compose a whole section out of your <strong className="text-foreground">saved builds</strong>
          : stack them vertically, put two or three side by side, drag them between rows, and set how
          much width each one takes. Charts are always placed from Saved Builds — this page arranges
          them, it never edits them. The snippet is clean markup (classes + data-attributes only);
          the shared renderer on the site styles the layout and scales it fluidly on every screen.
        </>
      }
      controls={controls}
      canvas={canvas}
      previewResponsive
      onPreviewSelect={applyPreviewDefaults}
      markup={markup}
      code={code}
      presetKey="layout"
      getConfig={() => config}
      applyConfig={applyConfig}
      tip={
        <>
          Columns are sized as shares of their row and never drop below the row&apos;s stack width,
          so a two-column section becomes a clean vertical stack on phones. Use the preview&apos;s
          width switcher to check it.
        </>
      }
    />
  );
}
