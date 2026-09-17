"use client";

// Country inputs for the Markets & Customers page:
//   - CountryPicker: searchable multi-select for the market drawer — the list-based
//     replacement for "select countries on the map". Every option shows how many
//     directory customers sit in that country and, when it already belongs to
//     another market, which one (assigning it moves it — a country belongs to one
//     market).
//   - CountrySelect: searchable single-select for the customer drawer (campaign
//     country override, directory country fix).

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { Plus, X, Search, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EUROPE_ISO } from "@/lib/countries-client";
import { Flag } from "@/components/flag";
import { MARKET_COLORS } from "@/app/preorder/preorder-badges";
import type { PreorderMarket } from "@/types/preorder";
import type { CountryGeo } from "@/lib/preorder-customers";

export function CountryPicker({
  value,
  onChange,
  countryNames,
  stats,
  markets,
  currentMarketId,
}: {
  value: string[];
  onChange: (isos: string[]) => void;
  countryNames: Record<string, string>;
  stats: Record<string, CountryGeo>;
  markets: PreorderMarket[];
  currentMarketId: string | null;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const marketOf = useMemo(() => {
    const m = new Map<string, PreorderMarket>();
    for (const mk of markets) for (const iso of mk.countries) m.set(iso, mk);
    return m;
  }, [markets]);

  // Candidates: not yet picked; customers-first so the useful ones surface on an
  // empty query, then alphabetical.
  const options = useMemo(() => {
    const picked = new Set(value);
    const needle = q.trim().toLowerCase();
    return Object.entries(countryNames)
      .filter(([iso, name]) => !picked.has(iso) && (!needle || name.toLowerCase().includes(needle) || iso.toLowerCase() === needle))
      .map(([iso, name]) => ({ iso, name, customers: stats[iso]?.customers ?? 0, market: marketOf.get(iso) ?? null }))
      .sort((a, b) => b.customers - a.customers || a.name.localeCompare(b.name))
      .slice(0, needle ? 12 : 8);
  }, [countryNames, value, q, stats, marketOf]);

  useEffect(() => setActive(0), [q, open]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const add = (iso: string) => {
    if (!value.includes(iso)) onChange([...value, iso]);
    setQ("");
  };
  const remove = (iso: string) => onChange(value.filter((c) => c !== iso));

  const europeMissing = EUROPE_ISO.filter((iso) => !value.includes(iso) && (stats[iso]?.customers ?? 0) > 0 && (!marketOf.get(iso) || marketOf.get(iso)!.id === currentMarketId));

  return (
    <div ref={rootRef} className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[34px] rounded-lg border border-border bg-surface p-2">
        {value.length === 0 && <span className="text-[12px] text-muted-foreground px-1 py-0.5">No countries yet — search below to add some.</span>}
        {value.map((iso) => {
          const other = marketOf.get(iso);
          const moved = other && other.id !== currentMarketId;
          return (
            <span key={iso} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", moved ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" : "bg-muted text-foreground")} title={moved ? `Also in ${other.name} — the market with higher priority wins` : undefined}>
              <Flag iso={iso} /> {countryNames[iso] ?? iso}
              <span className="text-[10px] font-normal opacity-70 tabular-nums">{stats[iso]?.customers ?? 0}</span>
              <button type="button" onClick={() => remove(iso)} className="opacity-60 hover:opacity-100" aria-label={`Remove ${iso}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && options[active]) {
              e.preventDefault();
              add(options[active].iso);
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Add a country — type a name or ISO code…"
          className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-[12px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        {open && options.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
            {options.map((o, i) => (
              <button
                key={o.iso}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => add(o.iso)}
                className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px]", i === active ? "bg-muted" : "hover:bg-muted/60")}
              >
                <Flag iso={o.iso} className="text-[14px]" />
                <span className="font-medium text-foreground truncate">{o.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{o.iso}</span>
                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{o.customers} customer{o.customers === 1 ? "" : "s"}</span>
                {o.market && o.market.id !== currentMarketId && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300">
                    <span className="size-1.5 rounded-full" style={{ background: MARKET_COLORS[o.market.color].hex }} /> also in {o.market.name}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {europeMissing.length > 0 && (
        <button type="button" onClick={() => onChange([...value, ...europeMissing])} className="inline-flex items-center gap-1 text-[11px] font-medium text-lime-700 dark:text-lime-400 hover:underline">
          <Plus className="w-3 h-3" /> Add every unassigned European country with customers ({europeMissing.length})
        </button>
      )}
    </div>
  );
}

// Searchable single-select of one country (or a "none" option such as "From
// Metakocka"). A plain <Select> with ~250 options is unusable — you cannot type
// to find "Slovenia" — so this is a popover with a search box: type a name or ISO
// code, arrow keys + Enter pick, Escape closes.
type CountryOpt = { iso: string | null; label: string };

export function CountrySelect({
  value,
  onChange,
  countryNames,
  noneLabel,
  placeholder = "Select a country…",
  className,
  disabled,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  countryNames: Record<string, string>;
  // When set, a first option that maps to `null` (e.g. "From Metakocka").
  noneLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  // Enter only picks after the user typed or arrowed — never the first
  // alphabetical country on an untouched list.
  const [intent, setIntent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo<CountryOpt[]>(() => {
    const needle = q.trim().toLowerCase();
    const countries = Object.entries(countryNames)
      .filter(([iso, name]) => !needle || name.toLowerCase().includes(needle) || iso.toLowerCase().startsWith(needle))
      .sort((a, b) => {
        // Prefix matches first so "sl" lists Slovakia / Slovenia before "Iceland".
        const ap = a[1].toLowerCase().startsWith(needle) ? 0 : 1;
        const bp = b[1].toLowerCase().startsWith(needle) ? 0 : 1;
        return ap - bp || a[1].localeCompare(b[1]);
      })
      .map(([iso, name]) => ({ iso, label: name }));
    const none: CountryOpt[] =
      noneLabel && (!needle || noneLabel.toLowerCase().includes(needle)) ? [{ iso: null, label: noneLabel }] : [];
    return [...none, ...countries];
  }, [countryNames, q, noneLabel]);

  useEffect(() => {
    setActive(0);
    if (q) setIntent(true);
  }, [q]);
  useEffect(() => {
    if (!open) {
      setQ("");
      setIntent(false);
      return;
    }
    // Start on the current value so Enter without typing keeps it.
    const idx = options.findIndex((o) => o.iso === value);
    setActive(idx >= 0 ? idx : 0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (o: CountryOpt) => {
    onChange(o.iso);
    setOpen(false);
  };

  const current = value ? (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Flag iso={value} className="text-[14px]" />
      <span className="truncate">{countryNames[value] ?? value}</span>
    </span>
  ) : (noneLabel ?? null);

  return (
    // `modal` so the popover registers its own scroll lock — inside a Radix Dialog
    // the dialog's lock otherwise swallows wheel events on the portaled list.
    <Popover.Root open={open} onOpenChange={setOpen} modal>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-[12px] whitespace-nowrap shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
            className,
          )}
        >
          <span className={cn("truncate", !current && "text-muted-foreground")}>{current ?? placeholder}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[220px] rounded-lg border border-border bg-background shadow-lg overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="relative border-b border-border">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setIntent(true);
                  setActive((a) => Math.min(options.length - 1, a + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setIntent(true);
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (intent && options[active]) pick(options[active]);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder="Type a country name or ISO code…"
              className="h-8 w-full bg-transparent pl-8 pr-2 text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} className="max-h-60 overflow-y-auto py-1">
            {options.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">No country matches &ldquo;{q}&rdquo;.</div>
            )}
            {options.map((o, i) => (
              <button
                key={o.iso ?? "__none__"}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px]",
                  i === active ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <span className="w-5 flex justify-center">{o.iso ? <Flag iso={o.iso} className="text-[14px]" /> : null}</span>
                <span className={cn("truncate", o.iso ? "text-foreground" : "text-muted-foreground")}>{o.label}</span>
                {o.iso && <span className="ml-auto text-[10px] font-mono text-muted-foreground">{o.iso}</span>}
                {o.iso === value && <Check className="w-3.5 h-3.5 text-teal-500 shrink-0" />}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
