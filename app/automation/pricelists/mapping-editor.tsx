"use client";
// The price-list mapping editor — the safety mechanism of the pricelist sync.
//
// Metakocka has no endpoint that lists price lists, so the service derives them by scanning
// the whole catalogue; that is what fills the two reference columns here. More importantly,
// a list's `count_code` is a per-company counter and does NOT identify the same list in the
// other company. Live data:
//
//     T4A 7 = "PP GOLD 2026"   but   CREAGLOBE 7 = "PP BRONZE 2026"
//
// So the sync only ever writes pairs that someone explicitly saved on this page. Titles are
// used to *suggest* pairs and to warn when a saved pair's two titles disagree — never to
// apply anything on their own.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Plus,
  Trash2,
  Loader2,
  Save,
  RefreshCw,
  Wand2,
  AlertTriangle,
  ChevronDown,
  Check,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Skeleton, stagger } from "@/components/ui/skeleton";
import type {
  MkPricelistInfo,
  PricelistDiscovery,
  PricelistMapping,
} from "@/types/automation";

// A mapping as edited on screen. `key` is a stable client-side row id — the server row id
// is not usable because a save replaces the whole set.
type Row = PricelistMapping & { key: string };

let rowSeq = 0;
const nextKey = () => `row-${++rowSeq}`;

function toRow(m: PricelistMapping): Row {
  return { ...m, key: nextKey() };
}

/** Same identity the service uses: sales and purchase lists are numbered separately. */
function listKey(salesPurchase: string, code: string): string {
  return `${salesPurchase || "sales"}|${code}`;
}

function findList(lists: MkPricelistInfo[], salesPurchase: string, code: string) {
  return lists.find((l) => listKey(l.salesPurchase, l.code ?? "") === listKey(salesPurchase, code));
}

function sameSet(a: Row[], b: Row[]): boolean {
  const norm = (rows: Row[]) =>
    JSON.stringify(
      rows.map((r) => [
        r.sourceSalesPurchase,
        r.sourceCode,
        r.targetSalesPurchase,
        r.targetCode,
        r.enabled,
        r.allowUnseenTarget ?? false,
        r.maxChangePct ?? null,
      ]),
    );
  return norm(a) === norm(b);
}

// ── one side of a mapping row ────────────────────────────────────────────────
// A picker over the discovered lists, with a manual-entry escape hatch: Metakocka only
// reveals a list through the products on it, so an empty list must still be addressable by
// typing its code.
function ListPicker({
  lists,
  salesPurchase,
  code,
  onChange,
  placeholder,
  unseenLabel,
}: {
  lists: MkPricelistInfo[];
  salesPurchase: string;
  code: string;
  onChange: (next: { salesPurchase: string; code: string; title: string | null }) => void;
  placeholder: string;
  unseenLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const hit = findList(lists, salesPurchase, code);
  const unseen = !!code && !hit;

  if (manual) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <select
          value={salesPurchase || "sales"}
          onChange={(e) => onChange({ salesPurchase: e.target.value, code, title: null })}
          className="h-8 rounded-lg border border-input bg-background px-2 text-[11px] text-foreground shrink-0"
        >
          <option value="sales">sales</option>
          <option value="purchase">purchase</option>
        </select>
        <Input
          autoFocus
          value={code}
          placeholder="count_code"
          onChange={(e) => onChange({ salesPurchase: salesPurchase || "sales", code: e.target.value.trim(), title: null })}
          className="h-8 w-24 text-[12px] font-mono bg-background"
        />
        <button
          type="button"
          onClick={() => setManual(false)}
          className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
        >
          pick
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 w-full h-8 rounded-lg border bg-background px-2.5 text-left transition-colors",
          unseen ? "border-amber-400/60" : "border-input hover:bg-muted/40",
        )}
      >
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{code || "—"}</span>
        <span className="text-[12px] text-foreground truncate flex-1">
          {hit?.title ?? (unseen ? unseenLabel : placeholder)}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute z-50 mt-1 w-[22rem] max-h-72 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg py-1">
            {lists.map((l) => {
              const active = listKey(l.salesPurchase, l.code ?? "") === listKey(salesPurchase, code);
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => {
                    onChange({ salesPurchase: l.salesPurchase, code: l.code ?? "", title: l.title });
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="w-3.5 shrink-0">
                    {active && <Check className="w-3 h-3 text-foreground" />}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground w-8 shrink-0">{l.code}</span>
                  <span className="text-[12px] text-foreground truncate flex-1">{l.title ?? "(untitled)"}</span>
                  {l.salesPurchase === "purchase" && (
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 shrink-0">
                      purchase
                    </span>
                  )}
                  <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">{l.productCount}</span>
                </button>
              );
            })}
            <div className="border-t border-border mt-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  setManual(true);
                  setOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                Enter a code manually…
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── reference column: what each company actually has ─────────────────────────
function ListsColumn({ title, company, lists, productCount }: { title: string; company: string; lists: MkPricelistInfo[]; productCount: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-3 py-2 border-b border-border/60 bg-muted/30 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {lists.length} lists · {productCount} products
        </span>
      </div>
      <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
        {lists.map((l) => (
          <div key={l.key} className="px-3 py-1.5 flex items-center gap-2 text-[12px]">
            <span className="text-[10px] font-mono text-muted-foreground w-7 shrink-0">{l.code}</span>
            <span className="text-foreground truncate flex-1">{l.title ?? "(untitled)"}</span>
            {l.salesPurchase === "purchase" && (
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 shrink-0">
                purchase
              </span>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" title="products on this list">
              {l.productCount}
            </span>
          </div>
        ))}
        {lists.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
            No price lists found in {company}.
          </p>
        )}
      </div>
    </div>
  );
}

// ── the editor ───────────────────────────────────────────────────────────────
export default function PricelistMappingEditor() {
  const [data, setData] = useState<PricelistDiscovery | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const r = await fetch(`/api/automation/pricelists${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) {
        setError(body?.error ?? "Couldn't read price lists from Metakocka");
        return;
      }
      setError(null);
      setData(body as PricelistDiscovery);
      const next = ((body as PricelistDiscovery).mappings ?? []).map(toRow);
      setRows(next);
      setSaved(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load price lists");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => !sameSet(rows, saved), [rows, saved]);

  const sourceLists = data?.source.lists ?? [];
  const targetLists = data?.target.lists ?? [];

  const patch = (key: string, next: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));

  const addRow = () =>
    setRows((rs) => [
      ...rs,
      toRow({
        sourceCode: "",
        sourceSalesPurchase: "sales",
        sourceTitle: null,
        targetCode: "",
        targetSalesPurchase: "sales",
        targetTitle: null,
        enabled: true,
        allowUnseenTarget: false,
        maxChangePct: null,
      }),
    ]);

  // Fills in every source list that has an exact title twin in CREAGLOBE. A suggestion is
  // only ever a starting point — it still has to be saved deliberately.
  const applySuggestions = () => {
    const existing = new Set(rows.map((r) => listKey(r.sourceSalesPurchase, r.sourceCode)));
    const added = (data?.suggestions ?? [])
      .filter((s) => s.targetCode && !existing.has(listKey(s.sourceSalesPurchase, s.sourceCode)))
      .map((s) =>
        toRow({
          sourceCode: s.sourceCode,
          sourceSalesPurchase: s.sourceSalesPurchase,
          sourceTitle: s.sourceTitle,
          targetCode: s.targetCode!,
          targetSalesPurchase: s.targetSalesPurchase ?? "sales",
          targetTitle: s.targetTitle,
          enabled: true,
          allowUnseenTarget: false,
          maxChangePct: null,
        }),
      );
    if (added.length) setRows((rs) => [...rs, ...added]);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const mappings = rows.map(({ key: _key, id: _id, updatedAt: _u, ...m }) => m);
      const r = await fetch("/api/automation/pricelists/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });
      const body = await r.json();
      if (!r.ok) {
        setError(body?.error ?? "Couldn't save the mappings");
        return;
      }
      const next = (body.mappings as PricelistMapping[]).map(toRow);
      setRows(next);
      setSaved(next);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the mappings");
    } finally {
      setSaving(false);
    }
  };

  const suggestionCount = (data?.suggestions ?? []).filter((s) => s.targetCode).length;
  const enabledCount = rows.filter((r) => r.enabled).length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-0.5 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            Price list mapping
          </h2>
          {loading ? (
            <Skeleton className="h-2.5 w-20" />
          ) : rows.length > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {enabledCount} of {rows.length} enabled
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="h-8 text-xs gap-1.5"
            title="Re-scan both Metakocka companies for price lists"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            Rescan
          </Button>
          {suggestionCount > 0 && (
            <Button variant="outline" size="sm" onClick={applySuggestions} className="h-8 text-xs gap-1.5">
              <Wand2 className="w-3.5 h-3.5" />
              Suggest by title ({suggestionCount})
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty || saving} className="h-8 text-xs gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {justSaved && !dirty ? "Saved" : "Save mapping"}
          </Button>
        </div>
      </div>

      {/* The reason this page exists. Worth stating plainly, every time. */}
      <div className="rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-[12px] text-amber-700 dark:text-amber-300 flex gap-2">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          A price list&apos;s code means nothing across companies — T4A{" "}
          <span className="font-mono">7</span> is <span className="font-medium">PP GOLD 2026</span> while CREAGLOBE{" "}
          <span className="font-mono">7</span> is <span className="font-medium">PP BRONZE 2026</span>. Only the pairs
          saved here are ever synced. Check each pair, then run a{" "}
          <span className="font-medium">Preview (dry run)</span> before letting it write. VAT is copied 1:1 from T4A —
          a line T4A leaves blank is written at 0%.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-300/40 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_auto_1fr_6rem_5rem_2rem] gap-3 px-4 py-2 border-b border-border/60 bg-muted/30">
            {["T4A price list (source)", "", "CREAGLOBE price list (target)", "Max change", "Enabled", ""].map((h, i) => (
              <p key={i} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {h}
              </p>
            ))}
          </div>
          <div className="divide-y divide-border/50">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-2.5">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_6rem_5rem_2rem] gap-2 md:gap-3 items-center">
                  <Skeleton className="h-8 w-full rounded-lg" delay={stagger(i)} />
                  <ArrowRight className="hidden md:block w-4 h-4 text-muted-foreground/50 mx-auto shrink-0" />
                  <Skeleton className="h-8 w-full rounded-lg" delay={stagger(i, 80, 40)} />
                  <div className="flex items-center gap-1">
                    <Skeleton className="h-8 w-16 rounded-md" delay={stagger(i, 80, 80)} />
                    <span className="text-[11px] text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-11 h-6 rounded-full shrink-0" delay={stagger(i, 80, 120)} />
                    <span className="md:hidden text-[11px] text-muted-foreground">Enabled</span>
                  </div>
                  <span className="p-1.5 justify-self-end">
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground/30" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-surface overflow-visible">
            <div className="hidden md:grid grid-cols-[1fr_auto_1fr_6rem_5rem_2rem] gap-3 px-4 py-2 border-b border-border/60 bg-muted/30">
              {["T4A price list (source)", "", "CREAGLOBE price list (target)", "Max change", "Enabled", ""].map((h, i) => (
                <p key={i} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {h}
                </p>
              ))}
            </div>

            <div className="divide-y divide-border/50">
              {rows.map((r) => {
                const src = findList(sourceLists, r.sourceSalesPurchase, r.sourceCode);
                const tgt = findList(targetLists, r.targetSalesPurchase, r.targetCode);
                const targetUnseen = !!r.targetCode && !tgt;
                // Two lists that do not share a name are the classic wrong-pair symptom, so
                // say so inline rather than waiting for a run to write the wrong prices.
                const titlesDiffer =
                  !!src?.title && !!tgt?.title && src.title.trim().toLowerCase() !== tgt.title.trim().toLowerCase();
                return (
                  <div key={r.key} className={cn("px-4 py-2.5", !r.enabled && "opacity-55")}>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_6rem_5rem_2rem] gap-2 md:gap-3 items-center">
                      <ListPicker
                        lists={sourceLists}
                        salesPurchase={r.sourceSalesPurchase}
                        code={r.sourceCode}
                        placeholder="Pick a T4A list"
                        unseenLabel="not found in T4A"
                        onChange={(n) =>
                          patch(r.key, { sourceSalesPurchase: n.salesPurchase, sourceCode: n.code, sourceTitle: n.title })
                        }
                      />

                      <ArrowRight className="hidden md:block w-4 h-4 text-muted-foreground/50 mx-auto shrink-0" />

                      <ListPicker
                        lists={targetLists}
                        salesPurchase={r.targetSalesPurchase}
                        code={r.targetCode}
                        placeholder="Pick a CREAGLOBE list"
                        unseenLabel="not seen in CREAGLOBE"
                        onChange={(n) =>
                          patch(r.key, { targetSalesPurchase: n.salesPurchase, targetCode: n.code, targetTitle: n.title })
                        }
                      />

                      {/* Safety rail. Blank = no limit. */}
                      <div className="flex items-center gap-1">
                        <Input
                          value={r.maxChangePct ?? ""}
                          placeholder="none"
                          inputMode="decimal"
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            patch(r.key, { maxChangePct: v === "" ? null : Number(v) });
                          }}
                          className="h-8 w-16 text-[12px] bg-background no-spinner"
                          title="Refuse any single price move larger than this percentage"
                        />
                        <span className="text-[11px] text-muted-foreground">%</span>
                      </div>

                      {/* Enabled toggle. Same switch as <AccessManager>: the knob is anchored
                          with left-0.5, NOT left to its static position — a button is
                          text-align:center, so an unanchored absolute knob starts mid-track
                          and overflows the pill. */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={r.enabled}
                          aria-label={r.enabled ? "Disable this mapping" : "Enable this mapping"}
                          onClick={() => patch(r.key, { enabled: !r.enabled })}
                          className={cn(
                            "relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0",
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                            r.enabled ? "bg-rose-500" : "bg-muted border border-border",
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                              r.enabled ? "translate-x-5" : "translate-x-0",
                            )}
                          />
                        </button>
                        {/* The column headers are hidden on narrow screens, so label it there. */}
                        <span className="md:hidden text-[11px] text-muted-foreground">
                          {r.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        aria-label="Remove mapping"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted transition-colors justify-self-end"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {(titlesDiffer || targetUnseen) && (
                      <div className="mt-1.5 space-y-1">
                        {titlesDiffer && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            These two lists have different names —{" "}
                            <span className="font-medium">{src?.title}</span> vs{" "}
                            <span className="font-medium">{tgt?.title}</span>. Make sure that is deliberate.
                          </p>
                        )}
                        {targetUnseen && (
                          <div className="rounded-lg border border-amber-300/50 bg-amber-50/70 dark:bg-amber-950/25 px-2.5 py-2 flex items-start gap-2.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-amber-600 dark:text-amber-400" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                                CREAGLOBE list <span className="font-mono font-medium">{r.targetCode}</span> was not seen
                                in the scan — Metakocka only reveals a list through the products on it, so it is either
                                empty or does not exist.
                              </p>
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={!!r.allowUnseenTarget}
                                onClick={() => patch(r.key, { allowUnseenTarget: !r.allowUnseenTarget })}
                                className={cn(
                                  "mt-1.5 inline-flex items-center gap-2 rounded-md px-2 py-1 -mx-1 text-[11px] font-medium transition-colors",
                                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  r.allowUnseenTarget
                                    ? "text-amber-800 dark:text-amber-200"
                                    : "text-amber-700/80 dark:text-amber-300/80 hover:text-amber-800 dark:hover:text-amber-200",
                                )}
                              >
                                <span
                                  className={cn(
                                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                    r.allowUnseenTarget
                                      ? "bg-amber-500 border-amber-500"
                                      : "border-amber-400/70 bg-background",
                                  )}
                                >
                                  {r.allowUnseenTarget && <Check className="w-2.5 h-2.5 text-white" />}
                                </span>
                                Write to it anyway
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {rows.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <p className="text-[13px] text-muted-foreground">
                    Nothing is mapped yet, so a run would do nothing.
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Add a pair by hand, or start from the title suggestions.
                  </p>
                </div>
              )}
            </div>

            <div className="px-4 py-2 border-t border-border/60 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={addRow} className="h-7 text-xs gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Add mapping
              </Button>
              {dirty && <span className="text-[11px] text-amber-600 dark:text-amber-400">Unsaved changes</span>}
            </div>
          </div>

          {/* What each company actually has — the answer to "list the price lists". */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ListsColumn
              title="T4A price lists"
              company="T4A"
              lists={sourceLists}
              productCount={data?.source.productCount ?? 0}
            />
            <ListsColumn
              title="CREAGLOBE price lists"
              company="CREAGLOBE"
              lists={targetLists}
              productCount={data?.target.productCount ?? 0}
            />
          </div>

          {data && (
            <p className="text-[11px] text-muted-foreground px-0.5">
              Scanned {new Date(data.scannedAt).toLocaleString("en-GB")}
              {data.cached && " (cached — press Rescan for a fresh read)"}. Metakocka has no
              list-price-lists endpoint, so these are derived from the products on them: a list with no
              products on it cannot appear here.
            </p>
          )}
        </>
      )}
    </section>
  );
}
