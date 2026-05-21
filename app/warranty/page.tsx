"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WarrantyStatusBadge } from "@/components/warranty-status-badge";
import { WarrantyKanban, type BoardGrouping } from "@/components/warranty-kanban";
import {
  ASSIGNEES,
  WARRANTY_STATUSES,
  WARRANTY_STATUS_LABELS,
  WARRANTY_TYPE_LABELS,
  type Assignee,
  type ListWarrantyResult,
  type WarrantyStatus,
  type WarrantySubmission,
} from "@/types/warranty";
import {
  Search,
  ShieldCheck,
  ChevronRight,
  Settings,
  LayoutGrid,
  List,
  MessageSquare,
  Loader2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | WarrantyStatus;
type AssigneeFilter = "all" | "unassigned" | Assignee;
type ViewMode = "table" | "status_board" | "assignee_board";
const ASSIGNEE_NONE = "__none__";

const STATUS_FILTERS: StatusFilter[] = ["all", ...WARRANTY_STATUSES];

function joinName(name: string, surname: string): string {
  return [name, surname].filter((x) => x?.trim()).join(" ").trim();
}

function fmtSubmitted(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export default function ClaimsPage() {
  const [items, setItems] = useState<WarrantySubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [assignee, setAssignee] = useState<AssigneeFilter>("all");
  const [view, setView] = useState<ViewMode>("table");
  const [counts, setCounts] = useState<Record<StatusFilter, number>>({
    all: 0,
    open: 0,
    in_review: 0,
    decided: 0,
    to_send_new_product: 0,
    finished: 0,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (status !== "all") qs.set("status", status);
    if (assignee !== "all") qs.set("assignee", assignee);
    if (search.trim()) qs.set("q", search.trim());
    qs.set("limit", view === "table" ? "200" : "500");
    fetch(`/api/warranty/submissions?${qs.toString()}`)
      .then(async (r) => {
        const data = (await r.json()) as ListWarrantyResult | { error: string };
        if (cancelled) return;
        if (!r.ok || "error" in data) {
          setError("error" in data ? data.error : "Couldn't load claims");
          setItems([]);
          setTotal(0);
        } else {
          setItems(data.items);
          setTotal(data.total);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load claims");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, assignee, search, view]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      STATUS_FILTERS.map((s) =>
        fetch(
          `/api/warranty/submissions?limit=1${s === "all" ? "" : `&status=${s}`}${assignee !== "all" ? `&assignee=${assignee}` : ""}`,
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
  }, [items.length, assignee]);

  const filtered = items;

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="text-sm font-semibold text-foreground shrink-0">Warranty claims</h1>
            {total > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                {total}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="hidden md:flex items-center rounded-md bg-muted p-0.5">
              <ViewToggleButton
                active={view === "table"}
                onClick={() => setView("table")}
                title="Table view"
                icon={<List className="w-3 h-3" />}
                label="Table"
              />
              <ViewToggleButton
                active={view === "status_board"}
                onClick={() => setView("status_board")}
                title="By status — drag claims through the pipeline"
                icon={<LayoutGrid className="w-3 h-3" />}
                label="By status"
              />
              <ViewToggleButton
                active={view === "assignee_board"}
                onClick={() => setView("assignee_board")}
                title="By assignee — drag claims onto a person"
                icon={<Users className="w-3 h-3" />}
                label="By assignee"
              />
            </div>

            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search claims…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 w-40 md:w-56 text-xs bg-background"
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
        <div className="flex items-center gap-2 px-4 md:px-8 pb-3 flex-wrap">
          {/* Mobile search */}
          <div className="relative sm:hidden flex-1 basis-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search claims…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-background w-full"
            />
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
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

          {/* Assignee filter */}
          <Select
            value={assignee}
            onValueChange={(v) => setAssignee(v as AssigneeFilter)}
          >
            <SelectTrigger className="h-8 text-[11px] w-[140px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {ASSIGNEES.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        {error && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive">
            {error}
          </div>
        )}

        {view !== "table" ? (
          loading ? (
            <BoardSkeleton wide={view === "assignee_board"} />
          ) : (
            <WarrantyKanban
              items={filtered}
              grouping={(view === "assignee_board" ? "assignee" : "status") as BoardGrouping}
              onPersisted={(updated) =>
                setItems((prev) =>
                  prev.map((p) =>
                    p.submissionId === updated.submissionId ? updated : p,
                  ),
                )
              }
            />
          )
        ) : (
          <ClaimsTable
            items={filtered}
            loading={loading}
            onAssigneeChange={(updated) =>
              setItems((prev) =>
                prev.map((p) =>
                  p.submissionId === updated.submissionId ? updated : p,
                ),
              )
            }
          />
        )}
      </div>
    </div>
  );
}

function ViewToggleButton({
  active,
  onClick,
  title,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ClaimsTable({
  items,
  loading,
  onAssigneeChange,
}: {
  items: WarrantySubmission[];
  loading: boolean;
  onAssigneeChange: (updated: WarrantySubmission) => void;
}) {
  return (
    <div className="bg-background border border-border rounded-xl overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">Received</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Claim</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Customer</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Product</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Assignee</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Type</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Status</TableHead>
            <TableHead className="h-9 w-[40px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
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
                  <TableCell><div className="h-3 w-16 rounded skeleton" style={{ animationDelay: `${i * 80 + 70}ms` }} /></TableCell>
                  <TableCell><div className="h-3 w-16 rounded skeleton" style={{ animationDelay: `${i * 80 + 80}ms` }} /></TableCell>
                  <TableCell><div className="h-5 w-20 rounded-full skeleton" style={{ animationDelay: `${i * 80 + 90}ms` }} /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            : items.map((item) => (
                <ClaimRow
                  key={item.submissionId}
                  item={item}
                  onAssigneeChange={onAssigneeChange}
                />
              ))}
          {!loading && items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-[13px] text-muted-foreground py-16">
                <ShieldCheck className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
                No claims match your filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ClaimRow({
  item,
  onAssigneeChange,
}: {
  item: WarrantySubmission;
  onAssigneeChange: (updated: WarrantySubmission) => void;
}) {
  const fullName = joinName(item.name, item.surname);
  const shortId = item.submissionId.slice(0, 8);
  const href = `/warranty/${encodeURIComponent(item.submissionId)}`;
  return (
    <TableRow className="border-b border-border/60 hover:bg-muted/30 transition-colors group">
      <TableCell className="pl-5 py-3 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
        <Link href={href} className="block">{fmtSubmitted(item.submittedAt)}</Link>
      </TableCell>
      <TableCell className="text-[12px] font-mono text-muted-foreground">
        <Link href={href} className="hover:text-foreground transition-colors flex items-center gap-1.5">
          #{shortId}
          {item.notes.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <MessageSquare className="w-2.5 h-2.5" />
              {item.notes.length}
            </span>
          )}
        </Link>
      </TableCell>
      <TableCell>
        <Link href={href} className="min-w-0 block">
          <div className="text-[13px] font-medium text-foreground group-hover:underline truncate leading-tight">
            {fullName || "—"}
          </div>
          <span className="text-[11px] text-muted-foreground block truncate leading-tight">
            {item.email}
          </span>
        </Link>
      </TableCell>
      <TableCell>
        <Link href={href} className="block">
          <span className="text-[13px] text-foreground truncate block max-w-[240px]">{item.productName || "—"}</span>
          {item.serialNumber && (
            <span className="text-[10px] font-mono text-muted-foreground truncate block max-w-[240px]">
              {item.serialNumber}
            </span>
          )}
        </Link>
      </TableCell>
      <TableCell>
        <InlineAssigneePicker item={item} onChange={onAssigneeChange} />
      </TableCell>
      <TableCell className="text-[12px] text-foreground whitespace-nowrap">
        {item.warrantyType ? (
          <span
            className={cn(
              "text-[11px] font-medium",
              item.warrantyType === "denied"
                ? "text-destructive"
                : "text-foreground",
            )}
          >
            {WARRANTY_TYPE_LABELS[item.warrantyType]}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <WarrantyStatusBadge status={item.status} />
      </TableCell>
      <TableCell className="pr-4">
        <Link
          href={href}
          className="flex items-center justify-end text-muted-foreground hover:text-foreground transition-colors"
          title="Open"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </TableCell>
    </TableRow>
  );
}

function InlineAssigneePicker({
  item,
  onChange,
}: {
  item: WarrantySubmission;
  onChange: (updated: WarrantySubmission) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(next: Assignee | null) {
    setSaving(true);
    setError(false);
    const res = await fetch(
      `/api/warranty/submissions/${encodeURIComponent(item.submissionId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignee: next }),
      },
    );
    setSaving(false);
    if (!res.ok) {
      setError(true);
      setTimeout(() => setError(false), 2500);
      return;
    }
    const updated = (await res.json()) as WarrantySubmission;
    onChange(updated);
  }

  return (
    <Select
      value={item.assignee ?? ASSIGNEE_NONE}
      onValueChange={(v) => save(v === ASSIGNEE_NONE ? null : (v as Assignee))}
      disabled={saving}
    >
      <SelectTrigger
        className={cn(
          "h-7 w-[140px] text-[12px] gap-1.5 px-2",
          error && "border-destructive ring-destructive/30",
        )}
      >
        {saving ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Saving…
          </span>
        ) : item.assignee ? (
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-muted border border-border/60 flex items-center justify-center text-[9px] font-bold">
              {item.assignee[0]}
            </span>
            {item.assignee}
          </span>
        ) : (
          <span className="text-muted-foreground italic">Unassigned</span>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ASSIGNEE_NONE}>Unassigned</SelectItem>
        {ASSIGNEES.map((a) => (
          <SelectItem key={a} value={a}>
            {a}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BoardSkeleton({ wide = false }: { wide?: boolean }) {
  const columns = wide ? 8 : WARRANTY_STATUSES.length;
  return (
    <div
      className={cn(
        "grid gap-3 min-h-[60vh]",
        wide
          ? "grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8"
          : "grid-cols-1 md:grid-cols-3 lg:grid-cols-5",
      )}
    >
      {Array.from({ length: columns }).map((_, ci) => {
        const cards = 2 + (ci % 3);
        return (
          <div key={ci} className="flex flex-col">
            <div className="rounded-t-xl border-2 border-b-0 border-border bg-muted/40 px-3 py-2 flex items-center justify-between">
              <div className="h-3 w-20 skeleton rounded" />
              <div className="h-3 w-6 skeleton rounded-full" />
            </div>
            <div className="flex-1 rounded-b-xl border-2 border-t-0 border-border bg-muted/30 px-2 py-2 space-y-2">
              {Array.from({ length: cards }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border bg-background p-2.5 space-y-1.5">
                  <div className="h-2.5 w-16 skeleton rounded" style={{ animationDelay: `${i * 40}ms` }} />
                  <div className="h-3 w-28 skeleton rounded" style={{ animationDelay: `${i * 40 + 30}ms` }} />
                  <div className="h-2.5 w-20 skeleton rounded" style={{ animationDelay: `${i * 40 + 60}ms` }} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
