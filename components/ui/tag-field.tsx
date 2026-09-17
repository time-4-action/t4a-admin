"use client";

// components/ui/tag-field.tsx
//
// A tag input: chips and the text caret share one field, and the caret can be
// moved BETWEEN chips like in a real text field. ← / → (with nothing typed)
// walk the caret across the chips, Backspace removes the chip before it,
// Delete the chip after it, clicking a chip puts the caret in front of it.
// The owner renders the chips and owns the search text; this only positions.

import * as React from "react";
import { cn } from "@/lib/utils";

export type TagFieldChip = { key: string; node: React.ReactNode };

export function TagField({
  chips,
  onRemoveAt,
  value,
  onChange,
  onKeyDown,
  onFocus,
  placeholder,
  inputRef,
  className,
  inputClassName,
}: {
  chips: TagFieldChip[];
  onRemoveAt: (index: number) => void;
  value: string;
  onChange: (v: string) => void;
  /** Keys the owner handles (Enter, arrows for the dropdown, Escape). Return true when handled. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => boolean | void;
  onFocus?: () => void;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
  inputClassName?: string;
}) {
  const localRef = React.useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  // Where the caret sits among the chips: 0 = before the first, chips.length = after the last.
  const [caret, setCaret] = React.useState(chips.length);
  // Chips arriving (initial load, a pick) put the caret at the end; chips
  // leaving only clamp it. The caret moves elsewhere only by key or click.
  const prevLen = React.useRef(chips.length);
  React.useEffect(() => {
    if (chips.length > prevLen.current) setCaret(chips.length);
    else setCaret((c) => Math.min(c, chips.length));
    prevLen.current = chips.length;
  }, [chips.length]);

  const focus = () => ref.current?.focus();
  // Clicking the empty part of the field = "type at the end".
  const focusAtEnd = () => {
    setCaret(chips.length);
    focus();
  };
  const before = chips.slice(0, caret);
  const after = chips.slice(caret);

  const chip = (c: TagFieldChip, index: number) => (
    <span
      key={c.key}
      onClick={(e) => {
        e.stopPropagation();
        setCaret(index);
        focus();
      }}
      className="inline-flex"
    >
      {c.node}
    </span>
  );

  return (
    <div
      onClick={focusAtEnd}
      className={cn(
        "flex flex-wrap items-center gap-1.5 min-h-[40px] rounded-lg border border-input bg-background px-2 py-1.5 cursor-text",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        className,
      )}
    >
      {before.map((c, i) => chip(c, i))}
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (onKeyDown?.(e)) return;
          const el = e.currentTarget;
          const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
          const atEnd = el.selectionStart === value.length && el.selectionEnd === value.length;
          if (e.key === "ArrowLeft" && atStart && caret > 0) {
            e.preventDefault();
            setCaret((c) => c - 1);
          } else if (e.key === "ArrowRight" && atEnd && caret < chips.length) {
            e.preventDefault();
            setCaret((c) => c + 1);
          } else if (e.key === "Backspace" && value === "" && caret > 0) {
            e.preventDefault();
            onRemoveAt(caret - 1);
            setCaret((c) => c - 1);
          } else if (e.key === "Delete" && value === "" && caret < chips.length) {
            e.preventDefault();
            onRemoveAt(caret);
          } else if (e.key === "Home" && value === "") {
            e.preventDefault();
            setCaret(0);
          } else if (e.key === "End" && value === "") {
            e.preventDefault();
            setCaret(chips.length);
          }
        }}
        placeholder={chips.length === 0 ? placeholder : after.length === 0 ? "Add another…" : ""}
        // At the end the input takes the rest of the line; between chips it only
        // needs room for what is typed, so the chips after it stay on the same line.
        style={after.length ? { width: `${Math.max(1, value.length) + 1}ch` } : undefined}
        className={cn("h-6 bg-transparent px-1 text-[12.5px] outline-none placeholder:text-muted-foreground/60", after.length === 0 && "min-w-[120px] flex-1", inputClassName)}
      />
      {after.map((c, i) => chip(c, caret + i))}
    </div>
  );
}
