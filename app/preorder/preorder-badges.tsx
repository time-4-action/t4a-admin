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

// ── Resolver warnings, in plain English ──────────────────────────────────────
// lib/preorder-effective.ts reports machine codes ("vat-missing:DE",
// "unpriced:<sku>", …). Group the per-product ones and spell every code out so
// an admin reads a sentence, not a log line.
export function describeWarnings(codes: string[]): string[] {
  const out: string[] = [];
  const grouped: Record<string, string[]> = {};
  let extra: Record<string, number> = {};
  for (const w of codes) {
    const i = w.indexOf(":");
    const kind = i === -1 ? w : w.slice(0, i);
    const arg = i === -1 ? "" : w.slice(i + 1);
    if (kind === "price-missing" || kind === "unpriced" || kind === "stale-assortment-id") {
      const more = /^\+(\d+) more$/.exec(arg);
      if (more) extra = { ...extra, [kind]: Number(more[1]) };
      else (grouped[kind] ??= []).push(arg);
      continue;
    }
    switch (kind) {
      case "vat-missing":
        out.push(
          arg === "no-country"
            ? "No VAT rate: the customer's country is unknown and no fallback rate is set — an individual cannot submit."
            : `No VAT rate configured for ${arg} (and no fallback) — individuals there cannot submit. Set it under Preorder → VAT rates or override it on the campaign.`,
        );
        break;
      case "kind-unknown":
        out.push("Company or individual is unknown for this customer — treated as a company (0% VAT).");
        break;
      case "market-missing":
        out.push("The market pinned on this customer's rule no longer exists — matched by country instead.");
        break;
      case "price-book-missing":
        out.push(`No price book for the "${arg}" price list — sheet prices are used. Refresh the price books.`);
        break;
      case "currency-mismatch":
        out.push(`Price book currency differs from the effective currency (${arg}) — no conversion is applied.`);
        break;
      default:
        out.push(w);
    }
  }
  const list = (kind: string) => {
    const items = grouped[kind] ?? [];
    const n = items.length + (extra[kind] ?? 0);
    const shown = items.slice(0, 5).join(", ");
    return { n, tail: shown + (n > 5 ? `, … (+${n - 5} more)` : "") };
  };
  if (grouped["unpriced"]) {
    const { n, tail } = list("unpriced");
    out.push(`${n} product${n === 1 ? " has" : "s have"} no price at all and cannot be ordered — fill the partner price on the sheet to offer ${n === 1 ? "it" : "them"}: ${tail}.`);
  }
  if (grouped["price-missing"]) {
    const { n, tail } = list("price-missing");
    out.push(`${n} product${n === 1 ? " is" : "s are"} not in the price book — sheet price used: ${tail}.`);
  }
  if (grouped["stale-assortment-id"]) {
    const { n } = list("stale-assortment-id");
    out.push(`${n} assortment rule${n === 1 ? "" : "s"} point${n === 1 ? "s" : ""} at rows that no longer exist.`);
  }
  return out;
}

export function WarningList({ codes, className }: { codes: string[]; className?: string }) {
  const lines = describeWarnings(codes);
  if (lines.length === 0) return null;
  return (
    <ul className={cn("space-y-1", className)}>
      {lines.map((l, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className="mt-[7px] size-1 rounded-full bg-current shrink-0" />
          <span>{l}</span>
        </li>
      ))}
    </ul>
  );
}
