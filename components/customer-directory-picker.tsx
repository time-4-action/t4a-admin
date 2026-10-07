"use client";

// components/customer-directory-picker.tsx
//
// Search the Metakocka customer directory (GET /api/admin/preorder/customers) and
// pick customers: chips of what is picked + a search box with a short result list.
// `max={1}` makes it a single pick (the chip replaces the previous one). Same look
// as the market modal's customer picker.

import { useEffect, useRef, useState } from "react";
import { Building2, User, X } from "lucide-react";
import { TagField } from "@/components/ui/tag-field";
import { cn } from "@/lib/utils";
import type { MkCustomerView } from "@/lib/mk-customers";

export type PickedCustomer = { partnerMkId: string; partnerName: string };

export function CustomerDirectoryPicker({
  value,
  onChange,
  max,
  exclude = [],
  hint,
  placeholder = "Type a name, email or VAT id…",
}: {
  value: PickedCustomer[];
  onChange: (v: PickedCustomer[]) => void;
  max?: number;
  // Ids that may not be picked (e.g. the agent itself), with an optional reason per id.
  exclude?: string[];
  // A note shown beside a result (e.g. "already an agent").
  hint?: (c: MkCustomerView) => string | null;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MkCustomerView[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/preorder/customers?q=${encodeURIComponent(query)}&pageSize=10`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => !cancelled && setResults((j.items ?? []) as MkCustomerView[]))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);
  useEffect(() => setActive(0), [results]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const blocked = new Set([...value.map((c) => c.partnerMkId), ...exclude]);
  const options = results.filter((c) => !blocked.has(c.partnerMkId));
  const add = (c: MkCustomerView) => {
    const next = { partnerMkId: c.partnerMkId, partnerName: c.name };
    onChange(max === 1 ? [next] : max && value.length >= max ? value : [...value, next]);
    setQ("");
    setOpen(false);
  };
  const remove = (id: string) => onChange(value.filter((c) => c.partnerMkId !== id));

  return (
    <div ref={rootRef} className="relative">
      <TagField
        inputRef={inputRef}
        chips={value.map((c) => ({
          key: c.partnerMkId,
          node: (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 h-6 text-[11px] font-medium text-foreground max-w-[16rem]">
              <span className="truncate">{c.partnerName || c.partnerMkId}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(c.partnerMkId);
                }}
                className="opacity-60 hover:opacity-100 shrink-0"
                aria-label={`Remove ${c.partnerName}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ),
        }))}
        onRemoveAt={(i) => remove(value[i].partnerMkId)}
        value={q}
        onChange={(v) => {
          setQ(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
            return true;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
            return true;
          }
          if (e.key === "Enter" && q.trim() && options[active]) {
            e.preventDefault();
            add(options[active]);
            return true;
          }
          if (e.key === "Escape") {
            setOpen(false);
            return true;
          }
          return false;
        }}
        placeholder={value.length && max === 1 ? "Search to replace…" : placeholder}
      />
      <div className="relative">
        {open && q.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
            {loading && <div className="px-3 py-2 text-[12px] text-muted-foreground">Searching…</div>}
            {!loading && options.length === 0 && <div className="px-3 py-2 text-[12px] text-muted-foreground">No customers match.</div>}
            {options.map((c, i) => {
              const note = hint?.(c);
              return (
                <button
                  key={c.partnerMkId}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(c)}
                  className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-left", i === active ? "bg-muted" : "hover:bg-muted/60")}
                >
                  <span
                    className={cn(
                      "size-6 rounded-md flex items-center justify-center shrink-0",
                      c.taxId ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {c.taxId ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-foreground truncate">{c.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {[c.email, c.city, c.countCode].filter(Boolean).join(" · ") || c.partnerMkId}
                    </span>
                  </span>
                  {note && <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">{note}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
