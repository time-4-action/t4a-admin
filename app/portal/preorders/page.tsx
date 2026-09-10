"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Clock, ChevronRight, CheckCircle2, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import {
  type PreorderCampaignSummary,
  type SubmissionStatus,
  SUBMISSION_STATUS_LABELS,
} from "@/types/preorder";

type MyCampaign = PreorderCampaignSummary & {
  mySubmissionStatus: SubmissionStatus | null;
};

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

export default function PortalPreordersPage() {
  const [campaigns, setCampaigns] = useState<MyCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [noAccount, setNoAccount] = useState(false);

  useEffect(() => {
    fetch("/api/portal/preorder/campaigns")
      .then(async (r) => {
        const data = await r.json();
        if (r.status === 404 && data?.error === "no-account") {
          setNoAccount(true);
          return;
        }
        setCampaigns(data.campaigns ?? []);
      })
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0">
        <div className="h-14 flex items-center px-4 md:px-8">
          <h1 className="font-display text-lg font-medium tracking-tight text-foreground">Preorders</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
                  <Skeleton className="w-11 h-11 rounded-xl shrink-0" delay={stagger(i)} />
                  <div className="min-w-0 flex-1">
                    {/* text-[14px] → 21px; meta text-[12px] → 18px */}
                    <SkeletonLine lh="h-[21px]" h="h-3.5" w="w-48" delay={stagger(i, 80, 20)} />
                    <div className="flex items-center gap-3 mt-0.5">
                      <SkeletonLine lh="h-[18px]" w="w-16" delay={stagger(i, 80, 40)} />
                      <SkeletonLine lh="h-[18px]" w="w-32" delay={stagger(i, 80, 60)} />
                    </div>
                  </div>
                  <Skeleton className="h-[20.5px] w-20 rounded-full shrink-0" delay={stagger(i, 80, 80)} />
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                </div>
              ))}
            </div>
          )}

          {!loading && noAccount && (
            <div className="rounded-xl border border-border bg-surface p-8 text-center">
              <ShoppingCart className="w-6 h-6 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-[14px] font-medium text-foreground">No B2B account matched</p>
              <p className="text-[13px] text-muted-foreground mt-1">
                We couldn&rsquo;t match your email to a partner account.{" "}
                <Link href="/portal/no-account" className="underline">Learn more</Link>.
              </p>
            </div>
          )}

          {!loading && !noAccount && campaigns.length === 0 && (
            <div className="rounded-xl border border-border bg-surface p-8 text-center">
              <ShoppingCart className="w-6 h-6 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-[14px] font-medium text-foreground">No preorders yet</p>
              <p className="text-[13px] text-muted-foreground mt-1">
                Preorders are unlocked by invitation. Open the link your rep shared with you to add one here.
              </p>
            </div>
          )}

          {!loading && !noAccount && campaigns.length > 0 && (
            <div className="space-y-3">
              {campaigns.map((c) => {
                const submitted = c.mySubmissionStatus === "submitted" || c.mySubmissionStatus === "confirmed";
                const draft = c.mySubmissionStatus === "draft";
                return (
                  <Link
                    key={c.id}
                    href={`/portal/preorders/${c.id}`}
                    className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 hover:border-lime-400 dark:hover:border-lime-600 transition-colors"
                  >
                    <span className="w-11 h-11 rounded-xl bg-lime-600/10 flex items-center justify-center shrink-0">
                      <ShoppingCart className="w-5 h-5 text-lime-600 dark:text-lime-500" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-foreground truncate">{c.title}</div>
                      <div className="flex items-center gap-3 mt-0.5 text-[12px] text-muted-foreground">
                        {c.season && <span>{c.season}</span>}
                        {c.deadline && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Deadline {fmtDate(c.deadline)}
                          </span>
                        )}
                      </div>
                    </div>
                    {c.mySubmissionStatus && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0",
                          submitted
                            ? "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
                        )}
                      >
                        {submitted ? <CheckCircle2 className="w-3 h-3" /> : <PencilLine className="w-3 h-3" />}
                        {SUBMISSION_STATUS_LABELS[c.mySubmissionStatus]}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
