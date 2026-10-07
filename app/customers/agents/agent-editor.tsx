"use client";

// The agent page (Customers → Agents → one agent, or "New agent"). Built for
// agents with 100+ clients: a searchable, filterable client table with
// multi-select, changes staged and reviewed in place (new rows marked, removed
// rows kept with Undo) until "Save changes", and an add panel that takes either
// a directory search (add several without closing anything) or a pasted list of
// customer codes / emails / names.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardPaste,
  Loader2,
  Mail,
  Plus,
  Search,
  Trash2,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Flag } from "@/components/flag";
import { HeaderFilter } from "@/components/ui/header-filter";
import { ViewAsCustomerButton } from "@/components/view-as-customer-button";
import { CustomerKindBadge } from "@/app/preorder/[campaignId]/markets/tables";
import type { MkCustomerView } from "@/lib/mk-customers";
import type { PortalAgentView } from "@/types/portal-agent";
import { cn } from "@/lib/utils";

type ClientEntry = { partnerMkId: string; partnerName: string; addedAt: string | null; addedBy: string | null };
type AgentRef = { partnerMkId: string; partnerName: string };
type Resolved =
  | { line: string; status: "matched"; customer: MkCustomerView; via: string }
  | { line: string; status: "ambiguous"; candidates: MkCustomerView[] }
  | { line: string; status: "unmatched" };

const PAGE = 100;

function fmtDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function AgentEditor({
  agent,
  seed,
  directory: initialDirectory,
  alsoWith,
  agentIds,
}: {
  // null = a new agent.
  agent: PortalAgentView | null;
  // New agent: the customer pre-picked from the Customers list.
  seed?: MkCustomerView | null;
  directory: Record<string, MkCustomerView>;
  // Other agents each client is already assigned to.
  alsoWith: Record<string, AgentRef[]>;
  // Every existing agent (a customer can be an agent once; agents as clients get a note).
  agentIds: string[];
}) {
  const router = useRouter();
  const isNew = !agent;
  const [directory, setDirectory] = useState(initialDirectory);
  const remember = useCallback((cs: MkCustomerView[]) => setDirectory((d) => ({ ...d, ...Object.fromEntries(cs.map((c) => [c.partnerMkId, c])) })), []);

  // The agent's own account (pickable only while new).
  const [self, setSelf] = useState<MkCustomerView | null>(agent ? (initialDirectory[agent.partnerMkId] ?? null) : (seed ?? null));
  const selfId = agent?.partnerMkId ?? self?.partnerMkId ?? null;
  const selfName = agent?.partnerName ?? self?.name ?? "";

  // Saved state vs staged changes.
  const [baseline, setBaseline] = useState<ClientEntry[]>(agent?.clients ?? []);
  const [added, setAdded] = useState<Map<string, ClientEntry>>(new Map());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [noteBaseline, setNoteBaseline] = useState(agent?.note ?? "");
  const [note, setNote] = useState(agent?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const baselineIds = useMemo(() => new Set(baseline.map((c) => c.partnerMkId)), [baseline]);
  const working = useMemo(
    () => [...baseline.filter((c) => !removed.has(c.partnerMkId)), ...added.values()],
    [baseline, removed, added],
  );
  const workingIds = useMemo(() => new Set(working.map((c) => c.partnerMkId)), [working]);
  const changeCount = added.size + removed.size + (note.trim() !== noteBaseline.trim() ? 1 : 0);
  const dirty = isNew ? !!self : changeCount > 0;
  const agentIdSet = useMemo(() => new Set(agentIds), [agentIds]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  function addClients(cs: MkCustomerView[]) {
    remember(cs);
    setRemoved((prev) => {
      const next = new Set(prev);
      for (const c of cs) next.delete(c.partnerMkId);
      return next;
    });
    setAdded((prev) => {
      const next = new Map(prev);
      for (const c of cs) {
        if (c.partnerMkId === selfId || baselineIds.has(c.partnerMkId)) continue;
        next.set(c.partnerMkId, { partnerMkId: c.partnerMkId, partnerName: c.name, addedAt: null, addedBy: null });
      }
      return next;
    });
  }

  function removeClients(ids: string[]) {
    setAdded((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    setRemoved((prev) => {
      const next = new Set(prev);
      for (const id of ids) if (baselineIds.has(id)) next.add(id);
      return next;
    });
  }

  function undoRemove(id: string) {
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function discard() {
    setAdded(new Map());
    setRemoved(new Set());
    setNote(noteBaseline);
    setError(null);
  }

  async function save() {
    if (!selfId) {
      setError("Choose the agent's own customer account first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const clients = working.map((c) => ({ partnerMkId: c.partnerMkId, partnerName: c.partnerName }));
      const r = isNew
        ? await fetch("/api/admin/portal/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partnerMkId: selfId, partnerName: selfName, clients, note }),
          })
        : await fetch(`/api/admin/portal/agents/${encodeURIComponent(selfId)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clients, note }),
          });
      const j = (await r.json().catch(() => ({}))) as { agent?: PortalAgentView; error?: string };
      if (!r.ok || !j.agent) throw new Error(j.error ?? `Save failed (${r.status})`);
      if (isNew) {
        router.replace(`/customers/agents/${encodeURIComponent(j.agent.partnerMkId)}`);
        router.refresh();
        return;
      }
      setBaseline(j.agent.clients);
      setAdded(new Map());
      setRemoved(new Set());
      setNoteBaseline(j.agent.note ?? "");
      setNote(j.agent.note ?? "");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const [confirmDelete, setConfirmDelete] = useState(false);
  async function removeAgent() {
    if (!agent) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/portal/agents/${encodeURIComponent(agent.partnerMkId)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Remove failed (${r.status})`);
      router.push("/customers/agents");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
      setSaving(false);
    }
  }

  const summary = [
    added.size ? `${added.size} to add` : null,
    removed.size ? `${removed.size} to remove` : null,
    note.trim() !== noteBaseline.trim() ? "note changed" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="h-14 flex items-center gap-3 px-4 md:px-8">
          <Link href="/customers/agents" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back to agents">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground truncate leading-tight">{selfName || "New agent"}</h1>
            <p className="text-[11px] text-muted-foreground truncate leading-tight">
              {isNew ? "New agent" : `Agent with ${working.length} client${working.length === 1 ? "" : "s"}`}
              {!isNew && summary ? <span className="text-amber-600 dark:text-amber-400">{`: unsaved, ${summary}`}</span> : null}
              {savedFlash && <span className="text-emerald-600 dark:text-emerald-400">: changes saved</span>}
            </p>
          </div>
          {agent && <ViewAsCustomerButton partnerMkId={agent.partnerMkId} to="/portal/invoices" className="hidden sm:inline-flex" />}
          {!isNew && dirty && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={discard} disabled={saving}>
              Discard
            </Button>
          )}
          <Button size="sm" className="h-8 text-xs gap-1.5 relative" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isNew ? "Create agent" : "Save changes"}
            {!isNew && dirty && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-500 ring-2 ring-background" aria-hidden />}
          </Button>
        </div>
      </header>

      {error && (
        <div className="px-4 md:px-8 py-2 text-[12px] text-rose-700 dark:text-rose-300 bg-rose-500/5 border-b border-rose-500/20 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 md:p-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] items-start">
          <ClientsTable
            working={working}
            baselineIds={baselineIds}
            removed={removed}
            removedRows={baseline.filter((c) => removed.has(c.partnerMkId))}
            directory={directory}
            alsoWith={alsoWith}
            selfId={selfId}
            agentIds={agentIdSet}
            onRemove={removeClients}
            onUndo={undoRemove}
          />

          <aside className="space-y-4 lg:sticky lg:top-4">
            <AgentAccountCard isNew={isNew} self={self} name={selfName} onPick={setSelf} agentIds={agentIdSet} clientIds={workingIds} />
            <AddClientsCard
              selfId={selfId}
              workingIds={workingIds}
              agentIds={agentIdSet}
              onAdd={addClients}
            />
            <section className="rounded-2xl border border-border bg-surface p-4 space-y-2">
              <h2 className="text-[13px] font-semibold text-foreground">Internal note</h2>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Only admins see this: region, agreement, who to contact"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] focus:border-ring focus:outline-none"
              />
            </section>
            <section className="rounded-2xl border border-border bg-surface p-4 text-[12px] text-muted-foreground space-y-1.5">
              <h2 className="text-[13px] font-semibold text-foreground">What the agent gets</h2>
              <p>
                In the portal the agent switches between all accounts and a single client. They see invoices, sales orders and
                credit notes of every client, and can fill preorders for a client once that preorder is unlocked for the client.
              </p>
              <p>Removing a client takes effect as soon as you save.</p>
            </section>
            {agent && (
              <section className="rounded-2xl border border-rose-500/25 p-4 space-y-2">
                <h2 className="text-[13px] font-semibold text-foreground">Remove agent</h2>
                <p className="text-[12px] text-muted-foreground">They keep their own account and lose access to all {baseline.length} clients.</p>
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="destructive" onClick={removeAgent} disabled={saving}>
                      Remove agent
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={saving}>
                    <Trash2 className="w-3.5 h-3.5" /> Remove agent…
                  </Button>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── the agent's own account ───────────────────────────────────────────────────

function AgentAccountCard({
  isNew,
  self,
  name,
  onPick,
  agentIds,
  clientIds,
}: {
  isNew: boolean;
  self: MkCustomerView | null;
  name: string;
  onPick: (c: MkCustomerView | null) => void;
  agentIds: Set<string>;
  clientIds: Set<string>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-foreground">Agent&rsquo;s own account</h2>
        {isNew && self && (
          <button type="button" onClick={() => onPick(null)} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">
            Change
          </button>
        )}
      </div>
      {self || !isNew ? (
        <div className="flex items-start gap-3">
          <span className="size-10 rounded-xl bg-foreground text-background flex items-center justify-center text-[13px] font-semibold shrink-0">
            {initials(self?.name ?? name)}
          </span>
          <div className="min-w-0 text-[12px] space-y-0.5">
            <p className="text-[13px] font-medium text-foreground truncate">{self?.name ?? name}</p>
            {self?.email && (
              <p className="flex items-center gap-1.5 text-muted-foreground truncate">
                <Mail className="w-3 h-3 shrink-0" /> <span className="truncate">{self.email}</span>
              </p>
            )}
            {self && (
              <p className="text-muted-foreground flex items-center gap-1.5">
                {self.countryIso && <Flag iso={self.countryIso} />}
                {[self.city, self.countCode].filter(Boolean).join(", ")}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground pt-1">They sign in to the portal with this customer&rsquo;s email.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] text-muted-foreground">Pick the customer the agent signs in as. Their own invoices and orders stay theirs.</p>
          <DirectorySearch
            placeholder="Search name, email, VAT id or code"
            autoFocus
            render={(c) => {
              const taken = agentIds.has(c.partnerMkId);
              return (
                <button
                  type="button"
                  disabled={taken}
                  onClick={() => onPick(c)}
                  className="text-[11px] font-medium text-teal-700 dark:text-teal-300 hover:underline disabled:text-muted-foreground disabled:no-underline shrink-0"
                >
                  {taken ? "Already an agent" : clientIds.has(c.partnerMkId) ? "Pick (is a client)" : "Pick"}
                </button>
              );
            }}
          />
        </div>
      )}
    </section>
  );
}

// ── adding clients ────────────────────────────────────────────────────────────

function AddClientsCard({
  selfId,
  workingIds,
  agentIds,
  onAdd,
}: {
  selfId: string | null;
  workingIds: Set<string>;
  agentIds: Set<string>;
  onAdd: (cs: MkCustomerView[]) => void;
}) {
  const [tab, setTab] = useState<"search" | "paste">("search");
  return (
    <section className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h2 className="text-[13px] font-semibold text-foreground">Add clients</h2>
        <div className="flex items-center rounded-lg bg-muted p-0.5 gap-0.5" role="tablist">
          {(
            [
              ["search", "Search", Search],
              ["paste", "Paste a list", ClipboardPaste],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 pt-3">
        {tab === "search" ? (
          <DirectorySearch
            placeholder="Search name, email, VAT id or code"
            bulk={(results) => {
              const fresh = results.filter((c) => !workingIds.has(c.partnerMkId) && c.partnerMkId !== selfId);
              return fresh.length > 1 ? (
                <button type="button" onClick={() => onAdd(fresh)} className="text-[11px] font-medium text-teal-700 dark:text-teal-300 hover:underline">
                  Add all {fresh.length} shown
                </button>
              ) : null;
            }}
            render={(c) => {
              if (c.partnerMkId === selfId) return <span className="text-[11px] text-muted-foreground shrink-0">The agent</span>;
              if (workingIds.has(c.partnerMkId))
                return (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Check className="w-3 h-3" /> Client
                  </span>
                );
              return (
                <button
                  type="button"
                  onClick={() => onAdd([c])}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium text-foreground hover:bg-muted shrink-0"
                  title={agentIds.has(c.partnerMkId) ? "This customer is an agent too" : undefined}
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              );
            }}
          />
        ) : (
          <PasteList selfId={selfId} workingIds={workingIds} onAdd={onAdd} />
        )}
      </div>
    </section>
  );
}

// Search the customer directory; the caller renders each result's action.
function DirectorySearch({
  placeholder,
  render,
  bulk,
  autoFocus,
}: {
  placeholder: string;
  render: (c: MkCustomerView) => React.ReactNode;
  bulk?: (results: MkCustomerView[]) => React.ReactNode;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MkCustomerView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/preorder/customers?q=${encodeURIComponent(query)}&pageSize=25`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          setResults((j.items ?? []) as MkCustomerView[]);
          setTotal(typeof j.total === "number" ? j.total : 0);
        })
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-9 pl-8 pr-8 text-[12px] bg-background" />
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          )
        )}
      </div>
      {q.trim().length >= 2 && !loading && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{total > results.length ? `First ${results.length} of ${total}. Refine the search to see more.` : `${results.length} found`}</span>
          {bulk?.(results)}
        </div>
      )}
      {results.length > 0 && (
        <ul className="max-h-[22rem] overflow-y-auto overscroll-contain -mx-1 divide-y divide-border/50">
          {results.map((c) => (
            <li key={c.partnerMkId} className="flex items-center gap-2.5 px-1 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium text-foreground truncate">{c.name}</span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  {[c.email, c.city, c.countCode].filter(Boolean).join(", ") || c.partnerMkId}
                </span>
              </span>
              {render(c)}
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !loading && results.length === 0 && <p className="text-[12px] text-muted-foreground">No customer matches &ldquo;{q.trim()}&rdquo;.</p>}
      {q.trim().length < 2 && <p className="text-[11px] text-muted-foreground">Type at least 2 characters.</p>}
    </div>
  );
}

// Paste customer codes / emails / names, review what matched, add in one go.
function PasteList({ selfId, workingIds, onAdd }: { selfId: string | null; workingIds: Set<string>; onAdd: (cs: MkCustomerView[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Resolved[] | null>(null);
  const [picks, setPicks] = useState<Record<string, MkCustomerView>>({});
  const [error, setError] = useState<string | null>(null);

  async function find() {
    setBusy(true);
    setError(null);
    setPicks({});
    try {
      const lines = text.split(/[\n;,\t]+/).map((l) => l.trim()).filter(Boolean);
      const r = await fetch("/api/admin/portal/agents/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const j = (await r.json().catch(() => ({}))) as { results?: Resolved[]; error?: string };
      if (!r.ok || !j.results) throw new Error(j.error ?? `Lookup failed (${r.status})`);
      setResults(j.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  const matched = (results ?? []).flatMap((r) => (r.status === "matched" ? [r.customer] : []));
  const chosen = [...matched, ...Object.values(picks)];
  const toAdd = Array.from(new Map(chosen.filter((c) => c.partnerMkId !== selfId && !workingIds.has(c.partnerMkId)).map((c) => [c.partnerMkId, c])).values());
  const already = chosen.filter((c) => workingIds.has(c.partnerMkId)).length;
  const unmatched = (results ?? []).filter((r) => r.status === "unmatched");
  const ambiguous = (results ?? []).filter((r): r is Extract<Resolved, { status: "ambiguous" }> => r.status === "ambiguous");

  if (results) {
    return (
      <div className="space-y-3 text-[12px]">
        <p className="text-foreground">
          <span className="font-semibold">{matched.length}</span> of {results.length} line{results.length === 1 ? "" : "s"} matched a customer
          {already ? `, ${already} already a client` : ""}.
        </p>
        {ambiguous.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium text-foreground">Several customers match these. Pick one or skip:</p>
            {ambiguous.map((a) => (
              <div key={a.line} className="rounded-lg border border-border p-2 space-y-1">
                <p className="font-mono text-[11px] text-muted-foreground truncate">{a.line}</p>
                {a.candidates.map((c) => (
                  <label key={c.partnerMkId} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`amb-${a.line}`}
                      checked={picks[a.line]?.partnerMkId === c.partnerMkId}
                      onChange={() => setPicks((p) => ({ ...p, [a.line]: c }))}
                    />
                    <span className="truncate">
                      {c.name} <span className="text-muted-foreground">{[c.city, c.countCode].filter(Boolean).join(", ")}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
        {unmatched.length > 0 && (
          <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">
            <p className="font-medium">No customer found for {unmatched.length} line{unmatched.length === 1 ? "" : "s"}:</p>
            <p className="font-mono text-[11px] break-words mt-0.5">{unmatched.slice(0, 20).map((u) => u.line).join(", ")}{unmatched.length > 20 ? ", …" : ""}</p>
            <p className="mt-1 text-[11px]">Check the spelling, or sync the directory from Metakocka on the Customers page.</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={toAdd.length === 0}
            onClick={() => {
              onAdd(toAdd);
              setResults(null);
              setText("");
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Add {toAdd.length} customer{toAdd.length === 1 ? "" : "s"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setResults(null)}>
            Edit list
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">One customer per line: Metakocka customer code, email or exact name. Commas and tabs work too, so a spreadsheet column pastes as is.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        placeholder={"257/2025\ninfo@shop.example\nRecharge d.o.o."}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] focus:border-ring focus:outline-none"
      />
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      <Button size="sm" onClick={find} disabled={busy || !text.trim()}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Find customers
      </Button>
    </div>
  );
}

// ── the clients table ─────────────────────────────────────────────────────────

type Row = ClientEntry & { state: "saved" | "added" | "removed" };

function ClientsTable({
  working,
  baselineIds,
  removed,
  removedRows,
  directory,
  alsoWith,
  selfId,
  agentIds,
  onRemove,
  onUndo,
}: {
  working: ClientEntry[];
  baselineIds: Set<string>;
  removed: Set<string>;
  removedRows: ClientEntry[];
  directory: Record<string, MkCustomerView>;
  alsoWith: Record<string, AgentRef[]>;
  selfId: string | null;
  agentIds: Set<string>;
  onRemove: (ids: string[]) => void;
  onUndo: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [country, setCountry] = useState("all");
  const [show, setShow] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const headerBox = useRef<HTMLInputElement>(null);

  const rows: Row[] = useMemo(
    () =>
      [
        ...working.map((c) => ({ ...c, state: (baselineIds.has(c.partnerMkId) ? "saved" : "added") as Row["state"] })),
        ...removedRows.map((c) => ({ ...c, state: "removed" as const })),
      ].sort((a, b) => a.partnerName.localeCompare(b.partnerName)),
    [working, removedRows, baselineIds],
  );

  const countryOptions = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const r of rows) {
      const d = directory[r.partnerMkId];
      const iso = d?.countryIso ?? "none";
      const cur = m.get(iso);
      if (cur) cur.count += 1;
      else m.set(iso, { name: d?.countryIso ? d.countryName : "Unknown", count: 1 });
    }
    return Array.from(m, ([iso, v]) => ({ iso, ...v })).sort((a, b) => b.count - a.count);
  }, [rows, directory]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const d = directory[r.partnerMkId];
      if (needle && !`${r.partnerName} ${d?.email ?? ""} ${d?.city ?? ""} ${d?.countCode ?? ""} ${d?.taxId ?? ""}`.toLowerCase().includes(needle)) return false;
      if (kind !== "all" && d?.kind !== kind) return false;
      if (country !== "all" && (d?.countryIso ?? "none") !== country) return false;
      if (show === "changes" && r.state === "saved") return false;
      if (show === "shared" && !(alsoWith[r.partnerMkId]?.length)) return false;
      return true;
    });
  }, [rows, directory, q, kind, country, show, alsoWith]);

  useEffect(() => setLimit(PAGE), [q, kind, country, show]);
  const visible = filtered.slice(0, limit);
  const selectable = filtered.filter((r) => r.state !== "removed");
  const selectedVisible = selectable.filter((r) => selected.has(r.partnerMkId));
  const allChecked = selectable.length > 0 && selectedVisible.length === selectable.length;
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = selectedVisible.length > 0 && !allChecked;
  }, [selectedVisible.length, allChecked]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtersOn = q || kind !== "all" || country !== "all" || show !== "all";
  const grid = "grid grid-cols-[28px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1fr)_110px_minmax(0,0.9fr)_36px] items-center gap-x-3";

  return (
    <section className="rounded-2xl border border-border bg-background overflow-hidden min-w-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
        <h2 className="text-[13px] font-semibold text-foreground mr-1">
          Clients <span className="font-normal text-muted-foreground tabular-nums">{working.length}</span>
        </h2>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter clients by name, email, city, code" className="h-8 pl-8 text-[12px]" />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear filter">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex-1" />
        {filtersOn && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setKind("all");
              setCountry("all");
              setShow("all");
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
          >
            Reset filters
          </button>
        )}
        <span className="text-[11px] text-muted-foreground tabular-nums">{filtersOn ? `${filtered.length} of ${rows.length}` : `${rows.length} shown`}</span>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border/60 bg-teal-500/5 text-[12px]">
          <span className="font-medium text-foreground">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] text-destructive"
            onClick={() => {
              onRemove(Array.from(selected));
              setSelected(new Set());
            }}
          >
            <Trash2 className="w-3 h-3" /> Remove from agent
          </Button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground">
            Clear selection
          </button>
        </div>
      )}

      <div className={cn(grid, "px-4 h-9 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-muted/20")}>
        <input
          ref={headerBox}
          type="checkbox"
          aria-label="Select all shown clients"
          checked={allChecked}
          disabled={selectable.length === 0}
          onChange={() =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (allChecked) for (const r of selectable) next.delete(r.partnerMkId);
              else for (const r of selectable) next.add(r.partnerMkId);
              return next;
            })
          }
          className="size-3.5 accent-teal-600"
        />
        <span>Customer</span>
        <span className="hidden md:block">Contact</span>
        <span className="hidden md:block">
          <HeaderFilter
            label="Country"
            value={country}
            onChange={setCountry}
            options={[{ value: "all", label: "All countries" }, ...countryOptions.map((c) => ({ value: c.iso, label: c.name, count: c.count }))]}
          />
        </span>
        <span className="hidden md:block">
          <HeaderFilter
            label="Type"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "All types" },
              { value: "business", label: "Companies" },
              { value: "person", label: "Individuals" },
            ]}
          />
        </span>
        <span className="hidden md:block">
          <HeaderFilter
            label="Added"
            value={show}
            onChange={setShow}
            options={[
              { value: "all", label: "All clients" },
              { value: "changes", label: "Unsaved changes" },
              { value: "shared", label: "Shared with another agent" },
            ]}
          />
        </span>
        <span />
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <Users className="w-6 h-6 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-[13px] font-medium text-foreground">No clients yet</p>
          <p className="text-[12px] text-muted-foreground mt-1">Search the directory on the right, or paste a list of customer codes or emails.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-[12px] text-muted-foreground">No client matches these filters.</p>
      ) : (
        <div className="divide-y divide-border/50">
          {visible.map((r) => {
            const d = directory[r.partnerMkId];
            const others = (alsoWith[r.partnerMkId] ?? []).filter((a) => a.partnerMkId !== selfId);
            const isRemoved = r.state === "removed";
            return (
              <div
                key={r.partnerMkId}
                className={cn(
                  grid,
                  "px-4 py-2.5",
                  r.state === "added" && "bg-lime-500/[0.07]",
                  isRemoved && "bg-rose-500/[0.04]",
                  !isRemoved && "hover:bg-muted/20",
                )}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${r.partnerName}`}
                  checked={selected.has(r.partnerMkId)}
                  disabled={isRemoved}
                  onChange={() => toggle(r.partnerMkId)}
                  className="size-3.5 accent-teal-600"
                />
                <div className={cn("min-w-0", isRemoved && "opacity-60")}>
                  <p className={cn("text-[13px] font-medium text-foreground truncate", isRemoved && "line-through")}>{r.partnerName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {d?.countCode ?? r.partnerMkId}
                    {agentIds.has(r.partnerMkId) && <span className="text-teal-700 dark:text-teal-300">, also an agent</span>}
                    {others.length > 0 && (
                      <span title={others.map((o) => o.partnerName).join(", ")}>
                        {", also with "}
                        <Link href={`/customers/agents/${encodeURIComponent(others[0].partnerMkId)}`} className="hover:underline">
                          {others[0].partnerName}
                        </Link>
                        {others.length > 1 ? ` +${others.length - 1}` : ""}
                      </span>
                    )}
                  </p>
                </div>
                <div className={cn("hidden md:block min-w-0 text-[12px] text-muted-foreground", isRemoved && "opacity-60")}>
                  <p className="truncate">{d?.email ?? "No email"}</p>
                </div>
                <div className={cn("hidden md:flex items-center gap-1.5 min-w-0 text-[12px] text-foreground", isRemoved && "opacity-60")}>
                  {d?.countryIso ? <Flag iso={d.countryIso} /> : null}
                  <span className="truncate">{d?.city || d?.countryName || "Unknown"}</span>
                </div>
                <div className={cn("hidden md:block", isRemoved && "opacity-60")}>{d ? <CustomerKindBadge kind={d.kind} compact /> : <span className="text-[11px] text-muted-foreground">Not in directory</span>}</div>
                <div className="hidden md:block min-w-0 text-[11px]">
                  {r.state === "added" ? (
                    <span className="inline-flex items-center rounded-full bg-lime-500/15 text-lime-800 dark:text-lime-300 px-2 py-px font-medium">New, not saved</span>
                  ) : isRemoved ? (
                    <span className="text-rose-700 dark:text-rose-300 font-medium">Removed on save</span>
                  ) : (
                    <span className="text-muted-foreground truncate block" title={r.addedBy ?? undefined}>
                      {fmtDate(r.addedAt)}
                      {r.addedBy ? <span className="block truncate">{r.addedBy}</span> : null}
                    </span>
                  )}
                </div>
                {isRemoved ? (
                  <button type="button" onClick={() => onUndo(r.partnerMkId)} title="Keep this client" aria-label={`Keep ${r.partnerName}`} className="justify-self-end p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRemove([r.partnerMkId])}
                    title="Remove from agent"
                    aria-label={`Remove ${r.partnerName}`}
                    className="justify-self-end p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {filtered.length > visible.length && (
            <div className="px-4 py-3 text-center">
              <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="text-[12px] text-teal-700 dark:text-teal-300 hover:underline">
                Show {Math.min(PAGE, filtered.length - visible.length)} more of {filtered.length - visible.length}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {removed.size ? `${removed.size} client${removed.size === 1 ? "" : "s"} will be removed on save` : ""}
      </div>
    </section>
  );
}
