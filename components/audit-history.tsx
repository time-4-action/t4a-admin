"use client";
import { useEffect, useState } from "react";
import { History, ArrowRight } from "lucide-react";
import type {
  AuditEntityType,
  AuditEntry,
  WarrantyAdmin,
} from "@/types/warranty";
import { AssigneeAvatar, pictureForPerson } from "@/app/warranty/assignee-picker";
import { Skeleton, SkeletonAvatar, SkeletonLine, stagger } from "@/components/ui/skeleton";

// Entries are fetched client-side (the list is null until mount), so using the
// local clock here can't cause a hydration mismatch.
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
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

function fmtAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/**
 * Change-history timeline for a single entity. Self-fetching card; bump
 * `refreshKey` after a save to reload.
 */
export function AuditHistory({
  entityType,
  entityId,
  refreshKey = 0,
  title = "Change history",
  admins = [],
}: {
  entityType: AuditEntityType;
  entityId: string;
  refreshKey?: number;
  title?: string;
  admins?: WarrantyAdmin[];
}) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const qs = new URLSearchParams({ entityType, entityId });
    fetch(`/api/warranty/audit?${qs.toString()}`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(data?.error ?? "Failed to load history");
          setEntries([]);
          return;
        }
        setEntries((data.entries ?? []) as AuditEntry[]);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load history");
        setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, refreshKey]);

  return (
    <div className="bg-background rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md bg-background border border-border/60 flex items-center justify-center">
          <History className="w-3 h-3 text-muted-foreground" />
        </div>
        <span className="text-[12px] font-semibold text-foreground">{title}</span>
        {entries && entries.length > 0 && (
          <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {entries.length}
          </span>
        )}
      </div>

      <div className="p-5">
        {entries == null ? (
          <AuditHistoryEntriesSkeleton />
        ) : error ? (
          <p className="text-[12px] text-destructive">{error}</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-[12px] text-muted-foreground py-4">
            No changes recorded yet. Every saved change will appear here with who
            made it and why.
          </p>
        ) : (
          <div className="space-y-4">
            {entries.map((e) => (
              <div key={e.id} className="flex gap-3">
                <AssigneeAvatar
                  name={e.actorName}
                  picture={pictureForPerson(admins, e.actorName, e.actorEmail)}
                  className="w-7 h-7 text-[10px]"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-foreground">
                      {e.actorName || "Admin"}
                    </span>
                    <span
                      className="text-[10px] text-muted-foreground"
                      title={fmtAbsolute(e.createdAt)}
                    >
                      {fmtWhen(e.createdAt)}
                    </span>
                  </div>

                  {e.changes.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {e.changes.map((c) => (
                        <div
                          key={c.field}
                          className="flex items-center gap-1.5 text-[11px] flex-wrap"
                        >
                          <span className="font-medium text-muted-foreground">
                            {c.label}
                          </span>
                          <span className="text-muted-foreground line-through">
                            {c.from || "—"}
                          </span>
                          <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                          <span className="text-foreground font-medium">
                            {c.to || "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {e.message && (
                    <p className="text-[12px] text-foreground whitespace-pre-wrap break-words leading-relaxed mt-1">
                      {e.message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Twin of the loaded entry list: avatar + "name · time" line + one message
 * line per entry. Same `space-y-4` / `gap-3` as the real list.
 */
export function AuditHistoryEntriesSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <SkeletonAvatar size="w-7 h-7" delay={stagger(i)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <SkeletonLine lh="h-[18px]" w="w-24" delay={stagger(i)} />
              <SkeletonLine lh="h-[15px]" w="w-12" h="h-2.5" delay={stagger(i, 80, 40)} />
            </div>
            <SkeletonLine lh="h-[18px]" w="w-56" className="mt-1" delay={stagger(i, 80, 40)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The whole history card (header + entries) for route-level `loading.tsx`. */
export function AuditHistoryCardSkeleton({ title = "Change history", rows = 1 }: { title?: string; rows?: number }) {
  return (
    <div className="bg-background rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md bg-background border border-border/60 flex items-center justify-center">
          <History className="w-3 h-3 text-muted-foreground" />
        </div>
        <span className="text-[12px] font-semibold text-foreground">{title}</span>
        <Skeleton className="h-[18px] w-6 rounded-full" />
      </div>
      <div className="p-5">
        <AuditHistoryEntriesSkeleton rows={rows} />
      </div>
    </div>
  );
}
