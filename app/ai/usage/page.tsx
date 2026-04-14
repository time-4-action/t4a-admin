"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/lib/currency-context";
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, X, ChevronDown as DropdownChevron, Check } from "lucide-react";

type Row = {
  userId: string;
  email: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  conversationCount: number;
  totalCostUsd: number;
};

type SortKey = keyof Omit<Row, "userId" | "email" | "modelId">;
type SortDir = "asc" | "desc";

const compact = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="inline ml-1 w-3 h-3 opacity-25" />;
  return sortDir === "asc"
    ? <ChevronUp className="inline ml-1 w-3 h-3" />
    : <ChevronDown className="inline ml-1 w-3 h-3" />;
}

export default function UsagePage() {
  const { fmt } = useCurrency();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailFilter, setEmailFilter] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLTableCellElement>(null);
  const modelDropdownMenuRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>("totalCostUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    fetch("/api/admin/usage")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRows(data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inTh = modelDropdownRef.current?.contains(target);
      const inMenu = modelDropdownMenuRef.current?.contains(target);
      if (!inTh && !inMenu) setModelDropdownOpen(false);
    }
    if (modelDropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modelDropdownOpen]);

  const modelDropdownPos = useMemo(() => {
    if (!modelDropdownOpen || !modelDropdownRef.current) return null;
    const rect = modelDropdownRef.current.getBoundingClientRect();
    return { top: rect.bottom + 4, left: rect.left };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelDropdownOpen]);

  const allModels = useMemo(() => [...new Set(rows.map((r) => r.modelId))].sort(), [rows]);

  function toggleModel(m: string) {
    setSelectedModels((p) => p.includes(m) ? p.filter((x) => x !== m) : [...p, m]);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const hasFilters = emailFilter.trim() !== "" || selectedModels.length > 0;

  const filtered = useMemo(() => {
    let r = rows;
    if (emailFilter.trim()) r = r.filter((x) => x.email.toLowerCase().includes(emailFilter.toLowerCase()));
    if (selectedModels.length) r = r.filter((x) => selectedModels.includes(x.modelId));
    if (sortKey) r = [...r].sort((a, b) => sortDir === "asc" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]);
    return r;
  }, [rows, emailFilter, selectedModels, sortKey, sortDir]);

  const totals = useMemo(() => filtered.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + r.cacheReadTokens,
      cacheCreationTokens: acc.cacheCreationTokens + r.cacheCreationTokens,
      conversationCount: acc.conversationCount + r.conversationCount,
      totalCostUsd: acc.totalCostUsd + r.totalCostUsd,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, conversationCount: 0, totalCostUsd: 0 }
  ), [filtered]);

  const SortHead = ({ col, label }: { col: SortKey; label: string }) => (
    <TableHead>
      <button className="flex items-center gap-0.5 ml-auto hover:text-foreground transition-colors whitespace-nowrap select-none" onClick={() => handleSort(col)}>
        {label}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </button>
    </TableHead>
  );

  const summaryStats = [
    { label: "Rows",          value: compact(filtered.length) },
    { label: "Conversations", value: compact(totals.conversationCount) },
    { label: "Input tokens",  value: compact(totals.inputTokens) },
    { label: "Output tokens", value: compact(totals.outputTokens) },
    { label: "Total cost",    value: fmt(totals.totalCostUsd) },
  ];

  return (
    <div className="flex flex-col h-full relative">
      {/* Page header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <h1 className="text-sm font-semibold text-foreground">Usage</h1>

        {/* Inline filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter by email…"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              className="pl-8 h-8 w-36 sm:w-52 text-xs bg-background"
            />
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setEmailFilter(""); setSelectedModels([]); }}>
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-5">
        {/* Summary strip */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {summaryStats.map(({ label, value }) => (
              <div key={label} className="bg-background border border-border rounded-xl px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="text-[15px] font-semibold text-foreground mt-1 tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <>
            {/* Summary strip skeleton */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-background border border-border rounded-xl px-4 py-3">
                  <div className="skeleton h-2.5 w-16 rounded mb-2.5" style={{ animationDelay: `${i * 60}ms` }} />
                  <div className="skeleton h-5 w-14 rounded" style={{ animationDelay: `${i * 60 + 40}ms` }} />
                </div>
              ))}
            </div>
            {/* Table skeleton */}
            <div className="bg-background border border-border rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead className="h-9 pl-5"><div className="skeleton h-2.5 w-8 rounded" /></TableHead>
                    <TableHead className="h-9"><div className="skeleton h-2.5 w-10 rounded" /></TableHead>
                    {[60, 50, 55, 65, 70, 55].map((w, i) => (
                      <TableHead key={i} className="h-9">
                        <div className="skeleton h-2.5 rounded ml-auto" style={{ width: w, animationDelay: `${i * 40}ms` }} />
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...Array(8)].map((_, i) => (
                    <TableRow key={i} className="border-b border-border/60">
                      <TableCell className="pl-5 py-3">
                        <div className="skeleton h-3 w-44 rounded" style={{ animationDelay: `${i * 60}ms` }} />
                      </TableCell>
                      <TableCell>
                        <div className="skeleton h-4 w-32 rounded-md" style={{ animationDelay: `${i * 60 + 20}ms` }} />
                      </TableCell>
                      {[32, 40, 40, 40, 48, 40].map((w, j) => (
                        <TableCell key={j} className="text-right">
                          <div className="skeleton h-3 rounded ml-auto" style={{ width: w, animationDelay: `${i * 60 + j * 20 + 40}ms` }} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : filtered.length === 0 ? (
          <div className="border border-border rounded-xl py-20 text-center text-[13px] text-muted-foreground">
            No rows match the current filters.
          </div>
        ) : (
          <div className="bg-background border border-border rounded-xl overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border">
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">Email</TableHead>
                  <TableHead ref={modelDropdownRef} className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">
                    <button
                      onClick={() => setModelDropdownOpen((o) => !o)}
                      className={`flex items-center gap-1 select-none transition-colors hover:text-foreground ${selectedModels.length > 0 ? "text-foreground" : ""}`}
                    >
                      Model
                      {selectedModels.length > 0 && (
                        <span className="bg-foreground text-background rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">{selectedModels.length}</span>
                      )}
                      <DropdownChevron className={`w-3 h-3 transition-transform ${modelDropdownOpen ? "rotate-180" : ""}`} />
                    </button>
                  </TableHead>
                  <SortHead col="conversationCount"   label="Convos" />
                  <SortHead col="inputTokens"         label="Input" />
                  <SortHead col="outputTokens"        label="Output" />
                  <SortHead col="cacheReadTokens"     label="Cache read" />
                  <SortHead col="cacheCreationTokens" label="Cache create" />
                  <SortHead col="totalCostUsd"        label="Cost" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow
                    key={i}
                    className="border-b border-border/60 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => router.push(`/users/${encodeURIComponent(r.userId)}`)}
                  >
                    <TableCell className="pl-5 text-[12px] py-3">{r.email}</TableCell>
                    <TableCell>
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md whitespace-nowrap">{r.modelId}</span>
                    </TableCell>
                    <TableCell className="text-right text-[12px] tabular-nums">{compact(r.conversationCount)}</TableCell>
                    <TableCell className="text-right text-[12px] tabular-nums">{compact(r.inputTokens)}</TableCell>
                    <TableCell className="text-right text-[12px] tabular-nums">{compact(r.outputTokens)}</TableCell>
                    <TableCell className="text-right text-[12px] tabular-nums">{compact(r.cacheReadTokens)}</TableCell>
                    <TableCell className="text-right text-[12px] tabular-nums">{compact(r.cacheCreationTokens)}</TableCell>
                    <TableCell className="text-right text-[12px] font-semibold tabular-nums pr-5">{fmt(r.totalCostUsd)}</TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow className="bg-muted/30 border-t-2 border-border hover:bg-muted/30">
                  <TableCell className="pl-5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3" colSpan={2}>Totals</TableCell>
                  <TableCell className="text-right text-[12px] font-semibold tabular-nums">{compact(totals.conversationCount)}</TableCell>
                  <TableCell className="text-right text-[12px] font-semibold tabular-nums">{compact(totals.inputTokens)}</TableCell>
                  <TableCell className="text-right text-[12px] font-semibold tabular-nums">{compact(totals.outputTokens)}</TableCell>
                  <TableCell className="text-right text-[12px] font-semibold tabular-nums">{compact(totals.cacheReadTokens)}</TableCell>
                  <TableCell className="text-right text-[12px] font-semibold tabular-nums">{compact(totals.cacheCreationTokens)}</TableCell>
                  <TableCell className="text-right text-[12px] font-semibold tabular-nums pr-5">{fmt(totals.totalCostUsd)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Model filter dropdown — rendered outside table to avoid overflow-hidden clipping */}
      {modelDropdownOpen && modelDropdownPos && (
        <div
          ref={modelDropdownMenuRef}
          style={{ position: "fixed", top: modelDropdownPos.top, left: modelDropdownPos.left }}
          className="z-50 bg-background border border-border rounded-xl shadow-lg py-1 min-w-[220px]"
        >
          {allModels.map((m) => (
            <button
              key={m}
              onClick={() => toggleModel(m)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${selectedModels.includes(m) ? "bg-foreground border-foreground" : "border-border"}`}>
                {selectedModels.includes(m) && <Check className="w-2.5 h-2.5 text-background" />}
              </span>
              <span className="text-[10px] font-mono text-foreground">{m}</span>
            </button>
          ))}
          {selectedModels.length > 0 && (
            <>
              <div className="border-t border-border mx-2 my-1" />
              <button
                onClick={() => { setSelectedModels([]); setModelDropdownOpen(false); }}
                className="w-full px-3 py-2 text-left text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      )}

    </div>
  );
}
