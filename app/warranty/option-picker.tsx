"use client";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Check, X, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerOption = { value: string; label: string };

const ROW_BASE =
  "flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none";

/**
 * Generic searchable modal picker for a single-select enum field (warranty
 * type, suggestion, factory / customer status, …). Self-contained trigger +
 * dialog. `value` / `onSelect` use the option value, or `null` for "not set".
 */
export function OptionPicker({
  title,
  value,
  options,
  onSelect,
  placeholder = "Not set",
}: {
  title: string;
  value: string | null;
  options: PickerOption[];
  onSelect: (value: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        o.value.toLowerCase().includes(term),
    );
  }, [options, q]);

  function choose(next: string | null) {
    onSelect(next);
    setOpen(false);
    setQ("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-[13px] transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown
          className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQ("");
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-4 pt-4 pb-3">
            <DialogTitle className="text-[15px]">{title}</DialogTitle>
          </DialogHeader>

          <div className="border-b border-border px-4 py-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="h-9 pl-8 text-[13px]"
              />
            </div>
          </div>

          <div className="max-h-[min(60vh,340px)] overflow-y-auto py-1.5">
            <button
              type="button"
              className={ROW_BASE}
              onClick={() => choose(null)}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                <X className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="flex-1 text-[13px] text-muted-foreground italic">
                {placeholder}
              </span>
              {value == null && (
                <Check className="h-4 w-4 text-primary" aria-hidden />
              )}
            </button>

            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                No matches for “{q}”.
              </p>
            ) : (
              filtered.map((o) => {
                const isSel = value === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    className={cn(ROW_BASE, isSel && "bg-muted/40")}
                    onClick={() => choose(o.value)}
                  >
                    <span className="flex-1 truncate text-[13px] text-foreground">
                      {o.label}
                    </span>
                    {isSel && (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
