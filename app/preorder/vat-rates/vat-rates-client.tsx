"use client";

// Preorder → VAT rates: the global per-country VAT table that consumer
// (RRP) preorders extract their VAT with. Every country is listed; a blank rate
// means "not configured" — such a customer's order is blocked unless the fallback
// rate is set. Explicit Save (no autosave): a wrong rate changes what customers pay.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton, stagger } from "@/components/ui/skeleton";
import { Flag } from "@/components/flag";
import { isEuropean } from "@/lib/countries-client";
import { normalizeTaxCodes, normalizeVatRate, type VatRateMap, type VatTaxCode } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type Payload = {
  settings: { rates: VatRateMap; fallbackRate: number | null; taxCodes: VatTaxCode[]; updatedAt: string | null; updatedBy: string | null };
  countries: Record<string, string>;
};

type Filter = "all" | "set" | "europe";

function rateStr(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

function sameRates(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a).filter((k) => a[k] !== "");
  const kb = Object.keys(b).filter((k) => b[k] !== "");
  if (ka.length !== kb.length) return false;
  return ka.every((k) => normalizeVatRate(a[k]) === normalizeVatRate(b[k]));
}

export function VatRatesClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [fallback, setFallback] = useState("");
  const [savedFallback, setSavedFallback] = useState("");
  // Metakocka tax code per rate — edited as text rows, normalized on save.
  type CodeRow = { rate: string; code: string };
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [savedCodes, setSavedCodes] = useState<VatTaxCode[]>([]);
  const codeRowsOf = (list: VatTaxCode[]): CodeRow[] => list.map((c) => ({ rate: String(c.rate), code: c.code }));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Tax codes discovered on the Metakocka account (from the sheets' products) → datalist.
  type MkCode = { code: string; rate: number | null; lists: string[] };
  const [mkCodes, setMkCodes] = useState<MkCode[] | null>(null);
  const [mkCodesBusy, setMkCodesBusy] = useState(false);
  const loadMkCodes = async (fresh = false) => {
    setMkCodesBusy(true);
    try {
      const r = await fetch(`/api/admin/preorder/vat/mk-tax-codes${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      if (r.ok) setMkCodes(((await r.json()) as { codes: MkCode[] }).codes);
    } finally {
      setMkCodesBusy(false);
    }
  };
  useEffect(() => {
    void loadMkCodes();
  }, []);
  const suggestFor = (rate: number) => mkCodes?.find((c) => c.rate === rate)?.code ?? null;

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/preorder/vat")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Could not load VAT settings (${r.status})`);
        return (await r.json()) as Payload;
      })
      .then((p) => {
        if (!alive) return;
        const r: Record<string, string> = {};
        for (const [iso, v] of Object.entries(p.settings.rates)) r[iso] = rateStr(v);
        setData(p);
        setRates(r);
        setSaved(r);
        setFallback(rateStr(p.settings.fallbackRate));
        setSavedFallback(rateStr(p.settings.fallbackRate));
        setCodes(codeRowsOf(p.settings.taxCodes ?? []));
        setSavedCodes(p.settings.taxCodes ?? []);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const codesNormalized = useMemo(() => normalizeTaxCodes(codes), [codes]);
  const codesDirty = JSON.stringify(codesNormalized) !== JSON.stringify(savedCodes);
  // A row with a code but no valid rate is a mistake; an empty code just means "not configured".
  const codesInvalid = codes.some((c) => (c.rate.trim() !== "" && normalizeVatRate(c.rate) === null) || (c.code.trim() !== "" && normalizeVatRate(c.rate) === null));
  const dirty = !sameRates(rates, saved) || normalizeVatRate(fallback) !== normalizeVatRate(savedFallback) || codesDirty;
  const invalid = useMemo(() => {
    const bad: string[] = [];
    for (const [iso, v] of Object.entries(rates)) if (v.trim() !== "" && normalizeVatRate(v) === null) bad.push(iso);
    return bad;
  }, [rates]);
  const fallbackInvalid = fallback.trim() !== "" && normalizeVatRate(fallback) === null;

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const all = Object.entries(data.countries).map(([iso, name]) => ({ iso, name }));
    return all
      .filter((c) => {
        if (filter === "set" && !(rates[c.iso] ?? "").trim()) return false;
        if (filter === "europe" && !isEuropean(c.iso)) return false;
        if (!needle) return true;
        return c.name.toLowerCase().includes(needle) || c.iso.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const sa = (rates[a.iso] ?? "").trim() ? 0 : 1;
        const sb = (rates[b.iso] ?? "").trim() ? 0 : 1;
        return sa - sb || a.name.localeCompare(b.name);
      });
  }, [data, q, filter, rates]);

  const setCount = Object.values(rates).filter((v) => v.trim() !== "").length;
  // Every rate a line can carry: 0 % (companies, exempt) + each country rate + the fallback.
  const usedRates = useMemo(() => {
    const used = new Set<number>([0]);
    for (const v of Object.values(rates)) {
      const n = normalizeVatRate(v);
      if (n !== null) used.add(n);
    }
    const fb = normalizeVatRate(fallback);
    if (fb !== null) used.add(fb);
    return Array.from(used).sort((a, b) => a - b);
  }, [rates, fallback]);
  const codeFor = (rate: number) => codes.find((c) => normalizeVatRate(c.rate) === rate);
  const setCodeFor = (rate: number, code: string) =>
    setCodes((rows) => {
      const i = rows.findIndex((c) => normalizeVatRate(c.rate) === rate);
      if (i === -1) return [...rows, { rate: String(rate), code }];
      return rows.map((r, j) => (j === i ? { ...r, code } : r));
    });
  const extraCodes = codes.map((c, i) => ({ ...c, i })).filter((c) => normalizeVatRate(c.rate) === null || !usedRates.includes(normalizeVatRate(c.rate)!));
  const missingCodeRates = usedRates.filter((r) => !(codeFor(r)?.code ?? "").trim());

  async function save() {
    if (!dirty || saving || invalid.length || fallbackInvalid || codesInvalid) return;
    setSaving(true);
    setError(null);
    try {
      const body: { rates: Record<string, number>; fallbackRate: number | null; taxCodes: VatTaxCode[] } = { rates: {}, fallbackRate: normalizeVatRate(fallback), taxCodes: codesNormalized };
      for (const [iso, v] of Object.entries(rates)) {
        const n = normalizeVatRate(v);
        if (n !== null) body.rates[iso] = n;
      }
      const res = await fetch("/api/admin/preorder/vat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const p = (await res.json()) as Payload;
      const r: Record<string, string> = {};
      for (const [iso, v] of Object.entries(p.settings.rates)) r[iso] = rateStr(v);
      setData(p);
      setRates(r);
      setSaved(r);
      setFallback(rateStr(p.settings.fallbackRate));
      setSavedFallback(rateStr(p.settings.fallbackRate));
      setCodes(codeRowsOf(p.settings.taxCodes ?? []));
      setSavedCodes(p.settings.taxCodes ?? []);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      {error && (
        <div className="mb-4 rounded-xl border border-rose-300/60 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300 flex gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
      {/* Side: fallback + Metakocka codes */}
      <aside className="space-y-4 xl:order-2 xl:sticky xl:top-4">
        <div className="bg-background border border-border rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Fallback rate</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">For individuals whose country has no rate. Empty = they cannot submit.</p>
            </div>
            <RateInput value={fallback} onChange={setFallback} invalid={fallbackInvalid} disabled={!data} />
          </div>
        </div>

        <div className="bg-background border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/60 flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-foreground">Metakocka tax codes</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Optional. Lines are sent with the rate itself (tax_factor); a code set here is sent instead for that rate — use it where Metakocka refuses the factor, typically 0%.</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                missingCodeRates.includes(0) ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",
              )}
            >
              {usedRates.length - missingCodeRates.length}/{usedRates.length}
            </span>
          </div>
          <div className="divide-y divide-border/50">
            <datalist id="mk-tax-codes">
              {(mkCodes ?? []).map((c) => (
                <option key={c.code} value={c.code}>{c.rate != null ? `${c.rate}% · ${c.lists.join(", ")}` : c.lists.join(", ")}</option>
              ))}
            </datalist>
            {usedRates.map((rate) => {
              const code = codeFor(rate)?.code ?? "";
              const missing = !code.trim();
              const suggestion = missing ? suggestFor(rate) : null;
              return (
                <div key={rate} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 px-5 py-2">
                  <span className="text-[13px] font-medium tabular-nums text-foreground">{rate}%</span>
                  <div className="relative">
                    <Input
                      value={code}
                      onChange={(e) => setCodeFor(rate, e.target.value)}
                      list="mk-tax-codes"
                      placeholder={suggestion ? `found: ${suggestion}` : rate === 0 ? "zero-rate code" : "pick or type, e.g. EX4"}
                      disabled={!data}
                      aria-invalid={missing || undefined}
                      className={cn("h-8 font-mono text-[12px] uppercase", missing && "border-amber-400/70", suggestion && "pr-14")}
                    />
                    {suggestion && (
                      <button
                        type="button"
                        onClick={() => setCodeFor(rate, suggestion)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300 px-1.5 py-px text-[10px] font-semibold"
                        title={`Metakocka uses ${suggestion} for ${rate}% — apply`}
                      >
                        use
                      </button>
                    )}
                  </div>
                  <span className={cn("text-[10px] w-14 text-right", missing ? (rate === 0 ? "text-amber-700 dark:text-amber-300 font-medium" : "text-muted-foreground/70") : "text-muted-foreground")}>
                    {missing ? (rate === 0 ? "needed" : "by rate") : rate === 0 ? "companies" : "code"}
                  </span>
                </div>
              );
            })}
            {extraCodes.map((c) => {
              const badRate = c.rate.trim() !== "" && normalizeVatRate(c.rate) === null;
              return (
                <div key={`x${c.i}`} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 px-5 py-2">
                  <RateInput value={c.rate} onChange={(v) => setCodes((rows) => rows.map((r, j) => (j === c.i ? { ...r, rate: v } : r)))} invalid={badRate} compact />
                  <Input
                    value={c.code}
                    onChange={(e) => setCodes((rows) => rows.map((r, j) => (j === c.i ? { ...r, code: e.target.value } : r)))}
                    list="mk-tax-codes"
                    placeholder="e.g. EX2"
                    className="h-8 font-mono text-[12px] uppercase"
                  />
                  <button type="button" onClick={() => setCodes((rows) => rows.filter((_, j) => j !== c.i))} className="w-14 flex justify-end text-muted-foreground hover:text-rose-600" aria-label="Remove">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-2 border-t border-border/60 flex items-center gap-3">
            <button type="button" onClick={() => setCodes((rows) => [...rows, { rate: "", code: "" }])} disabled={!data} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50">
              <Plus className="w-3 h-3" /> Code for another rate
            </button>
            <div className="flex-1" />
            <button type="button" onClick={() => loadMkCodes(true)} disabled={mkCodesBusy} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50" title="Re-read the codes Metakocka uses on the sheets' products">
              <RefreshCw className={cn("w-3 h-3", mkCodesBusy && "animate-spin")} />
              {mkCodes ? `${mkCodes.length} code${mkCodes.length === 1 ? "" : "s"} found in Metakocka` : "Reading Metakocka…"}
            </button>
          </div>
          {mkCodes && mkCodes.length > 0 && (
            <div className="px-5 pb-3 flex flex-wrap gap-1">
              {mkCodes.map((c) => (
                <span key={c.code} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-px text-[10px]" title={c.lists.join(", ")}>
                  <span className="font-mono font-semibold">{c.code}</span>
                  {c.rate != null && <span className="text-muted-foreground">{c.rate}%</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Table */}
      <div className="bg-background border border-border rounded-2xl overflow-hidden xl:order-1 min-w-0">
        <div className="px-4 py-3 border-b border-border/60">
          <p className="text-[13px] font-semibold text-foreground">VAT rate per country</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Individuals pay the RRP with this VAT inside it (never added on top); companies are zero-rated and skip this table. Campaigns may override single countries.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search country or code…"
              className="h-8 pl-8 text-[12px]"
              disabled={!data}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center rounded-lg bg-muted p-0.5 gap-0.5">
            {(
              [
                ["all", "All"],
                ["europe", "Europe"],
                ["set", `Configured (${setCount})`],
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
          <Button size="sm" onClick={save} disabled={!dirty || saving || invalid.length > 0 || fallbackInvalid || codesInvalid} className="h-8 text-xs gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : justSaved && !dirty ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {justSaved && !dirty ? "Saved" : "Save rates"}
          </Button>
        </div>

        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_120px_160px_1fr] gap-3 px-4 py-2 border-b border-border/60 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          <span>Country</span>
          <span>Code</span>
          <span className="text-right">VAT rate</span>
          <span>Status</span>
        </div>

        {!data ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_120px_160px_1fr] gap-3 items-center px-4 py-2">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="w-5 h-4 rounded-[3px]" delay={stagger(i)} />
                  <Skeleton className="h-3.5 w-36" delay={stagger(i)} />
                </div>
                <Skeleton className="h-3 w-6" delay={stagger(i)} />
                <Skeleton className="h-8 w-24 ml-auto rounded-md" delay={stagger(i)} />
                <Skeleton className="h-3 w-28" delay={stagger(i)} />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">No country matches.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {rows.map((c) => {
              const v = rates[c.iso] ?? "";
              const changed = (v || "") !== (saved[c.iso] ?? "");
              const bad = v.trim() !== "" && normalizeVatRate(v) === null;
              return (
                <div
                  key={c.iso}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_120px_160px_1fr] gap-3 items-center px-4 py-1.5 hover:bg-muted/20",
                    changed && "bg-lime-50/50 dark:bg-lime-950/20",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Flag iso={c.iso} className="text-[15px]" />
                    <span className="text-[13px] text-foreground truncate">{c.name}</span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground">{c.iso}</span>
                  <div className="flex justify-end">
                    <RateInput value={v} onChange={(next) => setRates((r) => ({ ...r, [c.iso]: next }))} invalid={bad} />
                  </div>
                  <div className="text-[11px] text-muted-foreground hidden md:block">
                    {v.trim() !== "" ? (
                      <span className="text-lime-700 dark:text-lime-400">consumers pay RRP incl. {normalizeVatRate(v) !== null ? `${normalizeVatRate(v)}%` : "…"} VAT</span>
                    ) : normalizeVatRate(fallback) !== null ? (
                      <span>fallback {normalizeVatRate(fallback)}%</span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300">not configured — consumers blocked</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/60 text-[11px] text-muted-foreground">
          <span>
            {setCount} of {data ? Object.keys(data.countries).length : "…"} countries configured
            {data?.settings.updatedAt && (
              <>
                {" "}
                · last saved {new Date(data.settings.updatedAt).toLocaleString()}
                {data.settings.updatedBy ? ` by ${data.settings.updatedBy}` : ""}
              </>
            )}
          </span>
          {dirty && !saving && (
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              {invalid.length || fallbackInvalid || codesInvalid ? "Fix the highlighted fields to save" : "Unsaved changes"}
            </span>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function RateInput({
  value,
  onChange,
  invalid,
  disabled,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("relative", compact ? "w-16" : "w-28")}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="—"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn("h-8 pr-7 text-right text-[13px] tabular-nums", invalid && "border-rose-400")}
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">%</span>
    </div>
  );
}
