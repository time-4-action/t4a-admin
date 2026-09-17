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

// Market colours = the Patrik International brand palette (patrikinternational.com
// stylesheet): brand blue, cyan, navy, steel, magenta, pink, orange, red. The
// keys are what is stored on a market — they predate the palette, so a key like
// "emerald" is just a slot; `label` is what people see. Chips are painted
// inline from the hex so light and dark mode both use the real brand colour.
export const MARKET_COLORS: Record<MarketColor, { hex: string; label: string }> = {
  sky: { hex: "#2786b4", label: "Patrik blue" },
  teal: { hex: "#01a0be", label: "Cyan" },
  indigo: { hex: "#083080", label: "Navy" },
  violet: { hex: "#43609c", label: "Steel" },
  rose: { hex: "#b3004b", label: "Magenta" },
  fuchsia: { hex: "#ff1a7b", label: "Pink" },
  amber: { hex: "#ff8a3c", label: "Orange" },
  emerald: { hex: "#e91b23", label: "Red" },
};

// Chip styling from a brand hex: tinted background, coloured text and dot.
export function marketChipStyle(color: MarketColor): React.CSSProperties {
  const hex = MARKET_COLORS[color].hex;
  return { background: `${hex}1f`, color: hex };
}

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
    <span className={cn(PILL, "dark:brightness-125", className)} style={marketChipStyle(color)}>
      <span className="size-1.5 rounded-full" style={{ background: c.hex }} />
      {name}
    </span>
  );
}
