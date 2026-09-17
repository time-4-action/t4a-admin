"use client";

// The strip an admin sees across the top of the portal while "viewing as" a
// customer (lib/portal-impersonation.ts). One action: stop, which returns them to
// the admin page they came from.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, LogOut } from "lucide-react";
import type { ViewingAs } from "@/components/app-shell";

export function ViewingAsBanner({ viewingAs }: { viewingAs: ViewingAs }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function stop() {
    setBusy(true);
    try {
      const r = await fetch("/api/portal/impersonation", { method: "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { redirect?: string };
      router.push(j.redirect || "/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 md:px-6 h-10 bg-amber-100 dark:bg-amber-950/50 border-b border-amber-300/60 dark:border-amber-800/60 text-[12px] text-amber-900 dark:text-amber-200">
      <Eye className="w-3.5 h-3.5 shrink-0" />
      <span className="min-w-0 truncate">
        Viewing the portal as <span className="font-semibold">{viewingAs.partnerName}</span>
        <span className="hidden sm:inline text-amber-800/70 dark:text-amber-300/70"> · {viewingAs.partnerMkId} · you are acting as this customer — anything you save or submit here is theirs</span>
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={stop}
        disabled={busy}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-amber-900 text-amber-50 hover:bg-amber-800 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200 font-medium disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
        Stop viewing as customer
      </button>
    </div>
  );
}
