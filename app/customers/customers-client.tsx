"use client";

// Customers: the whole Metakocka customer directory, campaign-independent,
// with each customer's preorder activity across every campaign (unlocked / submitted)
// and a one-click "View portal" as them. Loads more as you scroll.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Search, X, Users, Building2, User, AlertTriangle, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonLine, stagger } from "@/components/ui/skeleton";
import { Flag } from "@/components/flag";
import { ViewAsCustomerButton } from "@/components/view-as-customer-button";
import { SubmissionStageBadge } from "@/app/preorder/preorder-badges";
import { CustomerKindBadge } from "@/app/preorder/[campaignId]/markets/tables";
import type { CustomerKind, MkCustomerView } from "@/lib/mk-customers";
import type { CustomerActivity } from "@/lib/preorder-customers";
import type { PortalAgentView } from "@/types/portal-agent";
import { cn } from "@/lib/utils";

const PAGE = 100;

type SyncInfo = { running: boolean; startedAt: string | null; finishedAt: string | null; ok: boolean | null; count: number; error: string | null };

function fmtWhen(v: string | null): string {
  if (!v) return "never";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function CustomersClient() {
  const [rows, setRows] = useState<MkCustomerView[]>([]);
  const [activity, setActivity] = useState<Record<string, CustomerActivity>>({});
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<CustomerKind | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [directoryTotal, setDirectoryTotal] = useState<number | null>(null);
  const [agents, setAgents] = useState<PortalAgentView[]>([]);
  const reqSeq = useRef(0);

  // Portal agents: badge agents ("Agent · n clients") and their clients ("Client of …").
  useEffect(() => {
    fetch("/api/admin/portal/agents", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((j: { agents?: PortalAgentView[] }) => setAgents(j.agents ?? []))
      .catch(() => setAgents([]));
  }, []);
  const agentById = useMemo(() => new Map(agents.map((a) => [a.partnerMkId, a])), [agents]);
  const agentsOfClient = useMemo(() => {
    const m = new Map<string, PortalAgentView[]>();
    for (const a of agents) for (const c of a.clients) m.set(c.partnerMkId, [...(m.get(c.partnerMkId) ?? []), a]);
    return m;
  }, [agents]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    async (page: number) => {
      const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE), activity: "1" });
      if (q.trim()) sp.set("q", q.trim());
      if (kind !== "all") sp.set("kind", kind);
      const r = await fetch(`/api/admin/preorder/customers?${sp}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Could not load customers (${r.status})`);
      return (await r.json()) as { items: MkCustomerView[]; total: number; activity?: Record<string, CustomerActivity> };
    },
    [q, kind],
  );

  const loadSync = useCallback(async () => {
    const r = await fetch("/api/admin/preorder/customers/sync", { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as { sync: SyncInfo; totalCustomers: number };
    setSync(j.sync);
    setDirectoryTotal(j.totalCustomers);
  }, []);

  // First page whenever search / kind changes (debounced by the input handler).
  useEffect(() => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    fetchPage(1)
      .then((res) => {
        if (seq !== reqSeq.current) return;
        setRows(res.items);
        setActivity(res.activity ?? {});
        setTotal(res.total);
      })
      .catch((e: Error) => seq === reqSeq.current && setError(e.message))
      .finally(() => seq === reqSeq.current && setLoading(false));
  }, [fetchPage]);

  useEffect(() => {
    void loadSync();
  }, [loadSync]);

  // Poll while the directory sync runs, then reload the list.
  useEffect(() => {
    if (!sync?.running) return;
    const t = setInterval(async () => {
      await loadSync();
    }, 3000);
    return () => clearInterval(t);
  }, [sync?.running, loadSync]);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && sync && !sync.running) {
      reqSeq.current += 1;
      const seq = reqSeq.current;
      fetchPage(1).then((res) => {
        if (seq !== reqSeq.current) return;
        setRows(res.items);
        setActivity(res.activity ?? {});
        setTotal(res.total);
      });
    }
    wasRunning.current = !!sync?.running;
  }, [sync, fetchPage]);

  const hasMore = rows.length < total;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      const seq = reqSeq.current;
      const next = Math.floor(rows.length / PAGE) + 1;
      setLoading(true);
      fetchPage(next)
        .then((res) => {
          if (seq !== reqSeq.current) return;
          setRows((prev) => {
            const seen = new Set(prev.map((c) => c.partnerMkId));
            return [...prev, ...res.items.filter((c) => !seen.has(c.partnerMkId))];
          });
          setActivity((prev) => ({ ...prev, ...(res.activity ?? {}) }));
          setTotal(res.total);
        })
        .finally(() => seq === reqSeq.current && setLoading(false));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, rows.length, fetchPage]);

  async function startSync() {
    const r = await fetch("/api/admin/preorder/customers/sync", { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { sync?: SyncInfo };
    if (j.sync) setSync(j.sync);
  }

  const grid = "grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_120px_minmax(0,1fr)_minmax(0,1.6fr)_230px]";
  const gridMd = "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_120px_minmax(0,1fr)_minmax(0,1.6fr)_230px]";

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">Customers</h1>
            <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
              {directoryTotal != null ? `${directoryTotal} in the Metakocka directory` : ""}
              {sync ? ` · synced ${fmtWhen(sync.finishedAt)}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sync?.error && (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400"><AlertTriangle className="w-3.5 h-3.5" /> last sync failed</span>
            )}
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={startSync} disabled={!!sync?.running} title="Pull every partner from Metakocka into the directory">
              <RefreshCw className={cn("w-3.5 h-3.5", sync?.running && "animate-spin")} />
              {sync?.running ? `Syncing… ${sync.count}` : "Sync from Metakocka"}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="rounded-2xl border border-border bg-background overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, city, VAT id, Metakocka code…" className="h-8 pl-8 text-[12px]" />
              {q && (
                <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center rounded-lg bg-muted p-0.5 gap-0.5">
              {(
                [
                  ["all", "All", Users],
                  ["business", "Companies", Building2],
                  ["person", "Individuals", User],
                ] as [CustomerKind | "all", string, React.ElementType][]
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors",
                    kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="w-3 h-3" /> {label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">{loading && rows.length === 0 ? "…" : `${total} customer${total === 1 ? "" : "s"}`}</span>
          </div>

          {error && (
            <div className="px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300 border-b border-border/60 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </div>
          )}

          <div className={cn("hidden md:grid gap-3 px-4 py-2 border-b border-border/60 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground", grid)}>
            <span>Customer</span>
            <span>Contact</span>
            <span>Type</span>
            <span>Country</span>
            <span>Preorders</span>
            <span className="text-right">View as</span>
          </div>

          <div className="divide-y divide-border/50">
            {loading && rows.length === 0 ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className={cn("grid gap-3 items-center px-4 py-2.5", grid)}>
                  <SkeletonLine lh="h-[18px]" w="w-44" delay={stagger(i, 50)} />
                  <SkeletonLine lh="h-[18px]" w="w-48" delay={stagger(i, 50, 20)} />
                  <SkeletonLine lh="h-[18px]" w="w-20" delay={stagger(i, 50, 40)} />
                  <SkeletonLine lh="h-[18px]" w="w-28" delay={stagger(i, 50, 60)} />
                  <SkeletonLine lh="h-[18px]" w="w-40" delay={stagger(i, 50, 80)} />
                  <SkeletonLine lh="h-[18px]" w="w-24 ml-auto" delay={stagger(i, 50, 100)} />
                </div>
              ))
            ) : rows.length === 0 ? (
              <div className="px-4 py-14 text-center text-[12px] text-muted-foreground">
                {q || kind !== "all" ? "No customer matches." : directoryTotal === 0 ? "The directory is empty — run a sync from Metakocka." : "No customers."}
              </div>
            ) : (
              rows.map((c) => {
                const a = activity[c.partnerMkId];
                const asAgent = agentById.get(c.partnerMkId);
                const servedBy = agentsOfClient.get(c.partnerMkId) ?? [];
                return (
                  <div key={c.partnerMkId} className={cn("grid grid-cols-1 md:gap-3 gap-y-1 items-center px-4 py-2 hover:bg-muted/20", gridMd)}>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{[c.city, c.countCode].filter(Boolean).join(" · ") || c.partnerMkId}</div>
                      {(asAgent || servedBy.length > 0) && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {asAgent && (
                            <Link
                              href={`/customers/agents/${encodeURIComponent(c.partnerMkId)}`}
                              className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 px-1.5 py-px text-[10px] font-medium hover:bg-teal-500/20"
                              title="Edit this agent's clients"
                            >
                              <Briefcase className="w-2.5 h-2.5" /> Agent · {asAgent.clients.length} client{asAgent.clients.length === 1 ? "" : "s"}
                            </Link>
                          )}
                          {servedBy.length > 0 && (
                            <Link
                              href={`/customers/agents/${encodeURIComponent(servedBy[0].partnerMkId)}`}
                              className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-1.5 py-px text-[10px] hover:text-foreground max-w-full"
                              title={servedBy.map((s) => s.partnerName).join(", ")}
                            >
                              <span className="truncate">Client of {servedBy[0].partnerName}{servedBy.length > 1 ? ` +${servedBy.length - 1}` : ""}</span>
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 text-[12px] text-muted-foreground">
                      <div className="truncate">{c.email ?? "—"}</div>
                      {c.phone && <div className="truncate text-[11px]">{c.phone}</div>}
                    </div>
                    <div><CustomerKindBadge kind={c.kind} taxId={c.taxId} compact /></div>
                    <div className="min-w-0 text-[12px] text-foreground inline-flex items-center gap-1.5">
                      {c.countryIso ? <><Flag iso={c.countryIso} /> <span className="truncate">{c.countryName}</span></> : <span className="text-amber-600 dark:text-amber-400">unknown</span>}
                    </div>
                    <div className="min-w-0 flex flex-wrap items-center gap-1">
                      {a && a.campaigns.length > 0 ? (
                        a.campaigns.map((cp) => (
                          <Link
                            key={cp.id}
                            href={`/preorder/${cp.id}/markets?customer=${encodeURIComponent(c.partnerMkId)}`}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-px text-[11px] hover:border-foreground/30 max-w-full"
                            title={`${cp.title}${cp.season ? ` · ${cp.season}` : ""} — open this customer in the campaign`}
                          >
                            <span className="truncate max-w-[9rem]">{cp.season || cp.title}</span>
                            {cp.stage ? <SubmissionStageBadge stage={cp.stage} dot={false} /> : <span className="text-[10px] text-muted-foreground">unlocked</span>}
                          </Link>
                        ))
                      ) : (
                        <span className="text-[11px] text-muted-foreground/60">no preorders</span>
                      )}
                    </div>
                    <div className="flex md:justify-end items-center gap-2">
                      {!asAgent && (
                        <Link
                          href={`/customers/agents/new?partner=${encodeURIComponent(c.partnerMkId)}`}
                          className="text-[11px] text-muted-foreground hover:text-foreground hover:underline whitespace-nowrap"
                          title="Let this customer see and order for other customers"
                        >
                          Make agent
                        </Link>
                      )}
                      <ViewAsCustomerButton partnerMkId={c.partnerMkId} />
                    </div>
                  </div>
                );
              })
            )}
            {rows.length > 0 && (
              <div ref={sentinelRef} className="px-4 py-3 text-center text-[11px] text-muted-foreground">
                {loading ? (
                  <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading more…</span>
                ) : hasMore ? (
                  `Showing ${rows.length} of ${total} — scroll for more`
                ) : (
                  `All ${total} shown`
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
