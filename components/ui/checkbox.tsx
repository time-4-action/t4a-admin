"use client";

// A styled checkbox: a real <input type="checkbox"> for accessibility, drawn as a
// rounded box with a lime tick. Use `CheckboxRow` for the common "box + title +
// hint" option row.
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <span className={cn("relative inline-flex size-4 shrink-0", className)}>
      <input type="checkbox" {...props} className="peer absolute inset-0 size-4 cursor-pointer opacity-0 disabled:cursor-not-allowed" />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none size-4 rounded-[5px] border border-input bg-background transition-colors",
          "peer-hover:border-foreground/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1",
          "peer-checked:border-lime-600 peer-checked:bg-lime-600 peer-disabled:opacity-50",
          "flex items-center justify-center",
        )}
      >
        <Check className="size-3 text-white opacity-0 transition-opacity peer-checked:opacity-100 [.peer:checked~&]:opacity-100" strokeWidth={3} />
      </span>
    </span>
  );
}

export function CheckboxRow({
  checked,
  onCheckedChange,
  title,
  hint,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  title: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors select-none",
        checked ? "border-lime-500/60 bg-lime-50/60 dark:bg-lime-950/20" : "border-border hover:bg-muted/40",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
    >
      <Checkbox checked={checked} disabled={disabled} onChange={(e) => onCheckedChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-foreground leading-tight">{title}</span>
        {hint && <span className="block text-[11px] text-muted-foreground mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}
