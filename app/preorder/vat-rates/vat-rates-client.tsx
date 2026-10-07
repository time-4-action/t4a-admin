"use client";

// Preorder → VAT rates: the global per-country VAT table. Individuals pay the net
// partner price + this rate on top; companies are zero-rated by default. Every
// country is listed; a blank rate means "not configured" — such an individual's
// order is blocked unless the fallback rate is set. Edits AUTOSAVE (debounced, one
// PUT of the whole table); the footer shows the save state. The table can also be
// downloaded as an .xlsx template (Country · Code · VAT %) and imported back — the
// imported rates are merged into the table and autosaved like a manual edit.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Download, FileSpreadsheet, Loader2, Search, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton, stagger } from "@/components/ui/skeleton";
import { Flag } from "@/components/flag";
import { isEuropean } from "@/lib/countries-client";
import { normalizeVatRate, type VatRateMap } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type Payload = {
  settings: { rates: VatRateMap; fallbackRate: number | null; updatedAt: string | null; updatedBy: string | null };
  countries: Record<string, string>;
};

type ImportResult = { rates: VatRateMap; cleared: string[]; skipped: { row: number; reason: string }[] };

type Filter = "all" | "set" | "europe";

const AUTOSAVE_MS = 900;

// Country (flag · name · code) | rate input | worked example. The rate column is
// exactly the input's width so its heading sits flush over the field.
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_112px] md:grid-cols-[minmax(0,1fr)_112px_260px] gap-4 items-center px-4";
// The example column prices one net partner price so the rate reads as money.
const EXAMPLE_NET = 100;
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Import: what the last file did, shown until the next edit / import.
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<{ set: number; cleared: number; skipped: ImportResult["skipped"] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyPayload = useCallback((p: Payload) => {
    const r: Record<string, string> = {};
    for (const [iso, v] of Object.entries(p.settings.rates)) r[iso] = rateStr(v);
    setData(p);
    setRates(r);
    setSaved(r);
    setFallback(rateStr(p.settings.fallbackRate));
    setSavedFallback(rateStr(p.settings.fallbackRate));
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/preorder/vat")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Could not load VAT settings (${r.status})`);
        return (await r.json()) as Payload;
      })
      .then((p) => alive && applyPayload(p))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [applyPayload]);

  const dirty = !sameRates(rates, saved) || normalizeVatRate(fallback) !== normalizeVatRate(savedFallback);
  const invalid = useMemo(() => {
    const bad: string[] = [];
    for (const [iso, v] of Object.entries(rates)) if (v.trim() !== "" && normalizeVatRate(v) === null) bad.push(iso);
    return bad;
  }, [rates]);
  const fallbackInvalid = fallback.trim() !== "" && normalizeVatRate(fallback) === null;
  const blocked = invalid.length > 0 || fallbackInvalid;

  // ── autosave ──────────────────────────────────────────────────────────────
  // One debounced PUT of the whole table after the last keystroke. A save that
  // starts while another is in flight is queued behind it (`pending`), so the
  // final state always lands. Invalid fields hold the save until they are fixed.
  const saveRef = useRef<{ inFlight: boolean; pending: boolean }>({ inFlight: false, pending: false });
  const latest = useRef({ rates, fallback });
  latest.current = { rates, fallback };

  const save = useCallback(async () => {
    if (saveRef.current.inFlight) {
      saveRef.current.pending = true;
      return;
    }
    saveRef.current.inFlight = true;
    setSaving(true);
    setError(null);
    try {
      const { rates: r, fallback: fb } = latest.current;
      const body: { rates: Record<string, number>; fallbackRate: number | null } = { rates: {}, fallbackRate: normalizeVatRate(fb) };
      for (const [iso, v] of Object.entries(r)) {
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
      // Only the saved baseline moves — the inputs keep whatever was typed meanwhile.
      const sr: Record<string, string> = {};
      for (const [iso, v] of Object.entries(p.settings.rates)) sr[iso] = rateStr(v);
      setData(p);
      setSaved(sr);
      setSavedFallback(rateStr(p.settings.fallbackRate));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saveRef.current.inFlight = false;
      setSaving(false);
      if (saveRef.current.pending) {
        saveRef.current.pending = false;
        void save();
      }
    }
  }, []);

  useEffect(() => {
    if (!data || !dirty || blocked) return;
    const t = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [data, dirty, blocked, rates, fallback, save]);

  // ── xlsx import ───────────────────────────────────────────────────────────
  async function importFile(file: File) {
    setImporting(true);
    setError(null);
    setImported(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/preorder/vat/import", { method: "POST", body: fd });
      const json = (await res.json().catch(() => null)) as (ImportResult & { error?: string }) | null;
      if (!res.ok || !json) throw new Error(json?.error ?? `Import failed (${res.status})`);
      setRates((prev) => {
        const next = { ...prev };
        for (const iso of json.cleared) next[iso] = "";
        for (const [iso, v] of Object.entries(json.rates)) next[iso] = rateStr(v);
        return next;
      });
      setImported({ set: Object.keys(json.rates).length, cleared: json.cleared.length, skipped: json.skipped });
      if (Object.keys(json.rates).length + json.cleared.length > 0) setFilter("set");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const all = Object.entries(data.countries).map(([iso, name]) => ({ iso, name }));
    // Alphabetical, always — a row must never jump while its rate is being typed.
    return all
      .filter((c) => {
        if (filter === "set" && !(rates[c.iso] ?? "").trim()) return false;
        if (filter === "europe" && !isEuropean(c.iso)) return false;
        if (!needle) return true;
        return c.name.toLowerCase().includes(needle) || c.iso.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, q, filter, rates]);

  const total = data ? Object.keys(data.countries).length : 0;
  const setCount = Object.values(rates).filter((v) => v.trim() !== "").length;
  const europe = useMemo(() => {
    if (!data) return { total: 0, set: 0 };
    const isos = Object.keys(data.countries).filter(isEuropean);
    return { total: isos.length, set: isos.filter((iso) => (rates[iso] ?? "").trim() !== "").length };
  }, [data, rates]);
  const fallbackRate = normalizeVatRate(fallback);

  return (
    // No top padding on the scroll container itself: a sticky bar is offset from
    // inside that padding, so rows would scroll through the gap above it. The
    // padding lives on the inner (non-scrolling) wrapper instead.
    <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 md:pb-6">
      <div className="pt-4 md:pt-6 space-y-4">
      {error && (
        <div className="rounded-xl border border-rose-300/60 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300 flex gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Summary strip: coverage · fallback · spreadsheet. Every cell has the same
          skeleton — title, one line of help, and the control pinned to the bottom —
          so the three read as one row rather than three loose boxes. */}
      <div className="bg-background border border-border rounded-2xl grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/60">
        <SummaryCell title="Coverage" help="Countries with their own rate. The rest use the fallback.">
          {data ? (
            <div className="flex items-baseline gap-4">
              <p className="text-[26px] font-semibold tabular-nums text-foreground leading-none">
                {setCount}
                <span className="text-[13px] font-normal text-muted-foreground"> / {total}</span>
              </p>
              <p className="text-[12px] text-muted-foreground tabular-nums">Europe {europe.set} / {europe.total}</p>
            </div>
          ) : (
            <Skeleton className="h-7 w-32" />
          )}
        </SummaryCell>

        <SummaryCell title="Fallback rate" help="Charged to individuals in every country without its own rate.">
          <div className="flex items-center gap-3">
            <RateInput value={fallback} onChange={setFallback} invalid={fallbackInvalid} disabled={!data} />
            {data && (
              <p className={cn("text-[12px] tabular-nums", fallbackRate === null ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                {fallbackRate === null ? `Empty — ${total - setCount} countries cannot order` : `applies to ${total - setCount} countries`}
              </p>
            )}
          </div>
        </SummaryCell>

        <SummaryCell title="Spreadsheet" help="Download the table, fill the VAT column, import it back. A blank cell clears that country.">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/admin/preorder/vat/template"
              download
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-foreground hover:bg-muted/60",
                !data && "pointer-events-none opacity-50",
              )}
            >
              <Download className="w-3.5 h-3.5" /> Download template
            </a>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!data || importing}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {importing ? "Importing…" : "Import .xlsx"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
              }}
            />
          </div>
        </SummaryCell>
      </div>

      {imported && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-[12px] flex items-start gap-3",
            imported.skipped.length > 0
              ? "border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200"
              : "border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300",
          )}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">
              {imported.set + imported.cleared === 0
                ? "Nothing in the file matched a country."
                : `Imported: ${imported.set} rate${imported.set === 1 ? "" : "s"} set${imported.cleared > 0 ? `, ${imported.cleared} cleared` : ""}.`}
              {imported.skipped.length > 0 && ` ${imported.skipped.length} row${imported.skipped.length === 1 ? "" : "s"} skipped:`}
            </p>
            {imported.skipped.length > 0 && (
              <ul className="space-y-px opacity-90">
                {imported.skipped.slice(0, 6).map((s) => (
                  <li key={s.row}>
                    Row {s.row} — {s.reason}
                  </li>
                ))}
                {imported.skipped.length > 6 && <li>… and {imported.skipped.length - 6} more</li>}
              </ul>
            )}
          </div>
          <button type="button" onClick={() => setImported(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Table. The toolbar + column headings stick while the long list scrolls, so the
          card must not clip (no overflow-hidden) — corners are rounded per edge. */}
      <div className="bg-background border border-border rounded-2xl min-w-0">
        <div className="sticky top-0 z-10 rounded-t-2xl bg-background shadow-[0_1px_0_0_var(--border)]">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60 rounded-t-2xl">
            <div className="min-w-0 mr-auto">
              <p className="text-[13px] font-semibold text-foreground">Rate per country</p>
              <p className="text-[11px] text-muted-foreground">Individuals pay the partner price plus this rate; companies are zero-rated. Campaigns may override a country.</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country or code…" className="h-8 pl-8 text-[12px]" disabled={!data} />
              {q && (
                <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center rounded-lg bg-muted p-0.5 gap-0.5">
              {(
                [
                  ["all", "All", total],
                  ["europe", "Europe", europe.total],
                  ["set", "Configured", setCount],
                ] as [Filter, string, number][]
              ).map(([k, label, count]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                    filter === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                  <span className={cn("tabular-nums", filter === k ? "text-muted-foreground" : "text-muted-foreground/60")}>{data ? count : "–"}</span>
                </button>
              ))}
            </div>
            <SaveState saving={saving} dirty={dirty} blocked={blocked} justSaved={justSaved} />
          </div>
          <div className={cn(ROW_GRID, "py-2 border-b border-border/60 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted/30")}>
            <span>Country</span>
            <span className="text-right">VAT rate</span>
            <span className="hidden md:block">Individual pays · {money(EXAMPLE_NET)} net</span>
          </div>
        </div>

        {!data ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className={cn(ROW_GRID, "py-1.5")}>
                <div className="flex items-center gap-2.5">
                  <Skeleton className="w-5 h-4 rounded-[3px]" delay={stagger(i)} />
                  <Skeleton className="h-3.5 w-36" delay={stagger(i)} />
                  <Skeleton className="h-3 w-6" delay={stagger(i)} />
                </div>
                <Skeleton className="h-8 w-full rounded-md" delay={stagger(i)} />
                <Skeleton className="h-3 w-24 hidden md:block" delay={stagger(i)} />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-muted-foreground">
            {filter === "set" && !q.trim() ? "No country has its own rate yet — type one in the VAT rate column or import a spreadsheet." : "No country matches."}
          </p>
        ) : (
          <div className="divide-y divide-border/50">
            {rows.map((c) => {
              const v = rates[c.iso] ?? "";
              const changed = (v || "") !== (saved[c.iso] ?? "");
              const bad = v.trim() !== "" && normalizeVatRate(v) === null;
              const n = normalizeVatRate(v);
              return (
                <div key={c.iso} className={cn(ROW_GRID, "py-1.5 hover:bg-muted/20", changed && "bg-lime-50/50 dark:bg-lime-950/20")}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Flag iso={c.iso} className="text-[15px]" />
                    <span className="text-[13px] text-foreground truncate">{c.name}</span>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">{c.iso}</span>
                  </div>
                  <RateInput value={v} onChange={(next) => setRates((r) => ({ ...r, [c.iso]: next }))} invalid={bad} className="w-full" />
                  <div className="text-[12px] hidden md:flex items-baseline gap-2 tabular-nums min-w-0">
                    {bad ? (
                      <span className="text-rose-600 dark:text-rose-400">Enter a number from 0 to 100</span>
                    ) : v.trim() !== "" ? (
                      <>
                        <span className="text-foreground font-medium">{money(EXAMPLE_NET * (1 + (n ?? 0) / 100))}</span>
                        <span className="text-muted-foreground">incl. {n}% VAT</span>
                      </>
                    ) : fallbackRate !== null ? (
                      <>
                        <span className="text-muted-foreground">{money(EXAMPLE_NET * (1 + fallbackRate / 100))}</span>
                        <span className="text-muted-foreground/70">fallback {fallbackRate}%</span>
                      </>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300">Cannot order — no rate</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border/60 rounded-b-2xl bg-muted/20 text-[11px] text-muted-foreground">
          <span>
            {rows.length === total ? `${total} countries` : `${rows.length} of ${total} countries shown`}
            {data?.settings.updatedAt && (
              <>
                {" "}
                · last saved {new Date(data.settings.updatedAt).toLocaleString()}
                {data.settings.updatedBy ? ` by ${data.settings.updatedBy}` : ""}
              </>
            )}
          </span>
          {blocked && <span className="text-amber-700 dark:text-amber-400 font-medium">Fix the highlighted fields — not saved until they are valid</span>}
        </div>
      </div>
      </div>
    </div>
  );
}

// One summary cell: title, a line of help, and the control pinned to the bottom so
// the three cells' controls line up whatever the help text wraps to.
function SummaryCell({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4 flex flex-col gap-3 min-h-[124px]">
      <div>
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground max-w-[40ch]">{help}</p>
      </div>
      <div className="mt-auto">{children}</div>
    </div>
  );
}

// The autosave state, where the Save button used to be.
function SaveState({ saving, dirty, blocked, justSaved }: { saving: boolean; dirty: boolean; blocked: boolean; justSaved: boolean }) {
  const [Icon, label, tone] = saving
    ? [Loader2, "Saving…", "text-muted-foreground"]
    : blocked
      ? [AlertTriangle, "Invalid rate", "text-amber-700 dark:text-amber-300"]
      : dirty
        ? [null, "Unsaved", "text-muted-foreground"]
        : justSaved
          ? [Check, "Saved", "text-emerald-700 dark:text-emerald-400"]
          : [null, "All changes saved", "text-muted-foreground/70"];
  return (
    <span className={cn("inline-flex h-8 items-center gap-1.5 px-2 text-[11px] font-medium tabular-nums", tone)}>
      {Icon && <Icon className={cn("w-3.5 h-3.5", saving && "animate-spin")} />}
      {label}
    </span>
  );
}

function RateInput({
  value,
  onChange,
  invalid,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative w-28 shrink-0", className)}>
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
