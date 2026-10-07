"use client";

// The portal agent's account finder: "All accounts", their own account, or one of
// their clients — built for agents with 100+ clients (search, recents, A–Z with
// letter headings, full keyboard support). One finder, two triggers: the sidebar
// (PortalAccountSwitcher) and the bar above each list (AccountsStrip). Renders
// nothing for a plain customer (one account).
//
// The choice is remembered server-side (POST /api/portal/accounts) and every
// document page follows it; switching away from a detail page goes back to that
// section's list, since the document may not belong to the new scope.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { Check, ChevronsUpDown, Loader2, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_ACCOUNTS, type PortalAccount, type PortalScope } from "@/types/portal-agent";

// ── shared state (one fetch for every trigger on the page) ────────────────────

type State = { accounts: PortalAccount[]; scope: PortalScope };

let state: State | null = null;
let loading: Promise<void> | null = null;
let detailed = false; // the full list (city / code) has been loaded
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function setState(next: State) {
  state = next;
  emit();
}

function ensureLoaded() {
  if (detailed || loading) return;
  loading = fetch("/api/portal/accounts", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: State | null) => {
      if (j?.accounts) {
        detailed = true;
        setState({ accounts: j.accounts, scope: state?.scope ?? j.scope });
      }
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
}

// `initial` — what the server already knows (the page rendered the bar), so the
// bar paints at once; the full list (with city / code) still loads in the background.
export function usePortalAccounts(initial?: State): State | null {
  // Browser only: this module's state must never be written during SSR, where it
  // would be shared between every user's requests.
  if (typeof window !== "undefined" && initial && (!state || state.scope !== initial.scope)) {
    state = { accounts: state?.accounts ?? initial.accounts, scope: initial.scope };
  }
  useEffect(ensureLoaded, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => null,
  );
}

// ── recents (per browser — a convenience, never an access decision) ──────────

const RECENT_KEY = "t4a.portal.recent-accounts.v1";
const RECENT_MAX = 5;

function readRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const next = [id, ...readRecents().filter((x) => x !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

// ── switching ─────────────────────────────────────────────────────────────────

export function usePortalScopeSwitch() {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const switchTo = useCallback(
    async (scope: PortalScope) => {
      setBusy(true);
      try {
        const r = await fetch("/api/portal/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope }),
        });
        const j = (await r.json().catch(() => ({}))) as { scope?: PortalScope };
        if (!r.ok || !j.scope) return;
        if (state) setState({ ...state, scope: j.scope });
        if (j.scope !== ALL_ACCOUNTS) pushRecent(j.scope);
        // /portal/<section>/<id> → /portal/<section>
        const parts = pathname.split("/").filter(Boolean);
        if (parts[0] === "portal" && parts.length > 2) router.push(`/portal/${parts[1]}`);
        router.refresh();
      } finally {
        setBusy(false);
      }
    },
    [pathname, router],
  );
  return { switchTo, busy };
}

// ── presentation helpers ──────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function detailOf(a: PortalAccount): string {
  return [a.city, a.code].filter(Boolean).join(", ");
}

function AccountMark({ account, size = "md" }: { account: PortalAccount | null; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-7 text-[10px]" : "size-8 text-[11px]";
  if (!account) {
    return (
      <span className={cn(box, "rounded-lg bg-teal-500/15 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0")}>
        <Users className="size-4" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        box,
        "rounded-lg font-semibold flex items-center justify-center shrink-0",
        account.own ? "bg-foreground text-background" : "bg-muted text-foreground ring-1 ring-inset ring-border",
      )}
    >
      {initials(account.name)}
    </span>
  );
}

// ── the finder ────────────────────────────────────────────────────────────────

type Option = { key: string; scope: PortalScope; account: PortalAccount | null };
type Row = { type: "heading"; key: string; label: string; sticky?: boolean } | { type: "option"; option: Option; index: number };

function buildRows(accounts: PortalAccount[], query: string, recents: string[]): { rows: Row[]; options: Option[] } {
  const rows: Row[] = [];
  const options: Option[] = [];
  const add = (account: PortalAccount | null, keyPrefix: string) => {
    const option: Option = { key: `${keyPrefix}:${account?.mkId ?? ALL_ACCOUNTS}`, scope: account?.mkId ?? ALL_ACCOUNTS, account };
    rows.push({ type: "option", option, index: options.length });
    options.push(option);
  };
  const own = accounts.find((a) => a.own) ?? null;
  const clients = accounts.filter((a) => !a.own);
  const q = query.trim().toLowerCase();

  if (q) {
    const hits = accounts.filter((a) => `${a.name} ${a.city ?? ""} ${a.code ?? ""}`.toLowerCase().includes(q));
    if ("all accounts".includes(q)) add(null, "all");
    for (const a of hits) add(a, "hit");
    return { rows, options };
  }

  add(null, "all");
  if (own) add(own, "own");
  const byId = new Map(clients.map((a) => [a.mkId, a]));
  const recent = recents.map((id) => byId.get(id)).filter((a): a is PortalAccount => !!a);
  // Recents earn their place only once the list is long enough to need them.
  if (recent.length && clients.length > 8) {
    rows.push({ type: "heading", key: "h:recent", label: "Recently viewed" });
    for (const a of recent) add(a, "recent");
  }
  if (clients.length) {
    rows.push({ type: "heading", key: "h:clients", label: `Clients (${clients.length})` });
    const lettered = clients.length > 12;
    let letter = "";
    for (const a of clients) {
      const first = (a.name.trim()[0] ?? "#").toUpperCase();
      const l = /[A-ZÀ-Ž]/.test(first) ? first : "#";
      if (lettered && l !== letter) {
        letter = l;
        rows.push({ type: "heading", key: `h:${l}`, label: l, sticky: true });
      }
      add(a, "client");
    }
  }
  return { rows, options };
}

function AccountFinder({
  state,
  onPick,
  onClose,
}: {
  state: State;
  onPick: (scope: PortalScope) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [recents] = useState(readRecents);
  const listRef = useRef<HTMLDivElement>(null);
  const { rows, options } = useMemo(() => buildRows(state.accounts, q, recents), [state.accounts, q, recents]);

  // Start on the current scope; a new search starts at the top.
  useEffect(() => {
    if (q) return setActive(0);
    const i = options.findIndex((o) => o.scope === state.scope);
    setActive(i < 0 ? 0 : i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const clients = state.accounts.length - 1;

  return (
    <div className="flex flex-col max-h-[min(30rem,calc(100vh-6rem))]">
      <div className="relative border-b border-border shrink-0">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const o = options[active];
              if (o) onPick(o.scope);
            } else if (e.key === "Escape") {
              e.preventDefault();
              if (q) setQ("");
              else onClose();
            }
          }}
          placeholder={`Search ${clients} client${clients === 1 ? "" : "s"} by name, city or code`}
          aria-label="Search accounts"
          role="combobox"
          aria-expanded
          aria-controls="portal-account-list"
          aria-activedescendant={options[active] ? `acct-${options[active].key}` : undefined}
          className="h-11 w-full bg-transparent pl-9 pr-9 text-[13px] outline-none placeholder:text-muted-foreground"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div ref={listRef} id="portal-account-list" role="listbox" aria-label="Accounts" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {options.length === 0 && (
          <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            No account matches &ldquo;{q.trim()}&rdquo;. Try part of the name, the city or the customer code.
          </p>
        )}
        {rows.map((r) => {
          if (r.type === "heading") {
            return r.sticky ? (
              <div key={r.key} className="sticky top-0 z-10 px-3 py-0.5 text-[11px] font-semibold text-muted-foreground bg-background/95 backdrop-blur-sm border-b border-border/40">
                {r.label}
              </div>
            ) : (
              <div key={r.key} className="px-3 pt-3 pb-1 text-[11px] font-medium text-muted-foreground">
                {r.label}
              </div>
            );
          }
          const { option, index } = r;
          const a = option.account;
          const selected = option.scope === state.scope;
          const detail = a ? detailOf(a) : "";
          return (
            <div
              key={option.key}
              id={`acct-${option.key}`}
              data-index={index}
              role="option"
              aria-selected={selected}
              onMouseMove={() => active !== index && setActive(index)}
              onClick={() => onPick(option.scope)}
              className={cn("mx-1 flex items-center gap-2.5 rounded-lg px-2 py-1.5 cursor-pointer", index === active && "bg-muted")}
            >
              <AccountMark account={a} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-foreground truncate">
                  {a ? a.name : "All accounts"}
                  {a?.own && <span className="text-muted-foreground"> (you)</span>}
                </span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  {a ? (a.own ? "Your own account" : detail || "Client") : `Yours and ${clients} client${clients === 1 ? "" : "s"} together`}
                </span>
              </span>
              {selected && <Check className="size-4 text-teal-600 dark:text-teal-400 shrink-0" />}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground hidden sm:flex items-center gap-3">
        <span><kbd className="font-sans">↑↓</kbd> to move</span>
        <span><kbd className="font-sans">Enter</kbd> to open</span>
        <span><kbd className="font-sans">Esc</kbd> to close</span>
      </div>
    </div>
  );
}

// The popover around the finder, opened by any trigger.
function FinderPopover({
  state,
  trigger,
  align = "start",
}: {
  state: State;
  trigger: (props: { busy: boolean }) => React.ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const { switchTo, busy } = usePortalScopeSwitch();
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={busy}>
        {trigger({ busy })}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-background shadow-xl overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <AccountFinder
            state={state}
            onClose={() => setOpen(false)}
            onPick={(scope) => {
              setOpen(false);
              if (scope !== state.scope) void switchTo(scope);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function currentAccount(s: State): PortalAccount | null {
  return s.scope === ALL_ACCOUNTS ? null : (s.accounts.find((a) => a.mkId === s.scope) ?? null);
}

// ── triggers ──────────────────────────────────────────────────────────────────

// Sidebar: what the portal is showing, as a full-width button.
export function PortalAccountSwitcher() {
  const s = usePortalAccounts();
  if (!s || s.accounts.length <= 1) return null;
  const cur = currentAccount(s);
  const clients = s.accounts.length - 1;
  return (
    <div className="px-2 pt-3">
      <FinderPopover
        state={s}
        trigger={({ busy }) => (
          <button
            type="button"
            aria-label="Choose account"
            className="w-full flex items-center gap-2.5 rounded-xl border border-border bg-background px-2 py-1.5 text-left hover:border-foreground/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AccountMark account={cur} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-foreground truncate leading-tight">{cur ? cur.name : "All accounts"}</span>
              <span className="block text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                {cur ? (cur.own ? "Your account" : "Client account") : `You and ${clients} client${clients === 1 ? "" : "s"}`}
              </span>
            </span>
            {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" /> : <ChevronsUpDown className="size-4 text-muted-foreground shrink-0" />}
          </button>
        )}
      />
    </div>
  );
}

// Above each list: one line saying what the page covers + the finder + a way back
// to everything.
export function AccountScopeBar({ initial }: { initial?: State }) {
  const s = usePortalAccounts(initial);
  const { switchTo, busy } = usePortalScopeSwitch();
  if (!s || s.accounts.length <= 1) return null;
  const cur = currentAccount(s);
  const clients = s.accounts.length - 1;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-surface px-3 py-2">
      <span className="text-[12px] text-muted-foreground">Showing</span>
      <FinderPopover
        state={s}
        trigger={({ busy: switching }) => (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background pl-1 pr-2 h-8 max-w-full text-[13px] font-medium text-foreground hover:border-foreground/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AccountMark account={cur} size="sm" />
            <span className="truncate">{cur ? cur.name : `All ${s.accounts.length} accounts`}</span>
            {switching ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : <ChevronsUpDown className="size-3.5 text-muted-foreground" />}
          </button>
        )}
      />
      <span className="text-[12px] text-muted-foreground hidden sm:inline">
        {cur ? (cur.own ? "your own account" : [cur.city, cur.code].filter(Boolean).join(", ") || "client account") : `yours and ${clients} client${clients === 1 ? "" : "s"}`}
      </span>
      {cur && (
        <button
          type="button"
          disabled={busy}
          onClick={() => switchTo(ALL_ACCOUNTS)}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
        >
          <Users className="size-3.5" /> Show all accounts
        </button>
      )}
    </div>
  );
}
