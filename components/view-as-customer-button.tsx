"use client";

// "View portal as this customer" — starts an admin impersonation
// (lib/portal-impersonation.ts) and jumps into the portal. Used wherever an admin
// looks at one Metakocka partner (preorder customer modal, Documents customer pages).

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, UserRoundSearch } from "lucide-react";
import { cn } from "@/lib/utils";

export function ViewAsCustomerButton({
  partnerMkId,
  className,
  label = "View as customer",
  to = "/portal/preorders",
}: {
  partnerMkId: string;
  className?: string;
  label?: string;
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
        body: JSON.stringify({ partnerMkId, returnTo: pathname }),
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
      title={error ?? "Open the customer portal exactly as this customer sees it"}
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
