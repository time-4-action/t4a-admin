"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Search,
  Handshake,
  ChevronRight,
  Store,
  Download,
  Rss,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonAvatar, SkeletonLine, stagger } from "@/components/ui/skeleton";
import type { PartnerListItem } from "@/types/partner";

function initials(name: string, email: string): string {
  const base = (name || email || "?").trim();
  return base
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function relativeTime(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

const SYNC_DOT: Record<string, string> = {
  success: "bg-emerald-500",
  partial: "bg-amber-400",
  failed: "bg-rose-500",
};

function Avatar({ p }: { p: PartnerListItem }) {
  if (p.picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={p.picture}
        alt=""
        className="w-7 h-7 rounded-full object-cover ring-1 ring-border shrink-0"
      />
    );
  }
  return (
    <span className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-muted text-muted-foreground text-[10px] font-semibold ring-1 ring-border">
      {initials(p.name, p.email)}
    </span>
  );
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalWarning, setPortalWarning] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/partners")
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(data?.error ?? "Couldn't load partners");
          return;
        }
        setPartners(data.partners ?? []);
        setPortalWarning(data.portalReachable === false);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load partners");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q),
    );
  }, [partners, search]);

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">
              Partners
            </h1>
            {loading ? (
              <Skeleton className="h-5 w-8 rounded-full shrink-0" />
            ) : (
              <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0 tabular-nums">
                {filtered.length}
              </span>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search partners…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search partners"
              className="pl-8 h-8 w-40 md:w-56 text-xs bg-background"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 p-4 md:p-8 flex flex-col">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive"
          >
            {error}
          </div>
        )}
        {portalWarning && !error && (
          <div className="mb-4 rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-[12px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Partner portal unreachable — showing identities only, activity unavailable.
          </div>
        )}

        <div className="flex-1 min-h-0 bg-surface border border-border rounded-xl overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-surface">
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">Partner</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Shopify</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Exports</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Feeds</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Last active</TableHead>
                <TableHead className="h-9 w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="border-b border-border/60">
                    <TableCell className="pl-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <SkeletonAvatar size="w-7 h-7" delay={stagger(i)} />
                        <div className="min-w-0">
                          {/* leading-tight: 13px → 16.25px, 11px → 13.75px */}
                          <SkeletonLine lh="h-4" w="w-28" delay={stagger(i, 80, 20)} />
                          <SkeletonLine lh="h-[14px]" h="h-2.5" w="w-36" delay={stagger(i, 80, 40)} />
                        </div>
                      </div>
                    </TableCell>
                    {[
                      { icon: Store, w: "w-10" },
                      { icon: Download, w: "w-20" },
                      { icon: Rss, w: "w-10" },
                    ].map(({ icon: Icon, w }, j) => (
                      <TableCell key={j}>
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                          <SkeletonLine lh="h-[18px]" w={w} delay={stagger(i, 80, 50 + j * 10)} />
                        </div>
                      </TableCell>
                    ))}
                    <TableCell><SkeletonLine lh="h-[18px]" w="w-16" delay={stagger(i, 80, 80)} /></TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end">
                        <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

              {!loading &&
                filtered.map((p) => {
                  const href = `/partners/${encodeURIComponent(p.sub)}`;
                  return (
                    <TableRow
                      key={p.sub}
                      className="border-b border-border/60 hover:bg-muted/30 transition-colors group"
                    >
                      <TableCell className="pl-5 py-3">
                        <Link href={href} className="flex items-center gap-2.5 min-w-0 focus-visible:outline-none">
                          <Avatar p={p} />
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-foreground group-hover:underline truncate leading-tight">
                              {p.name || "—"}
                            </div>
                            <span className="text-[11px] text-muted-foreground block truncate leading-tight">
                              {p.email}
                            </span>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-[12px] text-foreground">
                          <Store className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                          {p.shopifyConnections.total === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              <span className="tabular-nums">
                                {p.shopifyConnections.active}/{p.shopifyConnections.total}
                              </span>
                              {p.shopifyConnections.lastSyncStatus && (
                                <span
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    SYNC_DOT[p.shopifyConnections.lastSyncStatus] ?? "bg-muted-foreground/40",
                                  )}
                                  title={`Last sync: ${p.shopifyConnections.lastSyncStatus}`}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-[12px] text-foreground">
                          <Download className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                          {p.exports.configs === 0 && p.exports.downloads30d === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="tabular-nums">
                              {p.exports.configs}
                              <span className="text-muted-foreground"> · {p.exports.downloads30d} dl/30d</span>
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-[12px] text-foreground">
                          <Rss className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                          {p.feeds.total === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="tabular-nums">
                              {p.feeds.active}/{p.feeds.total}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-[12px] text-muted-foreground whitespace-nowrap">
                        {relativeTime(p.lastActiveAt)}
                      </TableCell>
                      <TableCell className="pr-4">
                        <Link
                          href={href}
                          aria-label={`Open ${p.name || p.email}`}
                          className="flex items-center justify-end text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none"
                          title="Open"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}

              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-[13px] text-muted-foreground py-16">
                    <Handshake className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" aria-hidden />
                    {search.trim() ? "No partners match your search." : "No partners found."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
