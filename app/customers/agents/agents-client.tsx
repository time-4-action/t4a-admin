"use client";

// Customers → Agents: customers who also see (and order for) assigned client
// customers in the portal. List + one modal for create / edit.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Briefcase, Pencil, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonLine, stagger } from "@/components/ui/skeleton";
import { ViewAsCustomerButton } from "@/components/view-as-customer-button";
import type { PickedCustomer } from "@/components/customer-directory-picker";
import type { PortalAgentView } from "@/types/portal-agent";
import { cn } from "@/lib/utils";
import { AgentModal } from "./agent-modal";

const MAX_CHIPS = 6;

function fmtWhen(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

export function AgentsClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [agents, setAgents] = useState<PortalAgentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PortalAgentView | null>(null);
  const [seed, setSeed] = useState<PickedCustomer | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/portal/agents", { cache: "no-store" });
      if (!r.ok) throw new Error(`Could not load agents (${r.status})`);
      const j = (await r.json()) as { agents: PortalAgentView[] };
      setAgents(j.agents);
      return j.agents;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load agents");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Deep links from the Customers list: ?agent=<id> edits, ?new=<id>&name=… creates.
  useEffect(() => {
    void load().then((list) => {
      const edit = params.get("agent");
      const fresh = params.get("new");
      if (edit) {
        const a = list.find((x) => x.partnerMkId === edit);
        if (a) {
          setEditing(a);
          setSeed(null);
          setOpen(true);
        }
      } else if (fresh) {
        const a = list.find((x) => x.partnerMkId === fresh);
        setEditing(a ?? null);
        setSeed(a ? null : { partnerMkId: fresh, partnerName: params.get("name") || fresh });
        setOpen(true);
      }
      if (edit || fresh) router.replace("/customers/agents");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const agentIds = useMemo(() => new Set(agents.map((a) => a.partnerMkId)), [agents]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return agents;
    return agents.filter((a) => a.partnerName.toLowerCase().includes(needle) || a.clients.some((c) => c.partnerName.toLowerCase().includes(needle)));
  }, [agents, q]);
  const clientTotal = agents.reduce((n, a) => n + a.clients.length, 0);

  const grid = "md:grid-cols-[minmax(0,1.2fr)_minmax(0,2.4fr)_minmax(0,0.9fr)_220px]";

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">Agents</h1>
            <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
              {loading ? "" : `${agents.length} agent${agents.length === 1 ? "" : "s"} · ${clientTotal} client assignment${clientTotal === 1 ? "" : "s"}`}
            </span>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              setEditing(null);
              setSeed(null);
              setOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" /> New agent
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4">
        <p className="text-[12px] text-muted-foreground max-w-3xl">
          An agent is a customer who logs in to the portal with their own email and, besides their own invoices, orders
          and preorders, sees those of the clients assigned to them. In the portal they switch between all accounts and
          one client, and can place preorders for a client once the campaign is unlocked for that client.
        </p>

        <div className="rounded-2xl border border-border bg-background overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents or clients…" className="h-8 pl-8 text-[12px]" />
              {q && (
                <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex-1" />
            <span className="text-[11px] text-muted-foreground tabular-nums">{loading ? "…" : `${rows.length} shown`}</span>
          </div>

          {error && (
            <div className="px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300 border-b border-border/60 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </div>
          )}

          <div className={cn("hidden md:grid gap-3 px-4 py-2 border-b border-border/60 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground", grid)}>
            <span>Agent</span>
            <span>Clients</span>
            <span>Updated</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="divide-y divide-border/50">
            {loading && agents.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={cn("grid grid-cols-1 gap-3 items-center px-4 py-3", grid)}>
                  <SkeletonLine lh="h-[18px]" w="w-40" delay={stagger(i, 60)} />
                  <SkeletonLine lh="h-[18px]" w="w-72" delay={stagger(i, 60, 20)} />
                  <SkeletonLine lh="h-[18px]" w="w-24" delay={stagger(i, 60, 40)} />
                  <SkeletonLine lh="h-[18px]" w="w-32 ml-auto" delay={stagger(i, 60, 60)} />
                </div>
              ))
            ) : rows.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <Briefcase className="w-6 h-6 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-[13px] text-muted-foreground">{q ? "No agent matches." : "No agents yet. Create one with “New agent”."}</p>
              </div>
            ) : (
              rows.map((a) => {
                const extra = a.clients.length - MAX_CHIPS;
                return (
                  <div key={a.partnerMkId} className={cn("grid grid-cols-1 gap-y-2 md:gap-3 items-center px-4 py-3 hover:bg-muted/20", grid)}>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground truncate">{a.partnerName}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {a.clients.length} client{a.clients.length === 1 ? "" : "s"}
                        {a.note ? ` · ${a.note}` : ""}
                      </div>
                    </div>
                    <div className="min-w-0 flex flex-wrap gap-1">
                      {a.clients.length === 0 && <span className="text-[11px] text-muted-foreground/60">no clients yet</span>}
                      {a.clients.slice(0, MAX_CHIPS).map((c) => (
                        <span key={c.partnerMkId} className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-px text-[11px] max-w-[12rem]" title={c.partnerName}>
                          <span className="truncate">{c.partnerName}</span>
                        </span>
                      ))}
                      {extra > 0 && <span className="text-[11px] text-muted-foreground self-center">+{extra} more</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground min-w-0">
                      <div>{fmtWhen(a.updatedAt)}</div>
                      {a.updatedBy && <div className="truncate">{a.updatedBy}</div>}
                    </div>
                    <div className="flex md:justify-end items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => {
                          setEditing(a);
                          setSeed(null);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </Button>
                      <ViewAsCustomerButton partnerMkId={a.partnerMkId} to="/portal/invoices" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <AgentModal
        open={open}
        onOpenChange={setOpen}
        agent={editing}
        seed={seed}
        agentIds={agentIds}
        onSaved={(saved) =>
          setAgents((prev) => {
            const rest = prev.filter((x) => x.partnerMkId !== saved.partnerMkId);
            return [...rest, saved].sort((x, y) => x.partnerName.localeCompare(y.partnerName));
          })
        }
        onDeleted={(id) => setAgents((prev) => prev.filter((x) => x.partnerMkId !== id))}
      />
    </div>
  );
}
