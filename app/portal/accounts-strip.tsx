"use client";

// An agent's account strip above a portal list: which accounts the page covers,
// one click to narrow to an account (or back to all of them).

import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalScopeSwitch } from "@/components/portal-account-switcher";
import { ALL_ACCOUNTS, type PortalAccount, type PortalScope } from "@/types/portal-agent";

const MAX_CHIPS = 12;

export function AccountsStrip({ accounts, scope }: { accounts: PortalAccount[]; scope: PortalScope }) {
  const { switchTo, busy } = usePortalScopeSwitch();
  const all = scope === ALL_ACCOUNTS;
  const clients = accounts.length - 1;
  // The active account always shows, even past the chip cap.
  const shown = accounts.slice(0, MAX_CHIPS);
  if (!all && !shown.some((a) => a.mkId === scope)) {
    const active = accounts.find((a) => a.mkId === scope);
    if (active) shown.push(active);
  }
  const hidden = accounts.length - shown.length;

  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1 rounded-full border px-2.5 h-7 text-[12px] transition-colors max-w-[16rem]",
      active
        ? "border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300 font-medium"
        : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30",
    );

  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" />
        {all ? (
          <span>
            Showing <span className="font-semibold text-foreground">all accounts</span>: yours and {clients} client{clients === 1 ? "" : "s"}
          </span>
        ) : (
          <span>You manage {accounts.length} accounts. Showing one:</span>
        )}
      </p>
      <div className={cn("mt-2 flex flex-wrap gap-1.5", busy && "opacity-60 pointer-events-none")}>
        <button type="button" className={chip(all)} onClick={() => !all && switchTo(ALL_ACCOUNTS)}>
          All accounts
        </button>
        {shown.map((a) => (
          <button key={a.mkId} type="button" className={chip(scope === a.mkId)} onClick={() => scope !== a.mkId && switchTo(a.mkId)} title={a.name}>
            <span className="truncate">{a.name}</span>
            {a.own && <span className="text-[10px] opacity-70 shrink-0">(you)</span>}
          </button>
        ))}
        {hidden > 0 && <span className="inline-flex items-center h-7 px-1 text-[11px] text-muted-foreground">+{hidden} more in the account menu</span>}
      </div>
    </div>
  );
}
