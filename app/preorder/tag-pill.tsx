// app/preorder/tag-pill.tsx — the row tag pill ("NEW", "PRE", "SALE", …), shared by
// the sheet builder and every customer-facing sheet view. A tag may carry a colour
// (`row.tagColor`, a #rrggbb hex set in the builder, the same for every row with that
// tag); without one it keeps the house lime style.
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { tagLabel, type PreorderRow } from "@/types/preorder";

export const TAG_COLORS = [
  "#65a30d", // lime
  "#059669", // emerald
  "#0284c7", // sky
  "#2563eb", // blue
  "#7c3aed", // violet
  "#db2777", // pink
  "#dc2626", // red
  "#ea580c", // orange
  "#d97706", // amber
  "#111827", // black
];

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}

// Black or white text, whichever reads better on the background.
function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111827" : "#ffffff";
}

const SIZES = {
  sm: "text-[10px] px-1.5 py-0.5 rounded",
  md: "text-[11px] px-2 py-1 rounded-md",
  lg: "text-[12px] px-2.5 py-1 rounded-md shadow-sm",
} as const;

export function tagPillStyle(color: string | null | undefined): { className: string; style?: CSSProperties } {
  if (isHexColor(color)) return { className: "", style: { backgroundColor: color, color: textOn(color) } };
  return { className: "text-lime-800 bg-lime-100 dark:bg-lime-900/60 dark:text-lime-200" };
}

export function TagPill({
  tag,
  color,
  size = "sm",
  className,
}: {
  tag?: PreorderRow["tag"];
  color?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const label = tagLabel(tag);
  if (!label) return null;
  const s = tagPillStyle(color);
  return (
    <span
      className={cn("inline-flex items-center font-bold uppercase tracking-wide leading-none whitespace-nowrap shrink-0", SIZES[size], s.className, className)}
      style={s.style}
    >
      {label}
    </span>
  );
}
