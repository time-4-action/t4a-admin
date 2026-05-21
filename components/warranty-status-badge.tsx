import { cn } from "@/lib/utils";
import { WARRANTY_STATUS_LABELS, type WarrantyStatus } from "@/types/warranty";

const STATUS_STYLES: Record<WarrantyStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700/50",
  in_review:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/50",
  approved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/50",
  rejected:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-700/50",
  shipped:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-700/50",
};

export function WarrantyStatusBadge({
  status,
  className,
}: {
  status: WarrantyStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap",
        STATUS_STYLES[status],
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {WARRANTY_STATUS_LABELS[status]}
    </span>
  );
}
