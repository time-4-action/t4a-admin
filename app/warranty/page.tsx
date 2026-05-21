"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { WarrantyStatusBadge } from "@/components/warranty-status-badge";
import {
  WARRANTY_STATUSES,
  WARRANTY_STATUS_LABELS,
  type ListWarrantyResult,
  type WarrantyStatus,
  type WarrantySubmission,
} from "@/types/warranty";
import { Search, ShieldCheck, ChevronRight, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | WarrantyStatus;

const STATUS_FILTERS: StatusFilter[] = ["all", ...WARRANTY_STATUSES];

function joinName(name: string, surname: string): string {
  return [name, surname].filter((x) => x?.trim()).join(" ").trim();
}

function fmtSubmitted(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export default function WarrantyListPage() {
  const [items, setItems] = useState<WarrantySubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [counts, setCounts] = useState<Record<StatusFilter, number>>({
    all: 0,
    new: 0,
    in_review: 0,
    approved: 0,
    rejected: 0,
    shipped: 0,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (status !== "all") qs.set("status", status);
    if (search.trim()) qs.set("q", search.trim());
    qs.set("limit", "200");
    fetch(`/api/warranty/submissions?${qs.toString()}`)
      .then(async (r) => {
        const data = (await r.json()) as ListWarrantyResult | { error: string };
        if (cancelled) return;
        if (!r.ok || "error" in data) {
          setError("error" in data ? data.error : "Failed to load");
          setItems([]);
          setTotal(0);
        } else {
          setItems(data.items);
          setTotal(data.total);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, search]);

  // Background fetch for status counts (independent of current filter).
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      STATUS_FILTERS.map((s) =>
        fetch(
          `/api/warranty/submissions?limit=1${s === "all" ? "" : `&status=${s}`}`,
        )
          .then((r) => (r.ok ? r.json() : { total: 0 }))
          .then((d: { total?: number }) => ({ s, total: d.total ?? 0 })),
      ),
    ).then((rows) => {
      if (cancelled) return;
      const next = { ...counts };
      for (const { s, total } of rows) next[s] = total;
      setCounts(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="text-sm font-semibold text-foreground shrink-0">Warranty submissions</h1>
            {total > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                {total}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search claims…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 w-44 md:w-60 text-xs bg-background"
              />
            </div>
            <Link
              href="/warranty/settings"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Email settings</span>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 md:px-8 pb-3">
          <div className="relative sm:hidden flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search claims…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-background w-full"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto sm:flex-none">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors select-none whitespace-nowrap",
                  status === s
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground",
                )}
              >
                {s === "all" ? `All (${counts.all})` : `${WARRANTY_STATUS_LABELS[s]} (${counts[s]})`}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        {error && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive">
            {error}
          </div>
        )}
        <div className="bg-background border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">Submitted</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Claim</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Customer</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Product</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Serial</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Status</TableHead>
                <TableHead className="h-9 w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i} className="border-b border-border/60">
                      <TableCell className="pl-5 py-3">
                        <div className="h-3 w-24 rounded skeleton" style={{ animationDelay: `${i * 80}ms` }} />
                      </TableCell>
                      <TableCell><div className="h-3 w-20 rounded skeleton" style={{ animationDelay: `${i * 80 + 20}ms` }} /></TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          <div className="h-3 w-28 rounded skeleton" style={{ animationDelay: `${i * 80 + 40}ms` }} />
                          <div className="h-2.5 w-36 rounded skeleton" style={{ animationDelay: `${i * 80 + 60}ms` }} />
                        </div>
                      </TableCell>
                      <TableCell><div className="h-3 w-32 rounded skeleton" style={{ animationDelay: `${i * 80 + 50}ms` }} /></TableCell>
                      <TableCell><div className="h-3 w-20 rounded skeleton" style={{ animationDelay: `${i * 80 + 70}ms` }} /></TableCell>
                      <TableCell><div className="h-5 w-20 rounded-full skeleton" style={{ animationDelay: `${i * 80 + 90}ms` }} /></TableCell>
                      <TableCell />
                    </TableRow>
                  ))
                : items.map((item) => {
                    const fullName = joinName(item.name, item.surname);
                    const shortId = item.submissionId.slice(0, 8);
                    return (
                      <TableRow
                        key={item.submissionId}
                        className="border-b border-border/60 hover:bg-muted/30 transition-colors"
                      >
                        <TableCell className="pl-5 py-3 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                          {fmtSubmitted(item.submittedAt)}
                        </TableCell>
                        <TableCell className="text-[12px] font-mono text-muted-foreground">
                          #{shortId}
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <Link
                              href={`/warranty/${encodeURIComponent(item.submissionId)}`}
                              className="text-[13px] font-medium text-foreground hover:underline block truncate leading-tight"
                            >
                              {fullName || "—"}
                            </Link>
                            <span className="text-[11px] text-muted-foreground block truncate leading-tight">
                              {item.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-[13px] text-foreground">
                          <span className="truncate block max-w-[260px]">{item.productName || "—"}</span>
                          {item.productCategory && (
                            <span className="text-[11px] text-muted-foreground truncate block max-w-[260px]">
                              {item.productCategory}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-[12px] font-mono text-muted-foreground truncate max-w-[140px]">
                          {item.serialNumber || "—"}
                        </TableCell>
                        <TableCell>
                          <WarrantyStatusBadge status={item.status} />
                        </TableCell>
                        <TableCell className="pr-4">
                          <Link
                            href={`/warranty/${encodeURIComponent(item.submissionId)}`}
                            className="flex items-center justify-end text-muted-foreground hover:text-foreground transition-colors"
                            title="Open"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              {!loading && items.length === 0 && !error && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-[13px] text-muted-foreground py-16">
                    <ShieldCheck className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
                    No submissions match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
