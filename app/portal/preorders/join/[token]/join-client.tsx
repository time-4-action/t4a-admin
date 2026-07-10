"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ShoppingCart, AlertTriangle, UserX } from "lucide-react";

type State = "working" | "no-account" | "invalid" | "error";

// Redeems the invite token: POST → grant access → redirect into the campaign. The
// user is already authenticated here (middleware gated /portal), so this is where we
// enforce "matched Metakocka partner" and "valid campaign link".
export default function JoinClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("working");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/preorder/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && data.campaignId) {
          router.replace(`/portal/preorders/${data.campaignId}`);
          return;
        }
        if (data.error === "no-account") setState("no-account");
        else if (data.error === "invalid") setState("invalid");
        else setState("error");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [token, router]);

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
