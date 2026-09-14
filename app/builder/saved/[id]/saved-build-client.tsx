"use client";
// One saved build: live preview + snippet, team notes, and the full version
// history with revert. Saves are shared — anyone with builder access can edit,
// comment, restore, or delete.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  Radar,
  SlidersHorizontal,
  LayoutGrid,
  Pencil,
  Trash2,
  Loader2,
  History,
  MessageSquare,
  Send,
  Eye,
  RotateCcw,
  ExternalLink,
  X,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import type { PresetDetail, PresetActor, PresetVersion } from "@/types/builder";
import { BUILDER_META, generateSnippet, isBuilderId } from "../../generators";
import { PreviewPanel, CodePanel, relativeTime, fmtDateTime } from "../../builder-ui";

const BUILDER_ICON: Record<string, React.ElementType> = {
  "radar-chart": Radar,
  "range-bars": SlidersHorizontal,
  layout: LayoutGrid,
};

function actorLabel(a?: PresetActor | null): string {
  return a?.name || a?.email || "—";
}

function Avatar({ label }: { label: string }) {
  const initials = label
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  return (
    <span className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-muted text-muted-foreground text-[10px] font-semibold select-none ring-1 ring-border">
      {initials || "?"}
    </span>
  );
}

function CardHead({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 px-4 h-11 border-b border-border/60">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <h2 className="text-[12px] font-semibold text-foreground tracking-tight">{title}</h2>
      {count != null && count > 0 && (
        <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

export default function SavedBuildClient({
  id,
  viewer,
}: {
  id: string;
  viewer: PresetActor;
}) {
  const router = useRouter();
  const [preset, setPreset] = useState<PresetDetail | null>(null);
  const [missing, setMissing] = useState(false);

  // header actions
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // "rename" | "delete" | "note" | version id
  const [error, setError] = useState<string | null>(null);

  // version preview / revert
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  // notes
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/builder/presets/${encodeURIComponent(id)}`);
        if (res.status === 404) {
          if (alive) setMissing(true);
          return;
        }
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { preset: PresetDetail };
        if (alive) setPreset(data.preset);
      } catch {
        if (alive) setMissing(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const previewVersion: PresetVersion | null =
    (previewVersionId && preset?.versions.find((v) => v.id === previewVersionId)) || null;

  const snippet = useMemo(() => {
    if (!preset) return null;
    return generateSnippet(preset.builder, previewVersion ? previewVersion.config : preset.config);
  }, [preset, previewVersion]);

  const call = async (
    key: string,
    url: string,
    init: RequestInit,
    after?: (p: PresetDetail) => void,
  ) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, init);
      const data = (await res.json().catch(() => ({}))) as { preset?: PresetDetail; error?: string };
      if (!res.ok) throw new Error(data?.error || "Something went wrong");
      if (data.preset) {
        setPreset(data.preset);
        after?.(data.preset);
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const rename = async () => {
    const n = nameDraft.trim();
    setEditingName(false);
    if (!preset || !n || n === preset.name) return;
    await call("rename", `/api/builder/presets/${preset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
  };

  const removeBuild = async () => {
    if (!preset) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/builder/presets/${preset.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.push("/builder/saved");
    } catch (e) {
      setBusy(null);
      setConfirmDelete(false);
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const restore = async (v: PresetVersion) => {
    if (!preset) return;
    if (confirmRestoreId !== v.id) {
      setConfirmRestoreId(v.id);
      return;
    }
    setConfirmRestoreId(null);
    await call(v.id, `/api/builder/presets/${preset.id}/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId: v.id }),
    }, () => setPreviewVersionId(null));
  };

  const postNote = async () => {
    const text = noteDraft.trim();
    if (!preset || !text) return;
    const ok = await call("note", `/api/builder/presets/${preset.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (ok) setNoteDraft("");
  };

  const removeNote = async (noteId: string) => {
    if (!preset) return;
    await call(`note:${noteId}`, `/api/builder/presets/${preset.id}/notes/${noteId}`, {
      method: "DELETE",
    });
  };

  /* ── not found ── */
  if (missing) {
    return (
      <div className="flex flex-col h-full">
        <header className="border-b border-border shrink-0 h-14 flex items-center gap-2 px-4 md:px-8">
          <Link
            href="/builder/saved"
            className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Back to saved builds"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="font-display text-lg font-medium tracking-tight text-foreground">Saved build</h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <Bookmark className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-[13px] font-medium text-foreground">This build no longer exists</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              It may have been deleted by a teammate.
            </p>
            <Link
              href="/builder/saved"
              className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-[12px] font-medium hover:bg-blue-700"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All saved builds
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const meta = preset && isBuilderId(preset.builder) ? BUILDER_META[preset.builder] : null;
  const Icon = (preset && BUILDER_ICON[preset.builder]) ?? Bookmark;

  return (
    <div className="flex flex-col h-full">
      {/* header */}
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Link
              href="/builder/saved"
              className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title="All saved builds"
              aria-label="All saved builds"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Icon className="w-4 h-4 text-blue-500 shrink-0" />
            {!preset ? (
              <>
                {/* text-lg → 28px line box; badge pill + pencil keep their slots */}
                <SkeletonLine lh="h-7" h="h-5" w="w-44" />
                <span className="p-1.5 shrink-0"><Pencil className="w-3.5 h-3.5 text-muted-foreground/30" /></span>
                <Skeleton className="hidden sm:block h-[20.5px] w-20 rounded-full shrink-0" delay={40} />
              </>
            ) : editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={rename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="h-8 min-w-0 flex-1 max-w-xs rounded-lg border border-blue-400 bg-background px-2.5 font-display text-lg font-medium tracking-tight text-foreground focus:outline-none"
                spellCheck={false}
              />
            ) : (
              <>
                <h1 className="font-display text-lg font-medium tracking-tight text-foreground truncate">
                  {preset.name}
                </h1>
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(preset.name);
                    setEditingName(true);
                  }}
                  className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors shrink-0"
                  title="Rename"
                  aria-label="Rename"
                >
                  {busy === "rename" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Pencil className="w-3.5 h-3.5" />
                  )}
                </button>
              </>
            )}
            {meta && (
              <span className="hidden sm:inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/50 rounded-full px-2 py-0.5 shrink-0">
                {meta.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!preset && (
              <>
                <Skeleton className="h-8 w-8 sm:w-[132px] rounded-lg" delay={60} />
                <Skeleton className="h-8 w-8 rounded-lg" delay={80} />
              </>
            )}
            {preset && (
              <>
                <Link
                  href={`/builder/${preset.builder}?preset=${preset.id}`}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 transition-colors"
                  title="Load this build in its builder"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Open in builder</span>
                </Link>
                <button
                  type="button"
                  onClick={removeBuild}
                  onBlur={() => setConfirmDelete(false)}
                  disabled={busy === "delete"}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-8 rounded-lg border text-[11px] font-medium transition-colors disabled:opacity-50",
                    confirmDelete
                      ? "px-3 border-rose-500 bg-rose-500 text-white hover:bg-rose-600"
                      : "px-2.5 border-border text-muted-foreground hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-800",
                  )}
                  title={confirmDelete ? "Click again to delete for everyone" : "Delete this build"}
                >
                  {busy === "delete" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  {confirmDelete && "Delete for everyone?"}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-4 md:p-8">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-300 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
            <Info className="w-3.5 h-3.5 shrink-0" />
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-auto" aria-label="Dismiss">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {!preset ? (
          <SavedBuildSkeleton />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-4 items-start">
            {/* ── sidebar ── */}
            <div className="space-y-4">
              {/* details */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <CardHead icon={Info} title="Details" />
                <dl className="p-4 space-y-2.5 text-[12px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground shrink-0">Builder</dt>
                    <dd className="text-foreground font-medium text-right">{meta?.label ?? preset.builder}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground shrink-0">Version</dt>
                    <dd className="text-foreground text-right truncate" title={preset.versionLabel}>
                      {preset.versionLabel || "—"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground shrink-0">Created by</dt>
                    <dd className="text-foreground text-right truncate" title={preset.createdBy.email}>
                      {actorLabel(preset.createdBy)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground shrink-0">Created</dt>
                    <dd className="text-foreground text-right" title={fmtDateTime(preset.createdAt)}>
                      {relativeTime(preset.createdAt)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground shrink-0">Last edited by</dt>
                    <dd className="text-foreground text-right truncate" title={preset.updatedBy.email}>
                      {actorLabel(preset.updatedBy)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground shrink-0">Last edited</dt>
                    <dd className="text-foreground text-right" title={fmtDateTime(preset.updatedAt)}>
                      {relativeTime(preset.updatedAt)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* version history */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <CardHead icon={History} title="Version history" count={preset.versions.length} />
                <div className="p-3 space-y-1">
                  {/* current version pinned on top */}
                  <div
                    className={cn(
                      "rounded-lg px-2.5 py-2 border transition-colors",
                      !previewVersionId
                        ? "border-blue-300 dark:border-blue-800/60 bg-blue-500/5"
                        : "border-transparent hover:bg-muted cursor-pointer",
                    )}
                    onClick={() => setPreviewVersionId(null)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setPreviewVersionId(null)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-foreground truncate">
                        {preset.versionLabel || "Current version"}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground shrink-0" title={fmtDateTime(preset.updatedAt)}>
                        {relativeTime(preset.updatedAt)}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-muted-foreground mt-0.5 pl-3.5 truncate">
                      current · by {actorLabel(preset.updatedBy)}
                    </p>
                  </div>

                  {preset.versions.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground px-2.5 py-2">
                      No earlier versions yet. Updating this build from a builder page records one.
                    </p>
                  ) : (
                    preset.versions.map((v) => {
                      const viewing = previewVersionId === v.id;
                      return (
                        <div
                          key={v.id}
                          className={cn(
                            "group rounded-lg px-2.5 py-2 border transition-colors",
                            viewing
                              ? "border-amber-300 dark:border-amber-800/60 bg-amber-500/5"
                              : "border-transparent hover:bg-muted",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                            <span className="text-[11px] font-medium text-foreground truncate">
                              {v.label || "Unnamed version"}
                            </span>
                            <span className="ml-auto text-[10px] text-muted-foreground shrink-0" title={fmtDateTime(v.savedAt)}>
                              {relativeTime(v.savedAt)}
                            </span>
                          </div>
                          <p className="text-[10.5px] text-muted-foreground mt-0.5 pl-3.5 truncate">
                            by {actorLabel(v.savedBy)}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5 pl-3.5">
                            <button
                              type="button"
                              onClick={() => setPreviewVersionId(viewing ? null : v.id)}
                              className={cn(
                                "inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10.5px] font-medium transition-colors",
                                viewing
                                  ? "border-amber-400 text-amber-700 dark:text-amber-300 bg-amber-500/10"
                                  : "border-border text-muted-foreground hover:text-foreground hover:bg-background",
                              )}
                            >
                              <Eye className="w-3 h-3" />
                              {viewing ? "Viewing" : "Preview"}
                            </button>
                            <button
                              type="button"
                              onClick={() => restore(v)}
                              onBlur={() => setConfirmRestoreId((c) => (c === v.id ? null : c))}
                              disabled={busy === v.id}
                              className={cn(
                                "inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10.5px] font-medium transition-colors disabled:opacity-50",
                                confirmRestoreId === v.id
                                  ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                                  : "border-border text-muted-foreground hover:text-foreground hover:bg-background",
                              )}
                              title={confirmRestoreId === v.id ? "Click again to restore this version" : "Restore this version"}
                            >
                              {busy === v.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3 h-3" />
                              )}
                              {confirmRestoreId === v.id ? "Restore?" : "Restore"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* ── main ── */}
            <div className="space-y-4 min-w-0">
              {previewVersion && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                  <span className="min-w-0 truncate">
                    Viewing <strong>“{previewVersion.label || "Unnamed version"}”</strong> — saved by{" "}
                    <strong>{actorLabel(previewVersion.savedBy)}</strong>{" "}
                    <span title={fmtDateTime(previewVersion.savedAt)}>{relativeTime(previewVersion.savedAt)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewVersionId(null)}
                    className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-md border border-amber-400/60 text-[10.5px] font-medium hover:bg-amber-500/10 shrink-0"
                  >
                    <X className="w-3 h-3" />
                    Back to current
                  </button>
                </div>
              )}

              {snippet ? (
                <>
                  <PreviewPanel
                    markup={snippet.markup}
                    note={previewVersion ? "older version · read-only" : undefined}
                  />
                  <CodePanel code={snippet.code} />
                </>
              ) : (
                <div className="bg-surface border border-border rounded-xl p-6 text-center text-[12px] text-muted-foreground">
                  This build&apos;s configuration couldn&apos;t be rendered. Open it in its builder to inspect it.
                </div>
              )}

              {/* notes */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <CardHead icon={MessageSquare} title="Notes" count={preset.notes.length} />
                <div className="p-4 space-y-4">
                  <div className="flex gap-3">
                    <Avatar label={viewer.name || viewer.email} />
                    <div className="flex-1 min-w-0 space-y-2">
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            postNote();
                          }
                        }}
                        placeholder="Leave a note for the team — context, feedback, where this build is used…"
                        rows={2}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] text-foreground outline-none resize-y focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                        spellCheck={false}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] text-muted-foreground">
                          Visible to everyone with builder access · ⌘/Ctrl+Enter
                        </p>
                        <button
                          type="button"
                          onClick={postNote}
                          disabled={!noteDraft.trim() || busy === "note"}
                          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                          {busy === "note" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3" />
                          )}
                          Post note
                        </button>
                      </div>
                    </div>
                  </div>

                  {preset.notes.length === 0 ? (
                    <p className="text-center text-[12px] text-muted-foreground py-4">
                      No notes yet. Use this space to tell teammates what this build is for.
                    </p>
                  ) : (
                    <div className="space-y-3 pt-3 border-t border-border/50">
                      {preset.notes.map((n) => (
                        <div key={n.id} className="flex gap-3 group">
                          <Avatar label={actorLabel(n.author)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-[12px] font-semibold text-foreground">
                                {actorLabel(n.author)}
                              </span>
                              <span className="text-[10px] text-muted-foreground" title={fmtDateTime(n.createdAt)}>
                                {relativeTime(n.createdAt)}
                              </span>
                              {n.author.id === viewer.id && (
                                <button
                                  type="button"
                                  onClick={() => removeNote(n.id)}
                                  disabled={busy === `note:${n.id}`}
                                  aria-label="Delete note"
                                  className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity focus-visible:opacity-100 focus-visible:outline-none disabled:opacity-50"
                                >
                                  {busy === `note:${n.id}` ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                            </div>
                            <p className="text-[12.5px] text-foreground whitespace-pre-wrap break-words leading-relaxed mt-0.5">
                              {n.text}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── skeleton twin ────────────────────────────────────────────────────────────
// Same two-column layout as the loaded detail: Details + Version history cards
// on the left, preview + snippet + notes on the right. Card heads and row
// labels are static and render for real; only the build's data shimmers.
const DETAIL_ROWS = ["Builder", "Version", "Created by", "Created", "Last edited by", "Last edited"];

function SavedBuildSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-4 items-start">
      <div className="space-y-4">
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <CardHead icon={Info} title="Details" />
          <dl className="p-4 space-y-2.5 text-[12px]">
            {DETAIL_ROWS.map((label, i) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground shrink-0">{label}</dt>
                <SkeletonLine lh="h-[18px]" w={["w-24", "w-32", "w-28", "w-16", "w-28", "w-16"][i]} delay={stagger(i, 40)} />
              </div>
            ))}
          </dl>
        </div>
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <CardHead icon={History} title="Version history" />
          <div className="p-3 space-y-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", i === 0 ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                  <SkeletonLine lh="h-[16.5px]" h="h-2.5" w={["w-28", "w-24", "w-32"][i]} delay={stagger(i, 60, 240)} />
                  <SkeletonLine lh="h-[15px]" h="h-2" w="w-12" className="ml-auto shrink-0" delay={stagger(i, 60, 260)} />
                </div>
                <SkeletonLine lh="h-[16px]" h="h-2" w="w-36" className="mt-0.5 pl-3.5" delay={stagger(i, 60, 280)} />
                {i > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5 pl-3.5">
                    <Skeleton className="h-6 w-16 rounded-md" delay={stagger(i, 60, 300)} />
                    <Skeleton className="h-6 w-6 rounded-md" delay={stagger(i, 60, 320)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 min-w-0">
        {/* live preview — black site surface, faint shimmer where the component renders */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 h-11 border-b border-border/60">
            <h2 className="text-[12px] font-semibold text-foreground tracking-tight">Live preview</h2>
            <span className="text-[10px] text-muted-foreground">on a dark site surface · transparent</span>
          </div>
          <div className="p-4 md:p-6" style={{ background: "#000000" }}>
            <div className="min-h-[120px] mx-auto flex items-center justify-center">
              <Skeleton className="h-[120px] w-full max-w-md rounded-xl opacity-20 dark:opacity-40" />
            </div>
          </div>
        </div>
        {/* snippet */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 h-11 border-b border-border/60">
            <h2 className="text-[12px] font-semibold text-foreground tracking-tight">HTML snippet</h2>
            <span className="text-[10px] text-muted-foreground">paste into your page</span>
            <Skeleton className="ml-auto h-7 w-[66px] rounded-lg" />
          </div>
          <div className="p-4">
            {/* text-[11.5px] leading-relaxed → ~18.7px per line */}
            {[95, 80, 88, 60, 72, 40].map((w, i) => (
              <SkeletonLine key={i} lh="h-[18.7px]" h="h-2.5" w="" style={{ width: `${w}%` }} delay={stagger(i, 40, 100)} />
            ))}
          </div>
        </div>
        {/* notes */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <CardHead icon={MessageSquare} title="Notes" />
          <div className="p-4 space-y-4">
            <div className="flex gap-3">
              <Skeleton className="w-7 h-7 rounded-full shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                {/* rows=2 textarea: 2×18.75 + 16 + 2 */}
                <Skeleton className="h-[55.5px] w-full rounded-lg" delay={40} />
                <div className="flex items-center justify-between gap-2">
                  <SkeletonLine lh="h-[15px]" h="h-2.5" w="w-40" delay={80} />
                  <Skeleton className="h-7 w-[88px] rounded-lg" delay={100} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
