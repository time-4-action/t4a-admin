"use client";
import {
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Copy, Check, Download, ArrowLeft, Plus, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { usePatrikComponents } from "@/lib/use-patrik-components";

/* ────────────────────────────── code highlight ─────────────────────────── */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const HL = {
  cmt: "text-muted-foreground/60 italic",
  attr: "text-sky-600 dark:text-sky-400",
  val: "text-emerald-600 dark:text-emerald-400",
  tag: "text-blue-600 dark:text-blue-400",
};

// Faithful port of the reference builders' lightweight highlighter, retargeted
// to Tailwind color classes so it stays theme-aware.
function highlight(raw: string): string {
  return raw
    .split(/(<!--[\s\S]*?-->)/g)
    .map((p) => {
      if (p.slice(0, 4) === "<!--") return `<span class="${HL.cmt}">${esc(p)}</span>`;
      let s = esc(p);
      s = s.replace(
        /([\w-]+)=(&quot;[\s\S]*?&quot;)/g,
        `<span class="${HL.attr}">$1</span>=<span class="${HL.val}">$2</span>`,
      );
      s = s.replace(/(&lt;\/?)([\w.-]+)/g, `$1<span class="${HL.tag}">$2</span>`);
      return s;
    })
    .join("");
}

/* ────────────────────────────── panels ─────────────────────────────────── */

function PanelHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 h-11 border-b border-border/60">
      <h2 className="text-[12px] font-semibold text-foreground tracking-tight">{title}</h2>
      {note && <span className="ml-auto text-[10px] text-muted-foreground">{note}</span>}
    </div>
  );
}

function PreviewPanel({ markup }: { markup: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { ready, render } = usePatrikComponents();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = markup;
    if (ready) render(el);
  }, [markup, ready, render]);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <PanelHead title="Live preview" note="rendered by patrik-components.js" />
      <div className="p-4 md:p-6 bg-muted/20">
        <div ref={ref} className="min-h-[120px]" />
      </div>
    </div>
  );
}

function CodePanel({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 h-11 border-b border-border/60">
        <h2 className="text-[12px] font-semibold text-foreground tracking-tight">HTML snippet</h2>
        <span className="text-[10px] text-muted-foreground">paste into your page</span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors",
            copied
              ? "border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/60"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className="p-4 text-[11.5px] leading-relaxed font-mono text-foreground whitespace-pre-wrap break-words max-w-full"
        // The generated snippet is escaped inside highlight(); this is not user input.
        dangerouslySetInnerHTML={{ __html: highlight(code) }}
      />
    </div>
  );
}

/* ────────────────────────────── shell ──────────────────────────────────── */

export function BuilderShell({
  title,
  icon: Icon,
  badge,
  description,
  controls,
  markup,
  code,
  tip,
}: {
  title: string;
  icon: ElementType;
  badge: string;
  description: ReactNode;
  controls: ReactNode;
  markup: string;
  code: string;
  tip: ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Link
              href="/builder"
              className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title="All builders"
              aria-label="All builders"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Icon className="w-4 h-4 text-blue-500 shrink-0" />
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground truncate">
              {title}
            </h1>
            <span className="hidden sm:inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/50 rounded-full px-2 py-0.5 shrink-0">
              {badge}
            </span>
          </div>
          <a
            href="/patrik-components.js"
            download
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            title="Download the renderer script"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">patrik-components.js</span>
          </a>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-4 md:p-8">
        <p className="text-[12px] text-muted-foreground leading-relaxed max-w-3xl -mt-1 mb-5">
          {description}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr] gap-4 items-start">
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            {controls}
          </div>

          <div className="space-y-4 min-w-0">
            <PreviewPanel markup={markup} />
            <CodePanel code={code} />
            <p className="text-[11px] text-muted-foreground leading-relaxed px-1">{tip}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── controls kit ───────────────────────────── */

export function Group({
  num,
  title,
  optional,
  children,
}: {
  num: number;
  title: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-4 border-b border-border/50 last:border-b-0 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-bold flex items-center justify-center shrink-0">
          {num}
        </span>
        <span className="text-[12px] font-semibold text-foreground tracking-tight">{title}</span>
        {optional && (
          <span className="text-[10px] text-muted-foreground font-normal">optional</span>
        )}
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-muted-foreground/60 font-normal">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function TextField({
  value,
  placeholder,
  onChange,
  mono,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-8 text-xs bg-background", mono && "font-mono")}
      spellCheck={false}
    />
  );
}

export function NumberField({
  value,
  onChange,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
}) {
  return (
    <Input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      className="h-8 text-xs bg-background tabular-nums"
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 w-full">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md px-2.5 h-7 text-[11.5px] font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// A value control that is both a drag slider AND a typeable number field —
// they stay in sync and both clamp to [min, max]. The number field allows a
// transient empty string while editing so the user can clear and retype.
export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const pct = max > min ? ((clamp(value) - min) / (max - min)) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11px] text-muted-foreground w-24 truncate shrink-0" title={label}>
        {label || "—"}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="builder-range flex-1 cursor-pointer min-w-0"
        style={{
          background: `linear-gradient(to right, var(--br-accent) ${pct}%, var(--br-track) ${pct}%)`,
        }}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw !== "" && !Number.isNaN(Number(raw))) onChange(clamp(Number(raw)));
        }}
        onBlur={() => {
          if (draft !== null && draft !== "") onChange(clamp(Number(draft)));
          setDraft(null);
        }}
        className="w-14 h-7 shrink-0 rounded-md border border-border bg-background text-[11px] text-foreground tabular-nums text-center px-1 focus:outline-none focus:ring-2 focus:ring-ring focus:border-blue-400"
      />
    </div>
  );
}

export function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
      />
      <span className="text-[12px] text-foreground">{children}</span>
    </label>
  );
}

// Curated palette: the Patrik brand colours first, then a general spectrum.
const SWATCHES = [
  "#b4ff64", "#1a3a4a", "#b0c4cf", "#efefef", "#ffffff", "#000000",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
];

const isHex = (h: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h);

export function ColorField({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = (raw: string) => {
    let h = raw.trim();
    if (h && !h.startsWith("#")) h = "#" + h;
    if (isHex(h)) onChange(h);
    setDraft(null);
  };

  const changed = onReset != null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 w-full rounded-lg border bg-background/60 pl-1.5 pr-2 py-1.5 transition-colors hover:bg-muted/50",
          open ? "border-blue-400 ring-2 ring-blue-500/20" : "border-border",
        )}
      >
        <span
          className="w-7 h-7 rounded-md ring-1 ring-inset ring-black/10 dark:ring-white/15 shrink-0"
          style={{ background: value }}
        />
        <span className="text-[11px] text-muted-foreground flex-1 truncate text-left">{label}</span>
        <span className="text-[10.5px] font-mono uppercase text-foreground/80 shrink-0">{value}</span>
      </button>

      {changed && (
        <button
          type="button"
          onClick={onReset}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shadow-sm"
          title="Reset to default"
          aria-label="Reset to default"
        >
          <RotateCcw className="w-2.5 h-2.5" />
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-1.5 left-0 right-0 rounded-xl border border-border bg-popover shadow-lg p-2.5 space-y-2.5">
          <div className="grid grid-cols-6 gap-1.5">
            {SWATCHES.map((c) => {
              const active = c.toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange(c)}
                  title={c}
                  className={cn(
                    "aspect-square rounded-md ring-1 ring-inset ring-black/10 dark:ring-white/15 transition-transform hover:scale-110",
                    active && "ring-2 ring-blue-500 ring-offset-1 ring-offset-popover scale-105",
                  )}
                  style={{ background: c }}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-border/60">
            <label
              className="relative w-7 h-7 rounded-md ring-1 ring-inset ring-black/10 dark:ring-white/15 shrink-0 cursor-pointer overflow-hidden"
              title="Custom colour"
              style={{ background: value }}
            >
              <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label={`${label} custom colour`}
              />
            </label>
            <input
              value={(draft ?? value).toUpperCase()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(draft ?? value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              spellCheck={false}
              placeholder="#RRGGBB"
              className="flex-1 h-7 rounded-md border border-border bg-background text-[11px] font-mono uppercase text-foreground text-center px-1 focus:outline-none focus:ring-2 focus:ring-ring focus:border-blue-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function IconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
    >
      {children}
    </button>
  );
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-dashed border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-blue-400 hover:bg-blue-500/5 transition-colors w-full justify-center"
    >
      <Plus className="w-3.5 h-3.5" />
      {children}
    </button>
  );
}

export function RemoveIcon() {
  return <X className="w-3.5 h-3.5" />;
}

export function SubCard({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
          {title}
        </span>
        {onRemove && (
          <span className="ml-auto">
            <IconButton onClick={onRemove} title={`Remove ${title}`}>
              <RemoveIcon />
            </IconButton>
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
