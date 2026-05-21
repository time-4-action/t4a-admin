import { cn } from "@/lib/utils";
import { WARRANTY_STATUS_LABELS, type WarrantyStatus } from "@/types/warranty";

const STATUS_STYLES: Record<WarrantyStatus, string> = {
  open: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-600/50",
  in_review:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/50",
  decided:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-700/50",
  to_send_new_product:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-700/50",
  finished:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/50",
};

export const STATUS_COLUMN_HEADER: Record<WarrantyStatus, string> = {
  open: "border-slate-300 bg-slate-50/60 dark:bg-slate-800/30 dark:border-slate-700",
  in_review: "border-amber-300 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-700",
  decided: "border-sky-300 bg-sky-50/60 dark:bg-sky-950/30 dark:border-sky-700",
  to_send_new_product:
    "border-violet-300 bg-violet-50/60 dark:bg-violet-950/30 dark:border-violet-700",
  finished: "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-700",
};

export function WarrantyStatusBadge({
  status,
  className,
  size = "default",
}: {
  status: WarrantyStatus;
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-semibold rounded-full border whitespace-nowrap",
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-[11px] px-2.5 py-1",
        STATUS_STYLES[status],
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {WARRANTY_STATUS_LABELS[status]}
    </span>
  );
}
