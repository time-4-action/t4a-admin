"use client";

// An agent's scope bar above a portal list: what the page covers, the account
// finder, and the way back to all accounts. The server passes what it knows so
// the bar paints immediately (components/portal-account-switcher.tsx).

import { AccountScopeBar } from "@/components/portal-account-switcher";
import type { PortalAccount, PortalScope } from "@/types/portal-agent";

export function AccountsStrip({ accounts, scope }: { accounts: PortalAccount[]; scope: PortalScope }) {
  return <AccountScopeBar initial={{ accounts, scope }} />;
}
