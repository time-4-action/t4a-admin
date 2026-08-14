"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Copy,
  Check,
  Download,
  ArrowLeft,
  Plus,
  X,
  RotateCcw,
  ChevronDown,
  Bookmark,
  Trash2,
  Pencil,
  Loader2,
  FolderOpen,
  Save,
  History,
  Star,
  Monitor,
  Laptop,
  Tablet,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { usePatrikComponents } from "@/lib/use-patrik-components";
import type { PresetSummary } from "@/types/builder";

/* ────────────────────────────── time helpers ───────────────────────────── */

export function relativeTime(value?: string | null): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  if (s < 90) return "a minute ago";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

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

// Viewport presets for the responsive preview — the width the rendered section
// is given, so you can watch a multi-column layout stack.
const VIEWPORTS = [
  { value: 0, label: "Full", icon: Monitor },
  { value: 1024, label: "1024", icon: Laptop },
  { value: 768, label: "768", icon: Tablet },
  { value: 390, label: "390", icon: Smartphone },
] as const;

export function PreviewPanel({
  markup,
  note,
  // Adds a viewport-width switcher to the panel head. Only worth it for
  // components whose layout actually reflows (the section composer).
  responsive,
  // Called after any interaction inside the preview with the picked option of
  // EVERY compare dropdown in it, in document order — so "what I picked here"
  // becomes the option the generated snippet opens on. A single-component
  // builder reads [0]; the layout composer maps the list onto its chart blocks.
  onSelectDefault,
}: {
  markup: string;
  note?: string;
  responsive?: boolean;
  onSelectDefault?: (indices: number[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);
  const { ready, render } = usePatrikComponents();

  // Held in a ref so an inline callback from the caller doesn't re-run the
  // effect below on every render (which would re-mount the whole preview).
  const selectCb = useRef(onSelectDefault);
  selectCb.current = onSelectDefault;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = markup;
    if (ready) render(el);

    // The renderer swaps the native <select> for its own themed dropdown and
    // keeps the hidden original in sync (selectedIndex) but fires no change
    // event — so read it back after any interaction inside the preview.
    const read = () => {
      if (!selectCb.current) return;
      const all = el.querySelectorAll<HTMLSelectElement>(
        "select.patrik-radar-select, select.patrik-range-select",
      );
      if (!all.length) return;
      selectCb.current(Array.from(all, (s) => (s.selectedIndex < 0 ? 0 : s.selectedIndex)));
    };
    el.addEventListener("click", read);
    el.addEventListener("change", read);
    return () => {
      el.removeEventListener("click", read);
      el.removeEventListener("change", read);
    };
  }, [markup, ready, render, width]);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {responsive ? (
        <div className="flex items-center gap-2 px-4 h-11 border-b border-border/60">
          <h2 className="text-[12px] font-semibold text-foreground tracking-tight">Live preview</h2>
          <span className="hidden md:inline text-[10px] text-muted-foreground">
            {note ?? "on a dark site surface · transparent"}
          </span>
          <div className="ml-auto inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
            {VIEWPORTS.map((v) => {
              const active = v.value === width;
              const VIcon = v.icon;
              return (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setWidth(v.value)}
                  title={v.value ? `${v.value}px wide` : "Full width"}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 h-6 text-[10.5px] font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <VIcon className="w-3 h-3" />
                  <span className="hidden sm:inline tabular-nums">{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <PanelHead title="Live preview" note={note ?? "on a dark site surface · transparent"} />
      )}
      {/* Pure-black surface: the components are dark-native and transparent,
          so this mirrors the black patrikinternational.com pages regardless
          of the admin theme. */}
      <div className="p-4 md:p-6 overflow-x-auto" style={{ background: "#000000" }}>
        <div
          ref={ref}
          className="min-h-[120px] mx-auto"
          style={width ? { width, maxWidth: "100%" } : undefined}
        />
      </div>
    </div>
  );
}

export function CodePanel({ code }: { code: string }) {
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
        className="p-4 text-[11.5px] leading-relaxed font-mono text-foreground whitespace-pre-wrap [overflow-wrap:anywhere] [word-break:break-word] max-w-full"
        // The generated snippet is escaped inside highlight(); this is not user input.
        dangerouslySetInnerHTML={{ __html: highlight(code) }}
      />
    </div>
  );
}

// Compact copyable one-liner (used on the hub to show the loader script tag).
export function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="relative rounded-lg border border-border bg-muted/40">
      <pre className="p-3 pr-11 text-[11px] font-mono text-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
        {code}
      </pre>
      <button
        type="button"
        onClick={copy}
        className={cn(
          "absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors",
          copied
            ? "border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/60"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted bg-background",
        )}
        title={copied ? "Copied" : "Copy"}
        aria-label={copied ? "Copied" : "Copy"}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

/* ─────────────────────────── saved presets ─────────────────────────────── */

type Preset = PresetSummary;

// Saved builds (persisted in MongoDB via /api/builder/presets), SHARED across
// everyone with builder access: anyone can name the current configuration,
// come back later, and load or update any saved build. `getConfig` snapshots
// the builder's state; `applyConfig` restores it. A `?preset=<id>` query param
// (written by the Saved Builds pages' "Open in builder") loads that save on
// mount.
export function SavedPresets({
  builderId,
  getConfig,
  applyConfig,
}: {
  builderId: string;
  getConfig: () => unknown;
  applyConfig: (config: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // A ?preset=<id> deep link from the Saved Builds pages, applied once loaded.
  const pendingPresetRef = useRef<string | null>(null);

  const current = presets.find((p) => p.id === currentId) ?? null;

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("preset");
    if (id) pendingPresetRef.current = id;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/presets?builder=${encodeURIComponent(builderId)}`);
      if (res.ok) {
        const data = (await res.json()) as { presets: Preset[] };
        setPresets(data.presets ?? []);
      }
    } catch {
      /* keep whatever we had */
    } finally {
      setLoading(false);
    }
  }, [builderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Apply the deep-linked preset as soon as the list has it.
  useEffect(() => {
    const id = pendingPresetRef.current;
    if (!id) return;
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    pendingPresetRef.current = null;
    applyConfig(p.config);
    setCurrentId(p.id);
    // Drop the param so a refresh doesn't re-apply over newer edits.
    const url = new URL(window.location.href);
    url.searchParams.delete("preset");
    window.history.replaceState(null, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets]);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: Math.min(r.bottom + 6, window.innerHeight - 8), right: window.innerWidth - r.right });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) setConfirmDeleteId(null);
  }, [open]);

  // Unsaved-changes hint: does the live config differ from the loaded save?
  // `stopKeys` are volatile drag-and-drop identities, regenerated on load — not
  // a real difference.
  const stripVolatile = (k: string, v: unknown) => (k === "stopKeys" ? undefined : v);
  let dirty = false;
  if (current) {
    try {
      dirty =
        JSON.stringify(getConfig(), stripVolatile) !==
        JSON.stringify(current.config, stripVolatile);
    } catch {
      /* treat as clean */
    }
  }

  const onSaved = async (preset: Preset) => {
    setCurrentId(preset.id);
    setSaveOpen(false);
    await refresh();
  };

  const load = (p: Preset) => {
    applyConfig(p.config);
    setCurrentId(p.id);
    setOpen(false);
  };

  const rename = async (p: Preset) => {
    const n = editName.trim();
    setEditingId(null);
    if (!n || n === p.name) return;
    try {
      await fetch(`/api/builder/presets/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      await refresh();
    } catch {
      /* ignore */
    }
  };

  // Shared saves: deleting affects everyone, so require a second click.
  const remove = async (p: Preset) => {
    if (confirmDeleteId !== p.id) {
      setConfirmDeleteId(p.id);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await fetch(`/api/builder/presets/${p.id}`, { method: "DELETE" });
      if (currentId === p.id) setCurrentId(null);
      await refresh();
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {/* Save — the primary action. Opens a proper modal (update vs save-as-new,
          version name, optional team note). A dot marks unsaved changes. */}
      <button
        type="button"
        onClick={() => setSaveOpen(true)}
        className="relative inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 transition-colors shrink-0"
        title={
          current
            ? dirty
              ? `Unsaved changes to “${current.name}”`
              : `Save “${current.name}”`
            : "Save this build"
        }
      >
        <Save className="w-3.5 h-3.5" />
        Save
        {dirty && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-background" />
        )}
      </button>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[11px] font-medium transition-colors shrink-0",
          open
            ? "border-blue-400 text-foreground bg-muted"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
        )}
        title="Saved builds"
      >
        <Bookmark className="w-3.5 h-3.5" />
        <span className="hidden sm:inline max-w-[140px] truncate">
          {current ? current.name : "Saved builds"}
        </span>
        {presets.length > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{presets.length}</span>
        )}
      </button>

      {saveOpen && (
        <SaveBuildModal
          builderId={builderId}
          current={current}
          dirty={dirty}
          getConfig={getConfig}
          onSaved={onSaved}
          onClose={() => setSaveOpen(false)}
        />
      )}

      {open && pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", top: pos.top, right: pos.right, width: 288 }}
            className="z-50 rounded-xl border border-border bg-popover shadow-xl p-3 space-y-3"
          >
            {/* list — shared across everyone with builder access */}
            <div>
              <div className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-2">
                Saved builds
                <span className="text-[10px] text-muted-foreground font-normal">shared with the team</span>
                {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>
              {presets.length === 0 && !loading ? (
                <p className="text-[11px] text-muted-foreground py-1">
                  Nothing saved yet. Name a build above to save it.
                </p>
              ) : (
                <div className="max-h-64 overflow-auto -mx-1 px-1 space-y-0.5">
                  {presets.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        "group flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors",
                        p.id === currentId ? "bg-blue-500/10" : "hover:bg-muted",
                      )}
                    >
                      {editingId === p.id ? (
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => rename(p)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="flex-1 h-7 rounded-md border border-blue-400 bg-background text-[12px] px-2 text-foreground focus:outline-none"
                          spellCheck={false}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => load(p)}
                          className="flex-1 min-w-0 text-left"
                          title={`Load “${p.name}”`}
                        >
                          <span className="block text-[12px] text-foreground truncate leading-tight">
                            {p.name}
                          </span>
                          <span className="block text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                            {p.updatedBy?.name || p.updatedBy?.email || "—"} · {relativeTime(p.updatedAt)}
                          </span>
                        </button>
                      )}
                      {editingId !== p.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(p.id);
                              setEditName(p.name);
                              setConfirmDeleteId(null);
                            }}
                            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-background opacity-0 group-hover:opacity-100 transition"
                            title="Rename"
                            aria-label="Rename"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(p)}
                            className={cn(
                              "h-6 rounded-md flex items-center justify-center transition",
                              confirmDeleteId === p.id
                                ? "px-1.5 gap-1 text-[10px] font-semibold text-white bg-rose-500 hover:bg-rose-600 opacity-100"
                                : "w-6 text-muted-foreground/60 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100",
                            )}
                            title={confirmDeleteId === p.id ? "Click again to delete for everyone" : "Delete"}
                            aria-label="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                            {confirmDeleteId === p.id && "Sure?"}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border/60" />

            <Link
              href="/builder/saved"
              className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
              onClick={() => setOpen(false)}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Manage saved builds — notes &amp; history
            </Link>
          </div>,
          document.body,
        )}
    </>
  );
}

/* ─────────────────────────── save modal ────────────────────────────────── */

// The proper save dialog: choose between updating the loaded shared build or
// saving as a new one, name the build, NAME THE VERSION (required — it is what
// the version history shows), and optionally leave a team note.
function SaveBuildModal({
  builderId,
  current,
  dirty,
  getConfig,
  onSaved,
  onClose,
}: {
  builderId: string;
  current: Preset | null;
  dirty: boolean;
  getConfig: () => unknown;
  onSaved: (p: Preset) => void | Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"update" | "new">(current ? "update" : "new");
  const [name, setName] = useState(current?.name ?? "");
  const [versionLabel, setVersionLabel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const pickMode = (m: "update" | "new") => {
    setMode(m);
    setName(m === "update" ? current?.name ?? "" : "");
    setError(null);
  };

  const canSave = !!name.trim() && !!versionLabel.trim() && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        config: getConfig(),
        versionLabel: versionLabel.trim(),
      };
      const res =
        mode === "update" && current
          ? await fetch(`/api/builder/presets/${current.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch("/api/builder/presets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, builder: builderId }),
            });
      const data = (await res.json().catch(() => ({}))) as { preset?: Preset; error?: string };
      if (!res.ok || !data.preset) throw new Error(data?.error || "Save failed");
      const text = note.trim();
      if (text) {
        // Best-effort: the save itself already succeeded.
        await fetch(`/api/builder/presets/${data.preset.id}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }).catch(() => {});
      }
      await onSaved(data.preset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save build"
        className="relative w-full max-w-md rounded-2xl border border-border bg-popover shadow-2xl overflow-hidden"
      >
        {/* head */}
        <div className="flex items-center gap-2.5 px-5 h-12 border-b border-border/60">
          <Save className="w-4 h-4 text-blue-500" />
          <h2 className="text-[13px] font-semibold text-foreground tracking-tight">Save build</h2>
          <span className="text-[10px] text-muted-foreground">shared with the team</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1.5 -mr-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* update vs save-as-new */}
          {current && (
            <div className="space-y-2">
              {(
                [
                  {
                    value: "update" as const,
                    icon: History,
                    title: `Update “${current.name}”`,
                    desc: "Overwrites this shared build for everyone. The previous state is kept in version history.",
                  },
                  {
                    value: "new" as const,
                    icon: Plus,
                    title: "Save as a new build",
                    desc: `Creates a separate build — “${current.name}” stays untouched.`,
                  },
                ]
              ).map(({ value, icon: MIcon, title, desc }) => {
                const active = mode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => pickMode(value)}
                    aria-pressed={active}
                    className={cn(
                      "w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      active
                        ? "border-blue-400 bg-blue-500/5 ring-2 ring-blue-500/20"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                        active ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <MIcon className="w-3.5 h-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold text-foreground leading-tight truncate">
                        {title}
                      </span>
                      <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">
                        {desc}
                      </span>
                    </span>
                  </button>
                );
              })}
              {mode === "update" && (
                <p className={cn("text-[10.5px] px-1", dirty ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                  {dirty
                    ? "You have unsaved changes — saving records a new version."
                    : "No changes detected since the last save."}
                </p>
              )}
            </div>
          )}

          {/* build name */}
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Build name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === "new" ? "Name the new build…" : "Build name"}
              className="h-8 text-xs bg-background"
              spellCheck={false}
              autoFocus={mode === "new" && !name}
            />
          </label>

          {/* version name — required on every save */}
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              Version name <span className="text-rose-500">*</span>
              <span className="ml-1 text-muted-foreground/60 font-normal">what changed?</span>
            </span>
            <Input
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="e.g. Bumped wave rating, new teal fill…"
              className="h-8 text-xs bg-background"
              spellCheck={false}
              autoFocus={!(mode === "new" && !name)}
            />
          </label>

          {/* optional team note */}
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              Note for the team <span className="text-muted-foreground/60 font-normal">optional</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Context, where this is used, feedback wanted…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground outline-none resize-y focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              spellCheck={false}
            />
          </label>

          {error && <p className="text-[11px] text-rose-500">{error}</p>}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border/60 bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-8 px-3 rounded-lg border border-border text-[11.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-blue-600 text-white text-[11.5px] font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {mode === "update" ? "Save version" : "Save new build"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
  presetKey,
  getConfig,
  applyConfig,
  canvas,
  previewResponsive,
  onPreviewSelect,
}: {
  title: string;
  icon: ElementType;
  badge: string;
  description: ReactNode;
  controls: ReactNode;
  markup: string;
  code: string;
  tip: ReactNode;
  // When provided, the header shows the per-user "Saved builds" control.
  presetKey?: string;
  getConfig?: () => unknown;
  applyConfig?: (config: unknown) => void;
  // An extra full-width panel above the preview — the section composer's
  // rows-and-columns canvas lives here.
  canvas?: ReactNode;
  previewResponsive?: boolean;
  // Switching a compare dropdown in the live preview reports the picked option
  // of every dropdown here, so the builder can store them as the snippet's
  // defaults.
  onPreviewSelect?: (indices: number[]) => void;
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
          <div className="flex items-center gap-2 shrink-0">
            {presetKey && getConfig && applyConfig && (
              <SavedPresets builderId={presetKey} getConfig={getConfig} applyConfig={applyConfig} />
            )}
            <a
              href="/patrik-components.js"
              download
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title="Download the renderer script"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">patrik-components.js</span>
            </a>
          </div>
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
            {canvas}
            <PreviewPanel
              markup={markup}
              responsive={previewResponsive}
              onSelectDefault={onPreviewSelect}
            />
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

export function TextArea({
  value,
  placeholder,
  rows = 3,
  onChange,
}: {
  value: string;
  placeholder?: string;
  rows?: number;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] text-foreground outline-none resize-y focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
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

// A modern custom dropdown — replaces the native <select> so the closed
// control and the open option list are both fully themed (native option lists
// can't be styled). Portalled + fixed-positioned like ColorField so it is never
// clipped by a scroll container, with keyboard support (↑/↓/Enter/Esc).
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const curIdx = Math.max(0, options.findIndex((o) => o.value === value));

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxH = 240;
    const listH = Math.min(maxH, options.length * 34 + 8);
    const below = window.innerHeight - r.bottom - 8;
    // Open below by default; flip above when cramped and there's more room up.
    const top = below < listH && r.top > below ? Math.max(8, r.top - 6 - listH) : r.bottom + 6;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - r.width - 8);
    setPos({ top, left, width: r.width });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    place();
    setActiveIdx(curIdx);
    requestAnimationFrame(() => popRef.current?.focus());
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, place, curIdx]);

  const commit = (v: T) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "flex items-center gap-2 w-full h-8 rounded-md border bg-background px-2.5 text-[11.5px] text-foreground transition-colors",
          open ? "border-blue-400 ring-2 ring-blue-500/20" : "border-border hover:bg-muted/50",
        )}
      >
        <span className="flex-1 truncate text-left">
          {selected ? selected.label : <span className="text-muted-foreground">{placeholder ?? "Select"}</span>}
        </span>
        <ChevronDown
          className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(options.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (options[activeIdx]) commit(options[activeIdx].value);
              } else if (e.key === "Escape") {
                setOpen(false);
                triggerRef.current?.focus();
              }
            }}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, maxHeight: 240 }}
            className="z-50 overflow-auto rounded-lg border border-border bg-popover shadow-xl p-1 focus:outline-none"
          >
            {options.map((o, i) => {
              const isSel = o.value === value;
              return (
                <button
                  key={String(o.value) + i}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => commit(o.value)}
                  className={cn(
                    "flex items-center gap-2 w-full rounded-md px-2 h-8 text-[11.5px] text-left transition-colors",
                    isSel
                      ? "bg-blue-600 text-white"
                      : i === activeIdx
                        ? "bg-muted text-foreground"
                        : "text-foreground hover:bg-muted",
                  )}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {isSel && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
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
    <label className="group flex items-center gap-2.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={cn(
          "relative w-[18px] h-[18px] rounded-[6px] border flex items-center justify-center shrink-0 transition-all duration-150",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background",
          checked
            ? "bg-blue-600 border-blue-600 shadow-sm shadow-blue-600/25"
            : "bg-background border-border group-hover:border-blue-400 group-hover:bg-blue-500/5",
        )}
      >
        <Check
          className={cn(
            "w-3 h-3 text-white transition-all duration-150",
            checked ? "opacity-100 scale-100" : "opacity-0 scale-50",
          )}
          strokeWidth={3.5}
        />
      </span>
      <span className="text-[12px] text-foreground leading-tight">{children}</span>
    </label>
  );
}

// Swatches sampled straight from patrikinternational.com — the brand teals
// first (incl. the component default #38b6d3), then the site's accent reds,
// earth tone, neutrals, and the light tints used for labels/points on dark.
const SWATCHES = [
  "#01a0be", "#269ebc", "#2786b4", "#38b6d3", "#0b131c", "#000000",
  "#b72a4c", "#e82c2e", "#55473c", "#303030", "#888888", "#cccccc",
  "#e2e2e2", "#f3f6fd", "#ffffff", "#c7dce4", "#eaf7fb", "#645448",
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
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // The popover is rendered in a portal with fixed positioning, clamped to the
  // viewport — so it can never be clipped by a scroll/overflow container.
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 236;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const top = Math.min(r.bottom + 6, window.innerHeight - 8);
    setPos({ top, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  const commit = (raw: string) => {
    let h = raw.trim();
    if (h && !h.startsWith("#")) h = "#" + h;
    if (isHex(h)) onChange(h);
    setDraft(null);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
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

      {onReset != null && (
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

      {open && pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-50 rounded-xl border border-border bg-popover shadow-xl p-2.5 space-y-2.5"
          >
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
          </div>,
          document.body,
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
  // An extra control in the card head, left of the remove button.
  action,
  children,
}: {
  title: string;
  onRemove?: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
          {title}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {action}
          {onRemove && (
            <IconButton onClick={onRemove} title={`Remove ${title}`}>
              <RemoveIcon />
            </IconButton>
          )}
        </span>
      </div>
      {children}
    </div>
  );
}

// Marks which entry of a compare dropdown is shown when the page loads — the
// same thing that picking an option in the live preview sets.
export function DefaultPill({
  active,
  onClick,
  title,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={active ? undefined : onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 h-5 px-1.5 rounded-md border text-[9.5px] font-semibold uppercase tracking-wide transition-colors shrink-0",
        active
          ? "border-blue-500/50 bg-blue-500/15 text-blue-600 dark:text-blue-400 cursor-default"
          : "border-border text-muted-foreground/70 hover:text-foreground hover:border-blue-400 hover:bg-blue-500/5",
      )}
    >
      <Star className={cn("w-2.5 h-2.5", active && "fill-current")} />
      {active ? "Shown first" : "Show first"}
    </button>
  );
}
