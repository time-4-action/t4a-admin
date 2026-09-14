"use client";

// app/preorder/preorder-badges.tsx
//
// The status / stage / provenance pills of the Preorder module, in one place. Tailwind
// only sees literal class strings, so every colour lives in a Record here rather than
// being interpolated. Lime is the section accent.

import { cn } from "@/lib/utils";
import {
  CAMPAIGN_STATUS_LABELS,
  CONFIG_SOURCE_LABELS,
  SUBMISSION_STAGE_LABELS,
  type CampaignStatus,
  type ConfigSource,
  type MarketColor,
  type MkOrderState,
  type SubmissionStage,
} from "@/types/preorder";

const PILL = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

export const CAMPAIGN_STATUS_STYLE: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  open: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300",
  closed: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
};

export function CampaignStatusBadge({ status, className }: { status: CampaignStatus; className?: string }) {
  return <span className={cn(PILL, CAMPAIGN_STATUS_STYLE[status], className)}>{CAMPAIGN_STATUS_LABELS[status]}</span>;
}

const STAGE_STYLE: Record<SubmissionStage, { pill: string; dot: string }> = {
  draft: { pill: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", dot: "bg-amber-500" },
  submitted: { pill: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300", dot: "bg-lime-500" },
  registering: { pill: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300", dot: "bg-sky-500 animate-pulse" },
  "registration-failed": { pill: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300", dot: "bg-rose-500" },
  registered: { pill: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300", dot: "bg-lime-500" },
  published: { pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300", dot: "bg-emerald-500" },
};

export function SubmissionStageBadge({
  stage,
  className,
  dot = true,
}: {
  stage: SubmissionStage;
  className?: string;
  dot?: boolean;
}) {
  const s = STAGE_STYLE[stage];
  return (
    <span className={cn(PILL, s.pill, className)}>
      {dot && <span className={cn("size-1.5 rounded-full", s.dot)} />}
      {SUBMISSION_STAGE_LABELS[stage]}
    </span>
  );
}

const MK_STATE_STYLE: Record<MkOrderState | "legacy" | "none", { pill: string; label: string }> = {
  pending: { pill: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300", label: "Registering" },
  created: { pill: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300", label: "In Metakocka" },
  failed: { pill: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300", label: "Failed" },
  legacy: { pill: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300", label: "In Metakocka" },
  none: { pill: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", label: "No order" },
};

export function MkOrderStateBadge({
  state,
  className,
}: {
  state: MkOrderState | "legacy" | null | undefined;
  className?: string;
}) {
  const s = MK_STATE_STYLE[state ?? "none"];
  return <span className={cn(PILL, s.pill, className)}>{s.label}</span>;
}

export function VisibilityBadge({ published, className }: { published: boolean; className?: string }) {
  return (
    <span
      className={cn(
        PILL,
        published
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        className,
      )}
    >
      {published ? "Visible to customer" : "Hidden from customer"}
    </span>
  );
}

// Where a setting came from (campaign default / market / customer override).
const SOURCE_STYLE: Record<ConfigSource, string> = {
  campaign: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  market: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  customer: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300",
};

export function SourceBadge({
  source,
  label,
  className,
}: {
  source: ConfigSource;
  label?: string;
  className?: string;
}) {
  return <span className={cn(PILL, SOURCE_STYLE[source], className)}>{label ?? CONFIG_SOURCE_LABELS[source]}</span>;
}

// Market colours: the hex is what the SVG map paints with; the classes drive chips.
export const MARKET_COLORS: Record<MarketColor, { hex: string; chip: string; dot: string; ring: string }> = {
  sky: { hex: "#0ea5e9", chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300", dot: "bg-sky-500", ring: "ring-sky-500" },
  violet: { hex: "#8b5cf6", chip: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300", dot: "bg-violet-500", ring: "ring-violet-500" },
  amber: { hex: "#f59e0b", chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", dot: "bg-amber-500", ring: "ring-amber-500" },
  rose: { hex: "#f43f5e", chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300", dot: "bg-rose-500", ring: "ring-rose-500" },
  emerald: { hex: "#10b981", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300", dot: "bg-emerald-500", ring: "ring-emerald-500" },
  indigo: { hex: "#6366f1", chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300", dot: "bg-indigo-500", ring: "ring-indigo-500" },
  fuchsia: { hex: "#d946ef", chip: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-300", dot: "bg-fuchsia-500", ring: "ring-fuchsia-500" },
  teal: { hex: "#14b8a6", chip: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300", dot: "bg-teal-500", ring: "ring-teal-500" },
};

export function MarketChip({
  name,
  color,
  className,
}: {
  name: string;
  color: MarketColor;
  className?: string;
}) {
  const c = MARKET_COLORS[color];
  return (
    <span className={cn(PILL, c.chip, className)}>
      <span className={cn("size-1.5 rounded-full", c.dot)} />
      {name}
    </span>
  );
}
