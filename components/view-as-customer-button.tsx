"use client";

// "View portal as this customer" / "View portal as this user" — starts an admin
// impersonation (lib/portal-impersonation.ts) and jumps into the portal. Used
// wherever an admin looks at one Metakocka partner (preorder customer modal,
// Documents customer pages) and, super-admin only, on the Auth0 user detail page.

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, UserRoundSearch } from "lucide-react";
import { cn } from "@/lib/utils";

type Subject = { partnerMkId: string; userId?: undefined } | { userId: string; partnerMkId?: undefined };

export function ViewAsCustomerButton({
  partnerMkId,
  userId,
  className,
  label = "View as customer",
  title = "Open the customer portal exactly as this customer sees it",
  to = "/portal/preorders",
}: Subject & {
  className?: string;
  label?: string;
  title?: string;
  // Where in the portal to land (preorders by default; documents pages pass their own).
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/portal/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userId ? { userId, returnTo: pathname } : { partnerMkId, returnTo: pathname }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? `Could not open the portal (${r.status})`);
      router.push(to);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      title={error ?? title}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:opacity-60",
        error
          ? "border-rose-300 text-rose-700 dark:text-rose-300"
          : "border-teal-500/40 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30",
        className,
      )}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserRoundSearch className="w-3.5 h-3.5" />}
      {error ? "Failed — retry" : label}
    </button>
  );
}

// Super-admin only: the portal exactly as this Auth0 user gets it (their email
// decides the Metakocka partner — or the no-account page, if none matches).
export function ViewAsUserButton({ userId, className, to = "/portal/invoices" }: { userId: string; className?: string; to?: string }) {
  return (
    <ViewAsCustomerButton
      userId={userId}
      label="View portal as this user"
      title="Open the B2B portal exactly as this user sees it"
      to={to}
      className={className}
    />
  );
}
