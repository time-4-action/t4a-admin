"use client";

// The agent's account switcher in the portal nav: "All accounts" or one account
// (their own, or an assigned client). Renders nothing for a plain customer (one
// account). The choice is remembered server-side (POST /api/portal/accounts) and
// every document page follows it; switching away from a detail page goes back to
// that section's list, since the document may not belong to the new scope.

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_ACCOUNTS, type PortalAccount, type PortalScope } from "@/types/portal-agent";

const SCOPE_EVENT = "t4a:portal-scope";

type State = { accounts: PortalAccount[]; scope: PortalScope };

// Switch the remembered scope from anywhere in the portal (nav, accounts strip).
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
        const j = (await r.json().catch(() => ({}))) as Partial<State>;
        if (!r.ok || !j.accounts) return;
        window.dispatchEvent(new CustomEvent<State>(SCOPE_EVENT, { detail: { accounts: j.accounts, scope: j.scope ?? ALL_ACCOUNTS } }));
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

export function PortalAccountSwitcher() {
  const [state, setState] = useState<State | null>(null);
  const { switchTo, busy } = usePortalScopeSwitch();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/accounts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: State | null) => {
        if (!cancelled && j) setState(j);
      })
      .catch(() => undefined);
    const onScope = (e: Event) => setState((e as CustomEvent<State>).detail);
    window.addEventListener(SCOPE_EVENT, onScope);
    return () => {
      cancelled = true;
      window.removeEventListener(SCOPE_EVENT, onScope);
    };
  }, []);

  if (!state || state.accounts.length <= 1) return null;
  const own = state.accounts.find((a) => a.own);
  const clients = state.accounts.filter((a) => !a.own);

  return (
    <div className="px-2 pt-3">
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        Viewing {busy && <Loader2 className="w-3 h-3 animate-spin" />}
      </p>
      <Select value={state.scope} onValueChange={(v) => v !== state.scope && switchTo(v)} disabled={busy}>
        <SelectTrigger size="sm" className="w-full text-[12px] bg-background" aria-label="Account">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_ACCOUNTS}>
            <Users className="w-3.5 h-3.5" /> All accounts ({state.accounts.length})
          </SelectItem>
          <SelectSeparator />
          {own && <SelectItem value={own.mkId}>{own.name} (you)</SelectItem>}
          {clients.map((a) => (
            <SelectItem key={a.mkId} value={a.mkId}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
