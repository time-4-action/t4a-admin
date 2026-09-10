"use client";
import * as React from "react";
import { Calendar, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

// A self-contained date (+ optional time) picker styled to the app design system.
// `value` / `onChange` are ISO strings (or null). No external date library.

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]; // Monday-first (European)
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Days to render for a month grid, Monday-first, padded to full weeks.
function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DatePicker({
  value,
  onChange,
  withTime = false,
  placeholder = "Pick a date",
  className,
  triggerClassName,
  align = "start",
}: {
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  withTime?: boolean;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const selected = value ? new Date(value) : null;
  const valid = selected && !Number.isNaN(selected.getTime()) ? selected : null;

  // Which month the calendar is currently showing.
  const [view, setView] = React.useState(() => {
    const base = valid ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  // Re-sync the visible month to the value whenever the popover opens.
  React.useEffect(() => {
    if (open && valid) setView({ year: valid.getFullYear(), month: valid.getMonth() });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click / Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const today = new Date();
  const cells = monthGrid(view.year, view.month);

  const timeStr = valid
    ? `${String(valid.getHours()).padStart(2, "0")}:${String(valid.getMinutes()).padStart(2, "0")}`
    : "00:00";

  function pickDay(day: Date) {
    const next = new Date(day);
    if (withTime && valid) {
      next.setHours(valid.getHours(), valid.getMinutes(), 0, 0);
    } else if (!withTime) {
      next.setHours(0, 0, 0, 0);
    }
    onChange(next.toISOString());
    if (!withTime) setOpen(false);
  }

  function setTime(hhmm: string) {
    const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
    const base = valid ?? new Date();
    const next = new Date(base);
    next.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
    onChange(next.toISOString());
  }

  const label = valid
    ? valid.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
      })
    : null;

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-2 h-7 rounded-md border border-input bg-background px-2.5 text-xs transition-colors hover:border-ring/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none",
          !label && "text-muted-foreground",
          triggerClassName,
        )}
      >
        <Calendar className="w-3.5 h-3.5 opacity-60 shrink-0" />
        <span className="tabular-nums">{label ?? placeholder}</span>
        {label && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="ml-0.5 -mr-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1.5 w-64 rounded-xl border border-border bg-surface p-3 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {/* Month header */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[13px] font-medium">
              {MONTHS[view.month]} {view.year}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[10px] font-medium uppercase text-muted-foreground py-0.5">
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />;
              const isSelected = valid && sameDay(day, valid);
              const isToday = sameDay(day, today);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={cn(
                    "h-7 rounded-md text-[12px] tabular-nums transition-colors",
                    isSelected
                      ? "bg-lime-600 text-white font-semibold hover:bg-lime-600"
                      : "hover:bg-muted text-foreground",
                    !isSelected && isToday && "ring-1 ring-inset ring-lime-500/50 font-medium",
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {withTime && (
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-[11px] text-muted-foreground">Time</span>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTime(e.target.value)}
                className="ml-auto h-7 rounded-md border border-input bg-background px-2 text-[12px] tabular-nums focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none [&::-webkit-calendar-picker-indicator]:opacity-60"
              />
            </div>
          )}

          <div className="mt-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                if (!withTime) now.setHours(0, 0, 0, 0);
                onChange(now.toISOString());
                setView({ year: now.getFullYear(), month: now.getMonth() });
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-lime-600 dark:text-lime-400 hover:underline"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
