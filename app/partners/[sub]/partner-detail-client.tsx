"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Store,
  Download,
  Rss,
  Activity as ActivityIcon,
  MessageSquare,
  Loader2,
  Send,
  BarChart3,
  Trash2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EVENT_LABELS,
  type PartnerDetail,
  type PartnerActivityEvent,
} from "@/types/partner";

// ── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function relativeTime(value?: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

function initials(label: string): string {
  return (label || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function Avatar({ label, picture, className }: { label: string; picture?: string; className?: string }) {
  if (picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt="" className={cn("rounded-full object-cover ring-1 ring-border shrink-0", className)} />;
  }
  return (
    <span className={cn("rounded-full shrink-0 flex items-center justify-center bg-muted text-muted-foreground font-semibold ring-1 ring-border", className)}>
      {initials(label)}
    </span>
  );
}

const STATUS_TINT: Record<string, string> = {
  active: "text-emerald-600 dark:text-emerald-400",
  success: "text-emerald-600 dark:text-emerald-400",
  ok: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  paused: "text-amber-600 dark:text-amber-400",
  pending: "text-amber-600 dark:text-amber-400",
  failed: "text-rose-600 dark:text-rose-400",
  error: "text-rose-600 dark:text-rose-400",
};

type Accent = "emerald" | "indigo" | "violet" | "sky" | "amber";

// Per-accent icon chip styles for card headers (literal class strings — Tailwind
// can't see interpolated names).
const ACCENT_ICON: Record<Accent, string> = {
  emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  indigo: "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400",
  violet: "bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400",
  sky: "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400",
  amber: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
};

// Colour per export preset so the list reads at a glance instead of a grey wall.
const PRESET_STYLE: Record<string, string> = {
  shopify: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
  inventory: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/50",
  detailed: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/50",
  simple: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50",
};

function PresetTag({ preset }: { preset?: string | null }) {
  if (!preset) return null;
  const cls = PRESET_STYLE[preset.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border shrink-0", cls)}>
      {preset}
    </span>
  );
}

function Card({
  icon: Icon,
  title,
  count,
  accent = "indigo",
  children,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  accent?: Accent;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background rounded-2xl border border-border/60 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2.5">
        <div className={cn("w-5 h-5 rounded-md border flex items-center justify-center", ACCENT_ICON[accent])}>
          <Icon className="w-3 h-3" />
        </div>
        <span className="text-[12px] font-semibold text-foreground">{title}</span>
        {count != null && count > 0 && (
          <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      <div className="p-5 flex-1">{children}</div>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-muted-foreground">{children}</p>;
}

const EXPORTS_INITIAL = 8;

function ExportsCard({ detail }: { detail: PartnerDetail }) {
  const [expanded, setExpanded] = useState(false);
  // Hide soft-deleted / inactive configs (isActive === false); the portal
  // returns them but they're effectively gone.
  const active = detail.exportConfigs.filter((e) => e.isActive !== false);
  const inactiveCount = detail.exportConfigs.length - active.length;
  const shown = expanded ? active : active.slice(0, EXPORTS_INITIAL);

  return (
    <Card icon={Download} title="Exports" count={active.length} accent="indigo">
      {active.length === 0 && detail.recentDownloads.length === 0 ? (
        <EmptyLine>No active export configs or downloads.</EmptyLine>
      ) : (
        <div className="space-y-3">
          {active.length > 0 && (
            <ul className="space-y-1.5">
              {shown.map((e) => (
                <li key={e._id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="text-foreground truncate">{e.name}</span>
                  <PresetTag preset={e.preset} />
                </li>
              ))}
            </ul>
          )}

          {(active.length > EXPORTS_INITIAL || inactiveCount > 0) && (
            <div className="flex items-center gap-2 pt-0.5">
              {active.length > EXPORTS_INITIAL && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus-visible:outline-none focus-visible:underline"
                >
                  {expanded ? "Show less" : `Show all ${active.length}`}
                </button>
              )}
              {inactiveCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {inactiveCount} inactive hidden
                </span>
              )}
            </div>
          )}

          {detail.recentDownloads.length > 0 && (
            <div className="pt-2 border-t border-border/40">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
                Recent downloads
              </p>
              <ul className="space-y-1">
                {detail.recentDownloads.slice(0, 6).map((d) => (
                  <li key={d._id} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="uppercase font-medium text-foreground">{d.metadata?.format || "file"}</span>
                    <span>{relativeTime(d.timestamp)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── main ──────────────────────────────────────────────────────────────────--

export function PartnerDetailClient({
  sub,
  detail,
  displayName,
  email,
  picture,
  adminLabel,
  adminPictureUrl,
}: {
  sub: string;
  detail: PartnerDetail;
  displayName: string;
  email: string;
  picture?: string;
  adminLabel: string;
  adminPictureUrl?: string;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      {/* Hero */}
      <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-5 md:pb-6 border-b border-border/50 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/40 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex items-center gap-4 min-w-0">
          <Avatar label={displayName} picture={picture} className="w-12 h-12 text-sm" />
          <div className="min-w-0">
            <h1 className="font-display text-xl md:text-2xl font-medium text-foreground tracking-tight leading-none truncate">
              {displayName}
            </h1>
            {email && email !== displayName && (
              <p className="text-[13px] text-muted-foreground mt-1 truncate">{email}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
              {detail.lastActiveAt ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Active {relativeTime(detail.lastActiveAt)}
                  </span>
                  {detail.loginCount > 0 && (
                    <span className="tabular-nums">
                      {detail.loginCount} sign-in{detail.loginCount === 1 ? "" : "s"}
                    </span>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> No portal activity tracked yet
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-6 max-w-6xl">
        {/* Insight cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card icon={Store} title="Shopify" count={detail.connections.length} accent="emerald">
            {detail.connections.length === 0 ? (
              <EmptyLine>No connected stores.</EmptyLine>
            ) : (
              <div className="space-y-3">
                {detail.connections.map((c) => (
                  <div key={c._id} className="text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground truncate">{c.shopName || c.shopDomain}</span>
                      <span className={cn("text-[11px] font-medium capitalize", STATUS_TINT[c.status] ?? "text-muted-foreground")}>
                        {c.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{c.shopDomain}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(["syncStock", "syncPrices", "syncDescriptions", "syncImages", "syncNewProducts"] as const)
                        .filter((k) => c.config?.[k])
                        .map((k) => (
                          <span key={k} className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50">
                            {k.replace("sync", "")}
                          </span>
                        ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Last sync {relativeTime(c.lastSyncAt)}
                      {c.lastSyncStatus ? ` · ${c.lastSyncStatus}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <ExportsCard detail={detail} />

          <Card icon={Rss} title="Own Sources" count={detail.feeds.length} accent="violet">
            {detail.feeds.length === 0 ? (
              <EmptyLine>No external feeds.</EmptyLine>
            ) : (
              <div className="space-y-3">
                {detail.feeds.map((f) => (
                  <div key={f._id} className="text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground truncate">{f.brand}</span>
                      <span className={cn("text-[11px] font-medium capitalize", STATUS_TINT[f.status] ?? "text-muted-foreground")}>
                        {f.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Last import {relativeTime(f.health?.lastImportAt)}
                      {f.health?.lastResult ? ` · ${f.health.lastResult}` : ""}
                    </div>
                    {f.health?.counts?.products != null && (
                      <div className="text-[10px] text-muted-foreground">
                        {f.health.counts.products} products · {f.health.counts.variants ?? 0} variants
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <MostInteractedCard most={detail.mostInteractedWith} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ActivityTimeline sub={sub} />
          <NotesCard sub={sub} adminLabel={adminLabel} adminPictureUrl={adminPictureUrl} />
        </div>
      </div>
    </div>
  );
}

// ── most interacted ──────────────────────────────────────────────────────--

function MostInteractedCard({ most }: { most: PartnerDetail["mostInteractedWith"] }) {
  const events = most?.events ?? [];
  const max = Math.max(1, ...events.map((e) => e.count));
  return (
    <Card icon={BarChart3} title="Most interacted with" accent="sky">
      {events.length === 0 ? (
        <EmptyLine>No activity recorded yet.</EmptyLine>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5">
          <div className="space-y-2">
            {events.slice(0, 8).map((e) => (
              <div key={e.eventType} className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground w-32 shrink-0 truncate">
                  {EVENT_LABELS[e.eventType] ?? e.eventType}
                </span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${(e.count / max) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] tabular-nums text-foreground w-6 text-right">{e.count}</span>
              </div>
            ))}
          </div>
          {most.topExports.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
                Top exports (30d)
              </p>
              <ul className="space-y-1.5">
                {most.topExports.map((t) => (
                  <li key={t.exportConfigId} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-foreground truncate">{t.name || t.exportConfigId}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">{t.downloads}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── activity timeline ──────────────────────────────────────────────────────

function ActivityTimeline({ sub }: { sub: string }) {
  const [events, setEvents] = useState<PartnerActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/partners/${encodeURIComponent(sub)}/activity?limit=100`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) setError(data?.error ?? "Couldn't load activity");
        else setEvents(data.events ?? []);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load activity"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sub]);

  return (
    <Card icon={ActivityIcon} title="Activity" count={events.length} accent="amber">
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-center">
              <div className="w-2 h-2 rounded-full skeleton" />
              <div className="h-3 w-40 rounded skeleton" style={{ animationDelay: `${i * 60}ms` }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-[12px] text-destructive">{error}</p>
      ) : events.length === 0 ? (
        <EmptyLine>No activity recorded yet.</EmptyLine>
      ) : (
        <ol className="space-y-3 max-h-[420px] overflow-auto pr-1">
          {events.map((e) => (
            <li key={e._id} className="flex gap-3 text-[12px]">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-foreground font-medium">
                    {EVENT_LABELS[e.eventType] ?? e.eventType}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0" title={fmtDate(e.timestamp)}>
                    {relativeTime(e.timestamp)}
                  </span>
                </div>
                {(e.metadata?.format || e.metadata?.shopDomain || e.metadata?.brand) ? (
                  <p className="text-[11px] text-muted-foreground truncate">
                    {String(e.metadata.format || e.metadata.shopDomain || e.metadata.brand)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ── notes ───────────────────────────────────────────────────────────────---

type Note = {
  _id: string;
  text: string;
  authorName?: string;
  authorEmail?: string | null;
  createdAt: string;
};

function NotesCard({
  sub,
  adminLabel,
  adminPictureUrl,
}: {
  sub: string;
  adminLabel: string;
  adminPictureUrl?: string;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/partners/${encodeURIComponent(sub)}/notes`)
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) setNotes(data.notes ?? []);
      })
      .finally(() => setLoading(false));
  }, [sub]);

  useEffect(() => {
    load();
  }, [load]);

  async function post() {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    setError(null);
    const res = await fetch(`/api/partners/${encodeURIComponent(sub)}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setPosting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Couldn't post note");
      return;
    }
    const data = (await res.json()) as { note: Note };
    setNotes((prev) => [data.note, ...prev]);
    setDraft("");
  }

  async function remove(id: string) {
    const prev = notes;
    setNotes((n) => n.filter((x) => x._id !== id));
    const res = await fetch(`/api/partners/${encodeURIComponent(sub)}/notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) setNotes(prev); // rollback
  }

  return (
    <div className="bg-background rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md bg-background border border-border/60 flex items-center justify-center">
          <MessageSquare className="w-3 h-3 text-muted-foreground" />
        </div>
        <span className="text-[12px] font-semibold text-foreground">Internal notes</span>
        {notes.length > 0 && (
          <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {notes.length}
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        <div className="flex gap-3">
          <Avatar label={adminLabel} picture={adminPictureUrl} className="w-7 h-7 text-[10px]" />
          <div className="flex-1 min-w-0 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  post();
                }
              }}
              placeholder="Add a note about this partner. Visible only to admins."
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[13px] shadow-xs outline-none resize-y focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">
                Posting as <strong className="text-foreground">{adminLabel}</strong> · ⌘/Ctrl+Enter
              </p>
              {error && <p className="text-[11px] text-destructive">{error}</p>}
              <Button size="sm" className="h-7 text-xs px-3 gap-1.5" onClick={post} disabled={!draft.trim() || posting}>
                {posting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Post note
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 pt-2 border-t border-border/40">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-3 w-full rounded skeleton" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <p className="text-center text-[12px] text-muted-foreground py-6">
            No notes yet. Use this space for account context, follow-ups, and conversation summaries.
          </p>
        ) : (
          <div className="space-y-3 pt-2 border-t border-border/40">
            {notes.map((n) => (
              <div key={n._id} className="flex gap-3 group">
                <Avatar label={n.authorName || "Admin"} className="w-7 h-7 text-[10px]" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-foreground">{n.authorName || "Admin"}</span>
                    <span className="text-[10px] text-muted-foreground" title={fmtDate(n.createdAt)}>
                      {relativeTime(n.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(n._id)}
                      aria-label="Delete note"
                      className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity focus-visible:opacity-100 focus-visible:outline-none"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[13px] text-foreground whitespace-pre-wrap break-words leading-relaxed mt-0.5">
                    {n.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
