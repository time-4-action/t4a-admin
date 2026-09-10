"use client";
// Saved Builds — every configuration anyone on the team has saved from the
// section builders, shared across all users with builder access. Click a card
// for notes, version history, and revert.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Search,
  Radar,
  SlidersHorizontal,
  MessageSquare,
  History,
  ChevronRight,
  LayoutGrid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { usePatrikComponents } from "@/lib/use-patrik-components";
import type { PresetSummary } from "@/types/builder";
import { BUILDER_META, generateSnippet, isBuilderId } from "../generators";
import { relativeTime, fmtDateTime } from "../builder-ui";

const BUILDER_ICON: Record<string, React.ElementType> = {
  "radar-chart": Radar,
  "range-bars": SlidersHorizontal,
  layout: LayoutGrid,
};

// The component's natural render width, read from the saved config — used to
// scale the whole component down to fit the thumbnail (never cropped).
function naturalWidthOf(p: PresetSummary): number {
  const c = p.config as { size?: unknown; maxWidth?: unknown } | null;
  if (p.builder === "layout")
    return c && typeof c.maxWidth === "number" ? c.maxWidth : 1200;
  const size = c && typeof c.size === "number" ? c.size : null;
  if (p.builder === "radar-chart") return size ?? 460;
  return Math.min(size ?? 720, 720);
}

// A non-interactive render of the real component on the black site surface,
// scaled down so the ENTIRE component fits the thumbnail — the same renderer
// the builders' live preview uses.
function MiniPreview({
  markup,
  naturalWidth,
  className,
}: {
  markup: string | null;
  naturalWidth: number;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const { ready, render } = usePatrikComponents();

  const fit = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const pad = 20;
    const cw = outer.clientWidth - pad;
    const ch = outer.clientHeight - pad;
    const w = naturalWidth;
    const h = inner.scrollHeight;
    if (cw <= 0 || ch <= 0 || w <= 0 || h <= 0) return;
    setScale(Math.min(cw / w, ch / h, 1));
  }, [naturalWidth]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.innerHTML = markup ?? "";
    if (ready && markup) render(el);
    // Measure after paint, and again shortly after in case the renderer sizes
    // its SVG asynchronously.
    const raf = requestAnimationFrame(fit);
    const t = setTimeout(fit, 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [markup, ready, render, fit]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <div
      ref={outerRef}
      className={cn(
        "relative overflow-hidden pointer-events-none select-none shrink-0",
        className,
      )}
      style={{ background: "#000000" }}
      aria-hidden
    >
      {markup ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            ref={innerRef}
            style={{
              width: naturalWidth,
              // Must not flex-shrink: the transform scales it to fit — if flex
              // shrank it first, the component would render twice as small.
              flexShrink: 0,
              transform: `scale(${scale ?? 0})`,
              transformOrigin: "center",
              transition: scale != null ? "transform 200ms ease" : undefined,
            }}
          />
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-[11px] text-white/40">
          No preview
        </div>
      )}
    </div>
  );
}

function BuildMeta({ p }: { p: PresetSummary }) {
  const editor = p.updatedBy?.name || p.updatedBy?.email || "—";
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground min-w-0">
      <span
        className="truncate"
        title={`${p.versionLabel ? `“${p.versionLabel}” · ` : ""}last edited by ${editor} · ${fmtDateTime(p.updatedAt)}`}
      >
        {p.versionLabel ? `“${p.versionLabel}” · ` : ""}
        {editor} · {relativeTime(p.updatedAt)}
      </span>
      <span
        className="ml-auto inline-flex items-center gap-1 shrink-0"
        title={`${p.noteCount} note${p.noteCount === 1 ? "" : "s"}`}
      >
        <MessageSquare className="w-3 h-3" />
        <span className="tabular-nums">{p.noteCount}</span>
      </span>
      <span
        className="inline-flex items-center gap-1 shrink-0"
        title={`${p.versionCount} earlier version${p.versionCount === 1 ? "" : "s"}`}
      >
        <History className="w-3 h-3" />
        <span className="tabular-nums">{p.versionCount}</span>
      </span>
    </div>
  );
}

function SavedCard({ p, index }: { p: PresetSummary; index: number }) {
  const Icon = BUILDER_ICON[p.builder] ?? Bookmark;
  const meta = isBuilderId(p.builder) ? BUILDER_META[p.builder] : null;
  const markup = useMemo(() => generateSnippet(p.builder, p.config)?.markup ?? null, [p.builder, p.config]);

  return (
    <Link
      href={`/builder/saved/${p.id}`}
      className="group bg-surface border border-border rounded-2xl overflow-hidden shadow-sm hover:border-blue-300 dark:hover:border-blue-700/60 hover:shadow-md transition-all reveal flex flex-col"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <MiniPreview markup={markup} naturalWidth={naturalWidthOf(p)} className="h-48" />
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5 text-blue-500" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-semibold text-foreground leading-tight truncate group-hover:underline">
              {p.name}
            </h2>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              {meta?.label ?? p.builder}
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
        <div className="mt-auto pt-1">
          <BuildMeta p={p} />
        </div>
      </div>
    </Link>
  );
}

function SavedRow({ p, index }: { p: PresetSummary; index: number }) {
  const Icon = BUILDER_ICON[p.builder] ?? Bookmark;
  const meta = isBuilderId(p.builder) ? BUILDER_META[p.builder] : null;
  const markup = useMemo(() => generateSnippet(p.builder, p.config)?.markup ?? null, [p.builder, p.config]);

  return (
    <Link
      href={`/builder/saved/${p.id}`}
      className="group bg-surface border border-border rounded-xl overflow-hidden shadow-sm hover:border-blue-300 dark:hover:border-blue-700/60 hover:shadow-md transition-all reveal flex items-stretch"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
      <MiniPreview markup={markup} naturalWidth={naturalWidthOf(p)} className="w-44 sm:w-56 self-stretch min-h-[104px]" />
      <div className="flex-1 min-w-0 p-4 flex flex-col justify-center gap-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
            <Icon className="w-3 h-3 text-blue-500" />
          </span>
          <h2 className="text-[13.5px] font-semibold text-foreground leading-tight truncate group-hover:underline">
            {p.name}
          </h2>
          <span className="hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 shrink-0">
            {meta?.label ?? p.builder}
          </span>
          <ChevronRight className="ml-auto w-4 h-4 text-muted-foreground/50 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
        <div className="max-w-md">
          <BuildMeta p={p} />
        </div>
      </div>
    </Link>
  );
}

// Thumbnail stand-in: the black site surface the MiniPreview paints, with a
// faint shimmer so the card keeps its footprint until the preview mounts.
function ThumbSkeleton({ className, delay }: { className: string; delay: number }) {
  return (
    <div className={cn("relative overflow-hidden shrink-0", className)} style={{ background: "#000000" }}>
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <Skeleton className="h-full w-full max-h-24 max-w-[200px] rounded-xl opacity-20 dark:opacity-40" delay={delay} />
      </div>
    </div>
  );
}

// Twin of BuildMeta: "version · editor · time" line + the two count icons.
function BuildMetaSkeleton({ delay }: { delay: number }) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground min-w-0">
      <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-40" className="min-w-0" delay={delay} />
      <span className="ml-auto inline-flex items-center gap-1 shrink-0">
        <MessageSquare className="w-3 h-3" />
        <Skeleton className="h-2.5 w-2" delay={delay + 20} />
      </span>
      <span className="inline-flex items-center gap-1 shrink-0">
        <History className="w-3 h-3" />
        <Skeleton className="h-2.5 w-2" delay={delay + 40} />
      </span>
    </div>
  );
}

function CardSkeleton({ i, view }: { i: number; view: View }) {
  if (view === "list") {
    return (
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm flex items-stretch">
        <ThumbSkeleton className="w-44 sm:w-56 self-stretch min-h-[104px]" delay={stagger(i)} />
        <div className="flex-1 min-w-0 p-4 flex flex-col justify-center gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <Skeleton className="w-6 h-6 rounded-md shrink-0" delay={stagger(i, 80, 40)} />
            {/* text-[13.5px] leading-tight → ~17px */}
            <SkeletonLine lh="h-[17px]" h="h-3.5" w={["w-40", "w-32", "w-48", "w-36", "w-44"][i % 5]} delay={stagger(i, 80, 60)} />
            <Skeleton className="hidden sm:block h-[15px] w-20 shrink-0" delay={stagger(i, 80, 80)} />
            <ChevronRight className="ml-auto w-4 h-4 text-muted-foreground/30 shrink-0" />
          </div>
          <div className="max-w-md">
            <BuildMetaSkeleton delay={stagger(i, 80, 100)} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
      <ThumbSkeleton className="h-48" delay={stagger(i)} />
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Skeleton className="w-7 h-7 rounded-lg shrink-0" delay={stagger(i, 80, 40)} />
          <div className="min-w-0 flex-1">
            <SkeletonLine lh="h-[17px]" h="h-3.5" w={["w-2/3", "w-1/2", "w-3/4", "w-3/5"][i % 4]} delay={stagger(i, 80, 60)} />
            <SkeletonLine lh="h-[15px]" h="h-2.5" w="w-20" delay={stagger(i, 80, 80)} />
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
        </div>
        <div className="mt-auto pt-1">
          <BuildMetaSkeleton delay={stagger(i, 80, 100)} />
        </div>
      </div>
    </div>
  );
}

type Filter = "all" | "radar-chart" | "range-bars";
type View = "grid" | "list";

const VIEW_KEY = "t4a-saved-builds-view";

export default function SavedBuildsPage() {
  const [presets, setPresets] = useState<PresetSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("grid");

  // Persisted grid/list preference.
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "list") setView(v);
    } catch {
      /* ignore */
    }
  }, []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/builder/presets");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { presets: PresetSummary[] };
        if (alive) setPresets(data.presets ?? []);
      } catch {
        if (alive) setPresets([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!presets) return null;
    const needle = q.trim().toLowerCase();
    return presets.filter((p) => {
      if (filter !== "all" && p.builder !== filter) return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        (p.updatedBy?.name ?? "").toLowerCase().includes(needle) ||
        (p.createdBy?.name ?? "").toLowerCase().includes(needle) ||
        (p.updatedBy?.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [presets, q, filter]);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "radar-chart", label: "Radar Chart" },
    { value: "range-bars", label: "Range Bars" },
  ];

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center gap-2.5 px-4 md:px-8">
          <Bookmark className="w-4 h-4 text-blue-500 shrink-0" />
          <h1 className="font-display text-lg font-medium tracking-tight text-foreground">
            Saved Builds
          </h1>
          {presets === null ? (
            <Skeleton className="h-[19px] w-7 rounded-full" />
          ) : presets.length > 0 && (
            <span className="inline-flex items-center text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5 tabular-nums">
              {presets.length}
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="space-y-5">
          <p className="text-[13px] text-muted-foreground leading-relaxed max-w-2xl">
            Every build anyone on the team has saved from the section builders — shared with
            everyone who has builder access. Open a build to see its notes, who changed it, and the
            full version history with one-click revert.
          </p>

          {/* toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or person…"
                className="h-8 pl-8 text-xs bg-surface"
                spellCheck={false}
              />
            </div>
            <div className="flex items-center gap-2.5">
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 shrink-0">
                {filters.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFilter(f.value)}
                    className={cn(
                      "rounded-md px-3 h-7 text-[11.5px] font-medium transition-colors",
                      filter === f.value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 shrink-0 ml-auto sm:ml-0">
                {(
                  [
                    { value: "grid", icon: LayoutGrid, label: "Grid view" },
                    { value: "list", icon: List, label: "List view" },
                  ] as { value: View; icon: React.ElementType; label: string }[]
                ).map(({ value, icon: VIcon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => changeView(value)}
                    title={label}
                    aria-label={label}
                    aria-pressed={view === value}
                    className={cn(
                      "rounded-md w-8 h-7 flex items-center justify-center transition-colors",
                      view === value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <VIcon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* results */}
          {filtered === null ? (
            view === "list" ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <CardSkeleton key={i} i={i} view="list" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <CardSkeleton key={i} i={i} view="grid" />
                ))}
              </div>
            )
          ) : filtered.length === 0 ? (
            <div className="bg-surface border border-border rounded-2xl py-14 px-6 text-center">
              <Bookmark className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-[13px] font-medium text-foreground">
                {presets && presets.length > 0 ? "No builds match" : "Nothing saved yet"}
              </p>
              <p className="text-[12px] text-muted-foreground mt-1 max-w-sm mx-auto">
                {presets && presets.length > 0 ? (
                  "Try a different search or filter."
                ) : (
                  <>
                    Save a configuration from the{" "}
                    <Link href="/builder/radar-chart" className="text-blue-600 dark:text-blue-400 hover:underline">
                      Radar Chart
                    </Link>{" "}
                    or{" "}
                    <Link href="/builder/range-bars" className="text-blue-600 dark:text-blue-400 hover:underline">
                      Range Bars
                    </Link>{" "}
                    builder and it will show up here for the whole team.
                  </>
                )}
              </p>
            </div>
          ) : view === "list" ? (
            <div className="space-y-3">
              {filtered.map((p, i) => (
                <SavedRow key={p.id} p={p} index={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {filtered.map((p, i) => (
                <SavedCard key={p.id} p={p} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
