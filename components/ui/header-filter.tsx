"use client";

// components/ui/header-filter.tsx
//
// A table column heading that IS the column's filter. Reads as a normal heading
// with a faint funnel glyph (so it is discoverable), opens a dropdown anchored
// below it, and once something is picked turns green and shows the pick as a
// chip. `value === "all"` means unfiltered; the first item always clears.
// Use it wherever a list has per-column filters — one look across the admin.

import * as React from "react";
import { ListFilter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type HeaderFilterOption = { value: string; label: React.ReactNode; count?: number };

export function HeaderFilter({
  label,
  value,
  onChange,
  options,
  align = "start",
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: HeaderFilterOption[];
  align?: "start" | "end";
  className?: string;
}) {
  const active = value !== "all";
  const picked = options.find((o) => o.value === value);
  return (
    <Select value={value} onValueChange={onChange}>
      {/* Custom trigger content — SelectValue would echo the "All" row. */}
      <SelectTrigger
        size="sm"
        aria-label={`Filter by ${label.toLowerCase()}`}
        title={`Filter by ${label.toLowerCase()}`}
        className={cn(
          "group/h h-7 max-w-full gap-1.5 rounded-md border-0 bg-transparent px-1.5 -ml-1.5 shadow-none",
          "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring dark:bg-transparent dark:hover:bg-muted",
          "[&>svg:last-child]:hidden", // the default chevron; the funnel below stands in for it
          align === "end" && "ml-auto -mr-1.5 flex-row-reverse",
          className,
        )}
      >
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider",
            active ? "text-lime-700 dark:text-lime-400" : "text-muted-foreground group-hover/h:text-foreground",
          )}
        >
          {label}
        </span>
        {active && picked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-lime-500/12 text-lime-700 dark:text-lime-400 px-1.5 h-5 text-[11px] font-medium normal-case tracking-normal max-w-[10rem] truncate">
            {picked.label}
          </span>
        ) : (
          <ListFilter className="size-3 text-muted-foreground/45 group-hover/h:text-muted-foreground group-data-[state=open]/h:text-muted-foreground transition-colors" />
        )}
      </SelectTrigger>
      <SelectContent position="popper" align={align} sideOffset={4} className="min-w-[12rem]">
        <SelectItem value="all" className="text-[12px]">
          <span className="text-muted-foreground">All</span>
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-[12px]">
            {o.label}
            {o.count !== undefined && <span className="ml-1 text-muted-foreground tabular-nums">· {o.count}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
