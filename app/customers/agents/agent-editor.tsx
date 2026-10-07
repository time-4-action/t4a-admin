"use client";

// The agent page (Customers → Agents → one agent, or "New agent"). Built for
// agents with 100+ clients: a summary strip, a searchable / filterable client
// table with multi-select, and an add panel that takes either a directory search
// (add several without closing anything) or a pasted list of customer codes /
// emails / names. Every change AUTOSAVES (debounced, one save in flight at a
// time, the latest state always wins); removals offer Undo. A new agent is
// created the moment their own account is picked.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Check,
  ClipboardPaste,
  CloudOff,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Search,
  Trash2,
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
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const PAGE = 100;
const SAVE_DELAY_MS = 700;
const UNDO_MS = 8000;

function fmtDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1 && new Date().toDateString() === d.toDateString()) return "Today";
  if (days < 2) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function shortActor(v: string | null): string {
  if (!v) return "";
  return v.includes("@") ? v.split("@")[0] : v;
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
  if (!agent) return <NewAgent seed={seed ?? null} agentIds={agentIds} />;
  return <ExistingAgent agent={agent} directory={initialDirectory} alsoWith={alsoWith} agentIds={agentIds} />;
}

// ── new agent: pick their own account, which creates the agent ────────────────

function NewAgent({ seed, agentIds }: { seed: MkCustomerView | null; agentIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const agentIdSet = useMemo(() => new Set(agentIds), [agentIds]);

  const create = useCallback(
    async (c: MkCustomerView) => {
      setBusy(c.partnerMkId);
      setError(null);
      try {
        const r = await fetch("/api/admin/portal/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerMkId: c.partnerMkId, partnerName: c.name, clients: [], note: "" }),
        });
        const j = (await r.json().catch(() => ({}))) as { agent?: PortalAgentView; error?: string };
        if (!r.ok || !j.agent) throw new Error(j.error ?? `Could not create the agent (${r.status})`);
        router.replace(`/customers/agents/${encodeURIComponent(j.agent.partnerMkId)}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create the agent");
        setBusy(null);
      }
    },
    [router],
  );

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="h-14 flex items-center gap-3 px-4 md:px-8">
          <Link href="/customers/agents" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back to agents">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="font-display text-lg font-medium tracking-tight text-foreground truncate">New agent</h1>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-xl px-4 py-10 md:py-16 space-y-6">
          <div className="space-y-2">
            <span className="flex size-11 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Briefcase className="size-5" />
            </span>
            <h2 className="font-display text-2xl font-medium tracking-tight text-foreground">Who is the agent?</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Pick the customer the agent signs in as. They keep their own invoices and orders, and you add the clients they
              may see on the next screen.
            </p>
          </div>
          {seed && !agentIdSet.has(seed.partnerMkId) && (
            <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4 flex items-center gap-3">
              <span className="size-10 rounded-xl bg-foreground text-background flex items-center justify-center text-[13px] font-semibold shrink-0">{initials(seed.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-foreground truncate">{seed.name}</p>
                <p className="text-[12px] text-muted-foreground truncate">{[seed.email, seed.city, seed.countCode].filter(Boolean).join(", ")}</p>
              </div>
              <Button size="sm" onClick={() => create(seed)} disabled={!!busy}>
                {busy === seed.partnerMkId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Make agent
              </Button>
            </div>
          )}
          <div className="rounded-2xl border border-border bg-surface p-4">
            <DirectorySearch
              autoFocus={!seed}
              placeholder={seed ? "Or search another customer" : "Search name, email, VAT id or code"}
              render={(c) =>
                agentIdSet.has(c.partnerMkId) ? (
                  <Link href={`/customers/agents/${encodeURIComponent(c.partnerMkId)}`} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline shrink-0">
                    Already an agent
                  </Link>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => create(c)} disabled={!!busy}>
                    {busy === c.partnerMkId ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Make agent
                  </Button>
                )
              }
            />
          </div>
          {error && (
            <p className="flex items-center gap-2 text-[12px] text-destructive">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── existing agent: autosaving editor ─────────────────────────────────────────

function ExistingAgent({
  agent,
  directory: initialDirectory,
  alsoWith,
  agentIds,
}: {
  agent: PortalAgentView;
  directory: Record<string, MkCustomerView>;
  alsoWith: Record<string, AgentRef[]>;
  agentIds: string[];
}) {
  const router = useRouter();
  const selfId = agent.partnerMkId;
  const [directory, setDirectory] = useState(initialDirectory);
  const [clients, setClients] = useState<ClientEntry[]>(agent.clients);
  const [note, setNote] = useState(agent.note ?? "");
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ entries: ClientEntry[]; at: number } | null>(null);
  const agentIdSet = useMemo(() => new Set(agentIds), [agentIds]);
  const clientIds = useMemo(() => new Set(clients.map((c) => c.partnerMkId)), [clients]);

  // ── autosave ──
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(agent.updatedAt ? new Date(agent.updatedAt) : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef({ clients, note });
  latest.current = { clients, note };
  const inFlight = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    setSaveState("saving");
    const { clients: cs, note: n } = latest.current;
    try {
      const r = await fetch(`/api/admin/portal/agents/${encodeURIComponent(selfId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clients: cs.map((c) => ({ partnerMkId: c.partnerMkId, partnerName: c.partnerName })), note: n }),
      });
      const j = (await r.json().catch(() => ({}))) as { agent?: PortalAgentView; error?: string };
      if (!r.ok || !j.agent) throw new Error(j.error ?? `Save failed (${r.status})`);
      // Stamp the "added" date / person the server recorded on rows that lack it.
      const stamps = new Map(j.agent.clients.map((c) => [c.partnerMkId, c]));
      setClients((prev) =>
        prev.map((c) => {
          const s = stamps.get(c.partnerMkId);
          return s && !c.addedAt ? { ...c, addedAt: s.addedAt, addedBy: s.addedBy } : c;
        }),
      );
      setSavedAt(new Date());
      setSaveError(null);
      setSaveState(again.current ? "pending" : "saved");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
      setSaveState("error");
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
  }, [selfId]);

  const scheduleSave = useCallback(
    (delay = SAVE_DELAY_MS) => {
      setSaveState("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // Leaving while a save is pending or failed asks first.
  const unsaved = saveState === "pending" || saveState === "saving" || saveState === "error";
  useEffect(() => {
    if (!unsaved) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [unsaved]);

  // ── edits ──
  const remember = useCallback((cs: MkCustomerView[]) => setDirectory((d) => ({ ...d, ...Object.fromEntries(cs.map((c) => [c.partnerMkId, c])) })), []);

  function addClients(cs: MkCustomerView[]) {
    const fresh = cs.filter((c) => c.partnerMkId !== selfId && !clientIds.has(c.partnerMkId));
    if (fresh.length === 0) return;
    remember(fresh);
    setClients((prev) => [...prev, ...fresh.map((c) => ({ partnerMkId: c.partnerMkId, partnerName: c.name, addedAt: null, addedBy: null }))]);
    setJustAdded((prev) => new Set([...prev, ...fresh.map((c) => c.partnerMkId)]));
    scheduleSave();
  }

  function removeClients(ids: string[]) {
    const drop = new Set(ids);
    const entries = clients.filter((c) => drop.has(c.partnerMkId));
    if (entries.length === 0) return;
    setClients((prev) => prev.filter((c) => !drop.has(c.partnerMkId)));
    setUndo({ entries, at: Date.now() });
    scheduleSave();
  }

  function undoRemove() {
    if (!undo) return;
    const back = undo.entries.filter((e) => !clientIds.has(e.partnerMkId));
    setClients((prev) => [...prev, ...back]);
    setUndo(null);
    scheduleSave(0);
  }

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState(false);
  async function removeAgent() {
    setRemoving(true);
    try {
      if (timer.current) clearTimeout(timer.current);
      const r = await fetch(`/api/admin/portal/agents/${encodeURIComponent(selfId)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Remove failed (${r.status})`);
      router.push("/customers/agents");
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Remove failed");
      setSaveState("error");
      setRemoving(false);
    }
  }

  const self = directory[selfId] ?? null;

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="h-14 flex items-center gap-3 px-4 md:px-8">
          <Link href="/customers/agents" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back to agents">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground truncate leading-tight">{agent.partnerName}</h1>
            <p className="text-[11px] text-muted-foreground truncate leading-tight">
              Agent with {clients.length} client{clients.length === 1 ? "" : "s"}
            </p>
          </div>
          <SaveStatus state={saveState} savedAt={savedAt} error={saveError} onRetry={() => void flush()} />
          <ViewAsCustomerButton partnerMkId={selfId} to="/portal/invoices" className="hidden sm:inline-flex" />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 md:p-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] items-start">
          <div className="space-y-4 min-w-0">
            <SummaryStrip clients={clients} directory={directory} alsoWith={alsoWith} selfId={selfId} />
            <ClientsTable
              clients={clients}
              justAdded={justAdded}
              directory={directory}
              alsoWith={alsoWith}
              selfId={selfId}
              agentIds={agentIdSet}
              onRemove={removeClients}
            />
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4">
            <AgentAccountCard isNew={false} self={self} name={agent.partnerName} onPick={() => undefined} agentIds={agentIdSet} clientIds={clientIds} />
            <AddClientsCard selfId={selfId} workingIds={clientIds} agentIds={agentIdSet} onAdd={addClients} />
            <section className="rounded-2xl border border-border bg-surface p-4 space-y-2">
              <h2 className="text-[13px] font-semibold text-foreground">Internal note</h2>
              <textarea
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  scheduleSave(1000);
                }}
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
              <p>Changes save automatically and apply to the agent right away.</p>
            </section>
            <section className="rounded-2xl border border-rose-500/25 p-4 space-y-2">
              <h2 className="text-[13px] font-semibold text-foreground">Remove agent</h2>
              <p className="text-[12px] text-muted-foreground">They keep their own account and lose access to all {clients.length} clients.</p>
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="destructive" onClick={removeAgent} disabled={removing}>
                    {removing && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Remove agent
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-3.5 h-3.5" /> Remove agent…
                </Button>
              )}
            </section>
          </aside>
        </div>
      </div>

      {undo && (
        <div role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl bg-foreground text-background pl-4 pr-2 py-2 shadow-xl text-[13px] animate-in fade-in-0 slide-in-from-bottom-2">
          <span>
            Removed {undo.entries.length === 1 ? undo.entries[0].partnerName : `${undo.entries.length} clients`}
          </span>
          <button type="button" onClick={undoRemove} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium hover:bg-background/15 cursor-pointer">
            <RotateCcw className="w-3.5 h-3.5" /> Undo
          </button>
          <button type="button" onClick={() => setUndo(null)} aria-label="Dismiss" className="rounded-lg p-1 opacity-70 hover:opacity-100 hover:bg-background/15 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function SaveStatus({ state, savedAt, error, onRetry }: { state: SaveState; savedAt: Date | null; error: string | null; onRetry: () => void }) {
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-2 text-[12px] text-rose-700 dark:text-rose-300" title={error ?? undefined}>
        <CloudOff className="w-3.5 h-3.5" /> Not saved
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2 hover:no-underline cursor-pointer">
          Retry
        </button>
      </span>
    );
  }
  if (state === "pending" || state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving
      </span>
    );
  }
  const time = savedAt ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(savedAt) : null;
  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <Check className={cn("w-3.5 h-3.5", state === "saved" && "text-emerald-600 dark:text-emerald-400")} />
      {state === "saved" ? "Saved" : "All changes saved"}
      {time && state !== "saved" ? <span className="opacity-70">at {time}</span> : null}
    </span>
  );
}

// ── summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({
  clients,
  directory,
  alsoWith,
  selfId,
}: {
  clients: ClientEntry[];
  directory: Record<string, MkCustomerView>;
  alsoWith: Record<string, AgentRef[]>;
  selfId: string;
}) {
  let companies = 0;
  let people = 0;
  const countries = new Map<string, number>();
  let shared = 0;
  for (const c of clients) {
    const d = directory[c.partnerMkId];
    if (d?.kind === "business") companies += 1;
    else if (d) people += 1;
    if (d?.countryIso) countries.set(d.countryIso, (countries.get(d.countryIso) ?? 0) + 1);
    if ((alsoWith[c.partnerMkId] ?? []).some((a) => a.partnerMkId !== selfId)) shared += 1;
  }
  const top = Array.from(countries).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const tiles: { label: string; value: React.ReactNode; note?: React.ReactNode }[] = [
    { label: "Clients", value: clients.length, note: "accounts the agent sees" },
    { label: "Companies", value: companies, note: `${people} individual${people === 1 ? "" : "s"}` },
    {
      label: "Countries",
      value: countries.size,
      note: top.length ? (
        <span className="inline-flex items-center gap-1.5">
          {top.map(([iso]) => (
            <Flag key={iso} iso={iso} />
          ))}
        </span>
      ) : (
        "none yet"
      ),
    },
    { label: "Shared", value: shared, note: "also with another agent" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 rounded-2xl border border-border bg-surface overflow-hidden divide-x divide-y md:divide-y-0 divide-border/60">
      {tiles.map((t) => (
        <div key={t.label} className="px-4 py-3 min-w-0">
          <p className="text-[11px] text-muted-foreground">{t.label}</p>
          <p className="font-display text-[22px] leading-tight font-medium text-foreground tabular-nums mt-0.5">{t.value}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{t.note}</p>
        </div>
      ))}
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
          <button type="button" onClick={() => onPick(null)} className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground hover:underline">
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
                  className="cursor-pointer text-[11px] font-medium text-teal-700 dark:text-teal-300 hover:underline disabled:text-muted-foreground disabled:no-underline shrink-0"
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
                "cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
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
                <button type="button" onClick={() => onAdd(fresh)} className="cursor-pointer text-[11px] font-medium text-teal-700 dark:text-teal-300 hover:underline">
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
                  className="cursor-pointer inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium text-foreground hover:bg-muted shrink-0"
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
            <button type="button" onClick={() => setQ("")} className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
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
                      className="cursor-pointer"
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

function ClientsTable({
  clients,
  justAdded,
  directory,
  alsoWith,
  selfId,
  agentIds,
  onRemove,
}: {
  clients: ClientEntry[];
  justAdded: Set<string>;
  directory: Record<string, MkCustomerView>;
  alsoWith: Record<string, AgentRef[]>;
  selfId: string;
  agentIds: Set<string>;
  onRemove: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [country, setCountry] = useState("all");
  const [show, setShow] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const headerBox = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => [...clients].sort((a, b) => a.partnerName.localeCompare(b.partnerName)), [clients]);
  const sharedWith = useCallback((id: string) => (alsoWith[id] ?? []).filter((a) => a.partnerMkId !== selfId), [alsoWith, selfId]);

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
      if (show === "recent" && !justAdded.has(r.partnerMkId)) return false;
      if (show === "shared" && sharedWith(r.partnerMkId).length === 0) return false;
      return true;
    });
  }, [rows, directory, q, kind, country, show, justAdded, sharedWith]);

  useEffect(() => setLimit(PAGE), [q, kind, country, show]);
  // A removed client can no longer be selected.
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(clients.map((c) => c.partnerMkId));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [clients]);

  const visible = filtered.slice(0, limit);
  const selectedShown = filtered.filter((r) => selected.has(r.partnerMkId));
  const allChecked = filtered.length > 0 && selectedShown.length === filtered.length;
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = selectedShown.length > 0 && !allChecked;
  }, [selectedShown.length, allChecked]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtersOn = !!q || kind !== "all" || country !== "all" || show !== "all";
  const grid =
    "grid grid-cols-[32px_minmax(0,1fr)_40px] md:grid-cols-[32px_minmax(0,1.8fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_112px_minmax(0,0.9fr)_40px] items-center gap-x-4";
  const checkbox = "size-4 rounded accent-teal-600 cursor-pointer disabled:cursor-not-allowed";

  return (
    <section className="rounded-2xl border border-border bg-background overflow-hidden min-w-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter clients by name, email, city or code" className="h-9 pl-9 text-[13px] bg-background" />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Clear filter">
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
            className="text-[12px] text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
          >
            Reset filters
          </button>
        )}
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {filtersOn ? (
            <>
              <span className="font-semibold text-foreground">{filtered.length}</span> of {rows.length}
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">{rows.length}</span> client{rows.length === 1 ? "" : "s"}
            </>
          )}
        </span>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-teal-500/20 bg-teal-500/[0.06] text-[12px]">
          <span className="font-medium text-foreground tabular-nums">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] text-destructive hover:text-destructive gap-1.5"
            onClick={() => {
              onRemove(Array.from(selected));
              setSelected(new Set());
            }}
          >
            <Trash2 className="w-3 h-3" /> Remove from agent
          </Button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-[12px] text-muted-foreground hover:text-foreground cursor-pointer">
            Clear selection
          </button>
        </div>
      )}

      <div className={cn(grid, "px-4 h-10 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-muted/25")}>
        <input
          ref={headerBox}
          type="checkbox"
          aria-label="Select all shown clients"
          checked={allChecked}
          disabled={filtered.length === 0}
          onChange={() =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (allChecked) for (const r of filtered) next.delete(r.partnerMkId);
              else for (const r of filtered) next.add(r.partnerMkId);
              return next;
            })
          }
          className={checkbox}
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
              { value: "recent", label: "Added just now" },
              { value: "shared", label: "Shared with another agent" },
            ]}
          />
        </span>
        <span />
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Users className="size-5" />
          </span>
          <p className="text-[14px] font-medium text-foreground">No clients yet</p>
          <p className="text-[12px] text-muted-foreground mt-1 max-w-sm mx-auto">
            Search the customer directory on the right, or paste a list of customer codes or emails to add many at once.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-12 text-center text-[13px] text-muted-foreground">No client matches these filters.</p>
      ) : (
        <div className="divide-y divide-border/50">
          {visible.map((r) => {
            const d = directory[r.partnerMkId];
            const others = sharedWith(r.partnerMkId);
            const isSelected = selected.has(r.partnerMkId);
            const fresh = justAdded.has(r.partnerMkId);
            return (
              <div
                key={r.partnerMkId}
                onClick={(e) => {
                  // The row toggles selection; links, buttons and the checkbox act on their own.
                  if ((e.target as HTMLElement).closest("a,button,input")) return;
                  toggle(r.partnerMkId);
                }}
                className={cn(
                  grid,
                  "group px-4 py-3 cursor-pointer transition-colors",
                  isSelected ? "bg-teal-500/[0.07] hover:bg-teal-500/[0.1]" : fresh ? "bg-lime-500/[0.06] hover:bg-lime-500/[0.1]" : "hover:bg-muted/40",
                )}
              >
                <input type="checkbox" aria-label={`Select ${r.partnerName}`} checked={isSelected} onChange={() => toggle(r.partnerMkId)} className={checkbox} />

                {/* Customer */}
                <div className="min-w-0 flex items-center gap-3">
                  <span
                    className={cn(
                      "size-9 rounded-xl flex items-center justify-center text-[12px] font-semibold shrink-0",
                      d?.kind === "business" ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" : "bg-muted text-foreground",
                    )}
                  >
                    {initials(r.partnerName)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{r.partnerName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      <span className="tabular-nums">{d?.countCode ?? r.partnerMkId}</span>
                      {agentIds.has(r.partnerMkId) && (
                        <Link
                          href={`/customers/agents/${encodeURIComponent(r.partnerMkId)}`}
                          className="ml-2 inline-flex items-center gap-1 text-teal-700 dark:text-teal-300 hover:underline"
                        >
                          <Briefcase className="w-3 h-3" /> agent
                        </Link>
                      )}
                      {others.length > 0 && (
                        <span className="ml-2" title={others.map((o) => o.partnerName).join(", ")}>
                          also with{" "}
                          <Link href={`/customers/agents/${encodeURIComponent(others[0].partnerMkId)}`} className="text-foreground/80 hover:underline">
                            {others[0].partnerName}
                          </Link>
                          {others.length > 1 ? ` +${others.length - 1}` : ""}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Contact */}
                <div className="hidden md:block min-w-0 text-[12px]">
                  {d?.email ? (
                    <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1.5 max-w-full text-muted-foreground hover:text-foreground">
                      <Mail className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{d.email}</span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground/60">No email</span>
                  )}
                  {d?.phone && <p className="text-[11px] text-muted-foreground truncate pl-5">{d.phone}</p>}
                </div>

                {/* Location */}
                <div className="hidden md:flex items-center gap-2 min-w-0">
                  {d?.countryIso ? <Flag iso={d.countryIso} className="text-[15px] shrink-0" /> : <span className="size-4 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-[12px] text-foreground truncate">{d?.city || d?.countryName || "Unknown"}</p>
                    {d?.city && d.countryIso && <p className="text-[11px] text-muted-foreground truncate">{d.countryName}</p>}
                  </div>
                </div>

                {/* Type */}
                <div className="hidden md:block">
                  {d ? <CustomerKindBadge kind={d.kind} compact /> : <span className="text-[11px] text-muted-foreground">Not in directory</span>}
                </div>

                {/* Added */}
                <div className="hidden md:block min-w-0 text-[12px]">
                  {fresh && !r.addedAt ? (
                    <span className="inline-flex items-center rounded-full bg-lime-500/15 text-lime-800 dark:text-lime-300 px-2 py-0.5 text-[11px] font-medium">Just added</span>
                  ) : (
                    <>
                      <p className="text-foreground/90">{fmtDate(r.addedAt) || "—"}</p>
                      {r.addedBy && (
                        <p className="text-[11px] text-muted-foreground truncate" title={r.addedBy}>
                          by {shortActor(r.addedBy)}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onRemove([r.partnerMkId])}
                  title="Remove from agent"
                  aria-label={`Remove ${r.partnerName} from this agent`}
                  className="justify-self-end flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-all cursor-pointer hover:text-destructive hover:bg-destructive/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
          {filtered.length > visible.length && (
            <div className="px-4 py-3 text-center">
              <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="text-[12px] text-teal-700 dark:text-teal-300 hover:underline cursor-pointer">
                Show {Math.min(PAGE, filtered.length - visible.length)} more of {filtered.length - visible.length}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
