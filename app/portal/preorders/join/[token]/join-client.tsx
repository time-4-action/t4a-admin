"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ShoppingCart, AlertTriangle, UserX, ChevronRight } from "lucide-react";
import { preorderHref } from "../../preorders-list";
import type { PortalAccount } from "@/types/portal-agent";

type State = "working" | "choose" | "no-account" | "invalid" | "error";

// Redeems the invite token: POST → grant access → redirect into the campaign. The
// user is already authenticated here (middleware gated /portal), so this is where we
// enforce "matched Metakocka partner" and "valid campaign link".
export default function JoinClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("working");
  // A portal agent picks which of their accounts the preorder is unlocked for.
  const [choice, setChoice] = useState<{ title: string; accounts: PortalAccount[] } | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  const join = useCallback(
    async (account?: string) => {
      const r = await fetch("/api/portal/preorder/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, account }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.choose) {
        setChoice({ title: data.title ?? "", accounts: data.accounts ?? [] });
        setState("choose");
        return;
      }
      if (r.ok && data.campaignId) {
        router.replace(preorderHref(data.campaignId, data.account ?? null));
        return;
      }
      if (data.error === "no-account") setState("no-account");
      else if (data.error === "invalid") setState("invalid");
      else setState("error");
    },
    [token, router],
  );

  useEffect(() => {
    join().catch(() => setState("error"));
  }, [join]);

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        {state === "working" && (
          <>
            <span className="w-12 h-12 rounded-2xl bg-lime-600/10 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-6 h-6 text-lime-600 animate-spin" />
            </span>
            <p className="text-[15px] font-semibold text-foreground">Unlocking your preorder…</p>
            <p className="text-[13px] text-muted-foreground mt-1">One moment while we set up your access.</p>
          </>
        )}

        {state === "choose" && choice && (
          <>
            <span className="w-12 h-12 rounded-2xl bg-lime-600/10 flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="w-6 h-6 text-lime-600" />
            </span>
            <p className="text-[15px] font-semibold text-foreground">Who is this preorder for?</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              {choice.title ? <>&ldquo;{choice.title}&rdquo;: </> : null}pick the account to unlock it for. You can open the link again to unlock it for another one.
            </p>
            <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-border divide-y divide-border/60 text-left">
              {choice.accounts.map((a) => (
                <button
                  key={a.mkId}
                  type="button"
                  disabled={!!picking}
                  onClick={() => {
                    setPicking(a.mkId);
                    join(a.mkId)
                      .catch(() => setState("error"))
                      .finally(() => setPicking(null));
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] hover:bg-muted/50 disabled:opacity-60"
                >
                  <span className="flex-1 min-w-0 truncate text-foreground">
                    {a.name}
                    {a.own && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  {picking === a.mkId ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground/60" />}
                </button>
              ))}
            </div>
          </>
        )}

        {state === "no-account" && (
          <>
            <span className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <UserX className="w-6 h-6 text-amber-600" />
            </span>
            <p className="text-[15px] font-semibold text-foreground">No B2B account matched</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              We couldn&rsquo;t match your login email to a customer account, so we can&rsquo;t open this
              preorder for you. Please log in with the email your account uses, or contact your rep.
            </p>
            <Link href="/portal/no-account" className="inline-block mt-4 text-[13px] text-lime-600 hover:underline">
              Learn more
            </Link>
          </>
        )}

        {state === "invalid" && (
          <>
            <span className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="w-6 h-6 text-rose-600" />
            </span>
            <p className="text-[15px] font-semibold text-foreground">This preorder link isn&rsquo;t available</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              The invite link is invalid or the preorder isn&rsquo;t open. Ask your rep for an up-to-date link.
            </p>
            <Link href="/portal/preorders" className="inline-block mt-4 text-[13px] text-lime-600 hover:underline">
              My preorders
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <span className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-rose-600" />
            </span>
            <p className="text-[15px] font-semibold text-foreground">Something went wrong</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              We couldn&rsquo;t open this preorder. Please try the link again in a moment.
            </p>
            <Link href="/portal/preorders" className="inline-block mt-4 text-[13px] text-lime-600 hover:underline">
              My preorders
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
