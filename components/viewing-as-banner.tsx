"use client";

// The strip an admin sees across the top of the portal while "viewing as" a
// customer or another user (lib/portal-impersonation.ts). One action: stop, which
// returns them to the admin page they came from.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LogOut } from "lucide-react";
import { viewingAsName, type ViewingAs } from "@/components/viewing-as";

export function ViewingAsBanner({ viewingAs }: { viewingAs: ViewingAs }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const name = viewingAsName(viewingAs);
  const subject = viewingAs.kind === "user" ? "user" : "customer";
  // Hide collapses the strip to a small pill for this page view only — a reload
  // brings the full banner back, so it is never forgotten that this is not you.
  const [hidden, setHidden] = useState(false);

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

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        title={`Viewing the portal as ${name} — click to show`}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-amber-900 text-amber-50 dark:bg-amber-300 dark:text-amber-950 px-3 h-8 text-[12px] font-medium shadow-lg"
      >
        <Eye className="w-3.5 h-3.5" /> as {name}
      </button>
    );
  }
  return (
    <div className="shrink-0 flex items-center gap-3 px-4 md:px-6 h-10 bg-amber-100 dark:bg-amber-950/50 border-b border-amber-300/60 dark:border-amber-800/60 text-[12px] text-amber-900 dark:text-amber-200">
      <Eye className="w-3.5 h-3.5 shrink-0" />
      <span className="min-w-0 truncate">
        Viewing the portal as {viewingAs.kind === "user" ? "user " : ""}<span className="font-semibold">{name}</span>
        <span className="hidden sm:inline text-amber-800/70 dark:text-amber-300/70">
          {viewingAs.kind === "user"
            ? ` · ${viewingAs.email} · the portal is resolved from this email exactly as it is for them — anything you save or submit here is theirs`
            : ` · ${viewingAs.partnerMkId} · you are acting as this customer — anything you save or submit here is theirs`}
        </span>
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setHidden(true)}
        className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-amber-900/80 hover:bg-amber-200/60 dark:text-amber-200/80 dark:hover:bg-amber-900/40"
        title="Hide this banner until the next reload"
      >
        <EyeOff className="w-3.5 h-3.5" /> Hide
      </button>
      <button
        type="button"
        onClick={stop}
        disabled={busy}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-amber-900 text-amber-50 hover:bg-amber-800 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200 font-medium disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
        Stop viewing as {subject}
      </button>
    </div>
  );
}
