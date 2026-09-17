"use client";

// Campaign "Pricing & VAT" editor: per-country VAT rate overrides for THIS campaign
// over the global table (Preorder → VAT rates). Every country shows what it
// inherits — the global rate, the fallback, or nothing — with a Global / Campaign
// override badge and an Override / Reset to global toggle. Explicit Save.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Percent, Save, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorModal, EditorModalBody, EditorModalFooter, EditorModalHeader } from "@/components/ui/editor-modal";
import { Skeleton, stagger } from "@/components/ui/skeleton";
import { Flag } from "@/components/flag";
import { OverrideToggle } from "@/app/preorder/[campaignId]/markets/commercial-config-form";
import { fmtVatRate, normalizeVatRate, type VatOverride, type VatRateMap } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type GlobalVat = { settings: { rates: VatRateMap; fallbackRate: number | null }; countries: Record<string, string> };

type Filter = "all" | "overridden" | "rated";

export function VatModal({
  open,
  onOpenChange,
  campaignId,
  overrides,
  marketCountries,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  overrides: VatOverride[];
  marketCountries: string[]; // countries the campaign's markets mention — listed first
  onSaved: (overrides: VatOverride[]) => void;
}) {
  const [global, setGlobal] = useState<GlobalVat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({}); // iso → rate text (presence = override)
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!open) return;
    const d: Record<string, string> = {};
    for (const o of overrides) d[o.iso] = String(o.rate);
    setDraft(d);
    setError(null);
    setQ("");
    let alive = true;
    fetch("/api/admin/preorder/vat")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Could not load the global VAT rates (${r.status})`);
        return (await r.json()) as GlobalVat;
      })
      .then((g) => alive && setGlobal(g))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [open, overrides]);

  const saved = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of overrides) m[o.iso] = o.rate;
    return m;
  }, [overrides]);

  const invalid = useMemo(
    () => Object.entries(draft).filter(([, v]) => normalizeVatRate(v) === null).map(([iso]) => iso),
    [draft],
  );
  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(draft), ...Object.keys(saved)]);
    for (const k of keys) {
      if (!(k in draft) !== !(k in saved)) return true;
      if (k in draft && normalizeVatRate(draft[k]) !== saved[k]) return true;
    }
    return false;
  }, [draft, saved]);

  const marketSet = useMemo(() => new Set(marketCountries.map((c) => c.toUpperCase())), [marketCountries]);

  const rows = useMemo(() => {
    if (!global) return [];
    const needle = q.trim().toLowerCase();
    const rank = (iso: string) => (iso in draft ? 0 : marketSet.has(iso) ? 1 : global.settings.rates[iso] != null ? 2 : 3);
    return Object.entries(global.countries)
      .map(([iso, name]) => ({ iso, name }))
      .filter((c) => {
        if (filter === "overridden" && !(c.iso in draft)) return false;
        if (filter === "rated" && global.settings.rates[c.iso] == null && !(c.iso in draft)) return false;
        if (!needle) return true;
        return c.name.toLowerCase().includes(needle) || c.iso.toLowerCase().includes(needle);
      })
      .sort((a, b) => rank(a.iso) - rank(b.iso) || a.name.localeCompare(b.name));
  }, [global, q, filter, draft, marketSet]);

  async function save() {
    if (!dirty || saving || invalid.length) return;
    setSaving(true);
    setError(null);
    try {
      const vatOverrides = Object.entries(draft)
        .map(([iso, v]) => ({ iso, rate: normalizeVatRate(v) }))
        .filter((o): o is VatOverride => o.rate !== null);
      const res = await fetch(`/api/admin/preorder/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vatOverrides }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`);
      onSaved((data.campaign?.vatOverrides as VatOverride[] | undefined) ?? vatOverrides);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const overrideCount = Object.keys(draft).length;

  return (
    <EditorModal open={open} onOpenChange={onOpenChange} sizeClassName="w-[min(880px,calc(100vw-2rem))] h-[min(760px,calc(100vh-2rem))]">
      <EditorModalHeader
        leading={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lime-500/10 text-lime-700 dark:text-lime-400">
            <Percent className="size-4" />
          </span>
        }
        title="Pricing & VAT"
        description={
          <>
            Companies pay <span className="text-foreground font-medium">partner prices excl. VAT (0%)</span>; individuals pay the{" "}
            <span className="text-foreground font-medium">RRP incl. their country&apos;s VAT</span>, extracted from the price — never added. Rates
            come from the global table; override a country here for this campaign only.
          </>
        }
      />

      <EditorModalBody className="flex flex-col overflow-hidden">
        <div className="shrink-0 flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border/60 bg-muted/30">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country or code…" className="h-8 pl-8 text-[12px]" />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center rounded-lg bg-muted p-0.5 gap-0.5">
            {(
              [
                ["all", "All"],
                ["rated", "With a rate"],
                ["overridden", `Overridden (${overrideCount})`],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors",
                  filter === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-xl border border-rose-300/60 bg-rose-50 dark:bg-rose-950/30 px-4 py-2.5 text-[12px] text-rose-700 dark:text-rose-300 flex gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <div className="hidden md:grid grid-cols-[1fr_170px_150px_130px] gap-3 px-6 py-2 border-b border-border/60 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          <span>Country</span>
          <span>Inherits</span>
          <span>This campaign</span>
          <span />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/50">
          {!global ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_170px_150px_130px] gap-3 items-center px-6 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="w-5 h-4 rounded-[3px]" delay={stagger(i)} />
                  <Skeleton className="h-3.5 w-36" delay={stagger(i)} />
                </div>
                <Skeleton className="h-3.5 w-24" delay={stagger(i)} />
                <Skeleton className="h-3.5 w-16" delay={stagger(i)} />
                <Skeleton className="h-8 w-24 ml-auto rounded-md" delay={stagger(i)} />
              </div>
            ))
          ) : rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-[12px] text-muted-foreground">No country matches.</p>
          ) : (
            rows.map((c) => {
              const overridden = c.iso in draft;
              const globalRate = global.settings.rates[c.iso];
              const inherited: { text: string; tone: string; label: "Global" | "Fallback" | "Missing" } =
                globalRate != null
                  ? { text: fmtVatRate(globalRate), tone: "text-foreground", label: "Global" }
                  : global.settings.fallbackRate != null
                    ? { text: `${fmtVatRate(global.settings.fallbackRate)} fallback`, tone: "text-foreground", label: "Fallback" }
                    : { text: "not configured", tone: "text-amber-700 dark:text-amber-300", label: "Missing" };
              const bad = overridden && normalizeVatRate(draft[c.iso]) === null;
              return (
                <div
                  key={c.iso}
                  className={cn(
                    "grid grid-cols-[1fr_170px_150px_130px] gap-3 items-center px-6 py-2",
                    overridden && "bg-lime-50/50 dark:bg-lime-950/20",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Flag iso={c.iso} className="text-[15px]" />
                    <span className="text-[13px] text-foreground truncate">{c.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{c.iso}</span>
                    {marketSet.has(c.iso) && (
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/40 rounded px-1 py-px">market</span>
                    )}
                  </div>
                  <div className="text-[12px] flex items-center gap-1.5 min-w-0">
                    <span className={cn("tabular-nums truncate", overridden ? "text-muted-foreground line-through" : inherited.tone)}>{inherited.text}</span>
                    <VatBadge kind={inherited.label} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {overridden ? (
                      <>
                        <div className="relative w-24">
                          <Input
                            value={draft[c.iso]}
                            onChange={(e) => setDraft((d) => ({ ...d, [c.iso]: e.target.value }))}
                            inputMode="decimal"
                            autoFocus
                            aria-invalid={bad || undefined}
                            className={cn("h-8 pr-6 text-right text-[13px] tabular-nums", bad && "border-rose-400")}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">%</span>
                        </div>
                        <VatBadge kind="Campaign" />
                      </>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">inherited</span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <OverrideToggle
                      overridden={overridden}
                      inheritLabel="Global"
                      onOverride={() => setDraft((d) => ({ ...d, [c.iso]: globalRate != null ? String(globalRate) : global.settings.fallbackRate != null ? String(global.settings.fallbackRate) : "" }))}
                      onReset={() =>
                        setDraft((d) => {
                          const next = { ...d };
                          delete next[c.iso];
                          return next;
                        })
                      }
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </EditorModalBody>

      <EditorModalFooter className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] text-muted-foreground">
          {global
            ? `${Object.keys(global.settings.rates).length} countries have a global rate${global.settings.fallbackRate != null ? ` · fallback ${fmtVatRate(global.settings.fallbackRate)}` : " · no fallback (unrated countries are blocked)"}`
            : "Loading global rates…"}{" "}
          · <Link href="/preorder/vat-rates" className="underline hover:text-foreground">edit the global table</Link>
        </span>
        <div className="flex-1" />
        {dirty && invalid.length > 0 && <span className="text-[11px] text-amber-700 dark:text-amber-300">Fix the highlighted rates to save</span>}
        <Button variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" className="h-8" onClick={save} disabled={!dirty || saving || invalid.length > 0}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save overrides
        </Button>
      </EditorModalFooter>
    </EditorModal>
  );
}

function VatBadge({ kind }: { kind: "Global" | "Fallback" | "Missing" | "Campaign" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium whitespace-nowrap",
        kind === "Campaign" && "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",
        kind === "Global" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        kind === "Fallback" && "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
        kind === "Missing" && "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
      )}
    >
      {kind === "Campaign" ? "Campaign override" : kind}
    </span>
  );
}
