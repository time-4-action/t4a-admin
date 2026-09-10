"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrency } from "@/lib/currency-context";
import { isAiRole } from "@/lib/ai-role";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, Euro, MessageSquare, Gauge, Bot, ShieldCheck, ShieldAlert,
  Check, AlertTriangle, RotateCcw, Trash2, Pencil, Lock, UserCog, Loader2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";

const compact = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

type UsageDoc = {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCostUsd: number;
};

type LimitDoc = { limitUsd: number; period: string; currentSpendUsd: number } | null;
type Role = { id: string; name: string; description?: string };

const isAdminRole = (n: string) => n.toLowerCase().includes("admin");
type RoleKind = "ai" | "admin" | "default";
function getRoleKind(name: string): RoleKind {
  if (isAiRole(name)) return "ai";
  if (isAdminRole(name)) return "admin";
  return "default";
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function UserDetailStats({
  totalCost,
  convCount,
  limitDoc,
}: {
  totalCost: number;
  convCount: number;
  limitDoc: LimitDoc;
}) {
  const { currency, fmt, fmtLimit } = useCurrency();
  const SpendIcon = currency === "EUR" ? Euro : DollarSign;
  const pct = limitDoc ? Math.min((limitDoc.currentSpendUsd / limitDoc.limitUsd) * 100, 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Total spend */}
      <div className="bg-background rounded-2xl border border-border/60 px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Total spend
          </span>
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
            <SpendIcon className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>
        <p className="text-2xl font-bold text-foreground tracking-tight tabular-nums">{fmt(totalCost)}</p>
        <p className="text-[11px] text-muted-foreground mt-1">lifetime</p>
      </div>

      {/* Conversations */}
      <div className="bg-background rounded-2xl border border-border/60 px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Conversations
          </span>
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>
        <p className="text-2xl font-bold text-foreground tracking-tight tabular-nums">{compact(convCount)}</p>
        <p className="text-[11px] text-muted-foreground mt-1">total</p>
      </div>

      {/* Spending limit */}
      <div className="bg-background rounded-2xl border border-border/60 px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Spending limit
          </span>
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
            <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>
        {limitDoc ? (
          <>
            <p className="text-2xl font-bold text-foreground tracking-tight tabular-nums">
              {fmtLimit(limitDoc.limitUsd)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">per {limitDoc.period}</p>
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground tabular-nums">{fmt(limitDoc.currentSpendUsd)} used</span>
                <span className={cn(
                  "text-[10px] font-semibold tabular-nums",
                  pct > 80 ? "text-destructive" : pct > 60 ? "text-foreground" : "text-muted-foreground"
                )}>
                  {Math.round(pct)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    pct > 80 ? "bg-destructive" : pct > 60 ? "bg-foreground" : "bg-accent-brand"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-2xl font-bold text-muted-foreground/40 tracking-tight">—</p>
            <p className="text-[11px] text-muted-foreground mt-1">not set</p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Usage Table ──────────────────────────────────────────────────────────────

export function UserUsageTable({
  usageDocs,
  totalCost,
}: {
  usageDocs: UsageDoc[];
  totalCost: number;
}) {
  const { fmt } = useCurrency();

  if (usageDocs.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 py-12 text-center bg-background shadow-sm">
        <p className="text-[13px] text-muted-foreground">No usage recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-background rounded-2xl border border-border/60 overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border/60">
            {["Model", "Input", "Output", "Cache read", "Cache create", "Cost"].map((h, i) => (
              <TableHead
                key={h}
                className={cn(
                  "text-[10px] uppercase tracking-widest font-semibold text-muted-foreground h-9",
                  i > 0 ? "text-right" : "pl-5"
                )}
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {usageDocs.map((u) => {
            const pct = totalCost > 0 ? (u.totalCostUsd / totalCost) * 100 : 0;
            return (
              <TableRow key={u.modelId} className="border-b border-border/40 hover:bg-muted/20 transition-colors group">
                <TableCell className="pl-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                      {u.modelId}
                    </span>
                    {pct > 0 && (
                      <div className="w-16 h-1 rounded-full bg-muted overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="h-full rounded-full bg-foreground/20" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right text-[12px] tabular-nums text-muted-foreground">{compact(u.inputTokens)}</TableCell>
                <TableCell className="text-right text-[12px] tabular-nums text-muted-foreground">{compact(u.outputTokens)}</TableCell>
                <TableCell className="text-right text-[12px] tabular-nums text-muted-foreground">{compact(u.cacheReadTokens)}</TableCell>
                <TableCell className="text-right text-[12px] tabular-nums text-muted-foreground">{compact(u.cacheCreationTokens)}</TableCell>
                <TableCell className="text-right text-[12px] font-semibold tabular-nums pr-5">{fmt(u.totalCostUsd)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Conversations ────────────────────────────────────────────────────────────

type ConversationItem = {
  id: string;
  title: string;
  model: string;
  totalCostUsd: number;
  createdAt: string | null;
  messageCount: number;
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export function UserConversations({ userId }: { userId: string }) {
  const { fmt } = useCurrency();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/users/${encodeURIComponent(userId)}/conversations`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setConversations(data); })
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <UserConversationsSkeleton />;

  if (conversations.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 py-12 text-center bg-background shadow-sm">
        <p className="text-[13px] text-muted-foreground">No conversations recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((conv) => (
        <a
          key={conv.id}
          href={`https://chat.time-4-action.com/chat/${conv.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 px-4 py-3.5 border border-border/60 rounded-2xl hover:bg-muted/20 transition-colors group bg-background shadow-sm"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate">{conv.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {conv.model && (
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">{conv.model}</span>
              )}
              <span className="text-[11px] text-muted-foreground">{conv.messageCount} messages</span>
              <span className="text-[11px] text-muted-foreground">{fmtDate(conv.createdAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2 mt-0.5">
            <span className="text-[12px] font-semibold tabular-nums">{fmt(conv.totalCostUsd)}</span>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── Sidebar section wrapper ──────────────────────────────────────────────────

function SidebarCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-muted/30">
        <div className="w-5 h-5 rounded-md bg-background border border-border/60 flex items-center justify-center shadow-sm">
          <Icon className="w-3 h-3 text-muted-foreground" />
        </div>
        <span className="text-[11px] font-semibold text-foreground">{title}</span>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

function SaveButton({
  onClick,
  saving,
  saved,
  disabled,
}: {
  onClick: () => void;
  saving: boolean;
  saved: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      size="sm"
      className={cn(
        "h-7 text-xs px-3 transition-all duration-200",
        saved && "bg-accent-brand hover:bg-accent-brand border-accent-brand text-accent-brand-foreground"
      )}
      onClick={onClick}
      disabled={disabled || saving || saved}
    >
      {saved ? (
        <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
      ) : saving ? (
        <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>
      ) : "Save"}
    </Button>
  );
}

// ─── DnD Access helpers ───────────────────────────────────────────────────────

function RoleChip({ role, isDragging }: { role: Role; isDragging?: boolean }) {
  const kind = getRoleKind(role.name);
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-medium select-none",
      isDragging && "shadow-lg opacity-90 rotate-2 scale-105",
      kind === "ai" && "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-700/50 dark:text-blue-300",
      kind === "admin" && "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/40 dark:border-orange-700/50 dark:text-orange-300",
      kind === "default" && "bg-muted border-border text-foreground",
    )}>
      {kind === "ai"
        ? <Bot className="w-3 h-3 shrink-0" />
        : kind === "admin"
        ? <ShieldAlert className="w-3 h-3 shrink-0" />
        : <ShieldCheck className="w-3 h-3 shrink-0" />
      }
      <span className="truncate">{role.name}</span>
    </div>
  );
}

function DraggableRole({ role }: { role: Role }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: role.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-30")}
    >
      <RoleChip role={role} />
    </div>
  );
}

function AccessColumn({
  id,
  label,
  roles,
  draggingId,
}: {
  id: string;
  label: string;
  roles: Role[];
  draggingId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const isAssigned = id === "assigned";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
        {roles.length > 0 && (
          <span className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
            isAssigned ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" : "bg-muted text-muted-foreground"
          )}>
            {roles.length}
          </span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-[80px] rounded-xl border-2 border-dashed p-2 flex flex-col gap-1 transition-colors duration-150",
          isOver
            ? isAssigned
              ? "border-blue-400 bg-blue-50/60 dark:bg-blue-950/20"
              : "border-muted-foreground/40 bg-muted/40"
            : "border-border/40 bg-muted/20",
          draggingId && !isOver && "border-border/60",
        )}
      >
        {roles.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/50 text-center m-auto">
            {isAssigned ? "Drop here to assign" : "Drop here to remove"}
          </p>
        ) : (
          roles.map((role) => <DraggableRole key={role.id} role={role} />)
        )}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function UserDetailSidebar({
  user,
  allRoles,
  currentRoles,
}: {
  user: { id: string; name: string; email: string; picture?: string; limit: LimitDoc };
  allRoles: Role[];
  currentRoles: Role[];
}) {
  const router = useRouter();
  const { currency, toDisplay, toUsd } = useCurrency();
  const symbol = currency === "EUR" ? "€" : "$";

  // ── Edit Details ──────────────────────────────────────────────────────────
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [picture, setPicture] = useState(user.picture ?? "");
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  const [editError, setEditError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function saveEdit() {
    setEditSaving(true);
    setEditError("");
    const payload: Record<string, string> = { name, email };
    if (picture) payload.picture = picture;
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setEditSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setEditError(data.error ?? "Failed to save");
      return;
    }
    setEditSaved(true);
    setTimeout(() => setEditSaved(false), 2500);
    router.refresh();
  }

  async function sendPasswordReset() {
    setResetting(true);
    await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/send-password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setResetting(false);
    setResetSent(true);
    setTimeout(() => setResetSent(false), 3000);
  }

  // ── Spending Limit ────────────────────────────────────────────────────────
  const initialDisplay = user.limit?.limitUsd != null ? toDisplay(user.limit.limitUsd).toFixed(2) : "";
  const [limitValue, setLimitValue] = useState(initialDisplay);
  const [period, setPeriod] = useState(user.limit?.period ?? "monthly");
  const [limitSaving, setLimitSaving] = useState(false);
  const [limitSaved, setLimitSaved] = useState(false);

  async function saveLimit() {
    setLimitSaving(true);
    await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/limit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limitUsd: toUsd(parseFloat(limitValue)), period }),
    });
    setLimitSaving(false);
    setLimitSaved(true);
    setTimeout(() => setLimitSaved(false), 2500);
    router.refresh();
  }

  // ── Access (Roles) ────────────────────────────────────────────────────────
  const [activeIds, setActiveIds] = useState(() => currentRoles.map((r) => r.id));
  const [originalIds] = useState(() => currentRoles.map((r) => r.id));
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [rolesSaving, setRolesSaving] = useState(false);
  const [rolesSaved, setRolesSaved] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = event;
    if (!over) return;
    const roleId = String(active.id);
    const dest = String(over.id); // "assigned" or "available"
    if (dest === "assigned" && !activeIds.includes(roleId)) {
      setActiveIds((p) => [...p, roleId]);
      setConfirmed((p) => p.filter((c) => c !== roleId));
      setRolesSaved(false);
    } else if (dest === "available" && activeIds.includes(roleId)) {
      setActiveIds((p) => p.filter((r) => r !== roleId));
      setConfirmed((p) => p.filter((c) => c !== roleId));
      setRolesSaved(false);
    }
  }

  const sensitiveNew = allRoles.filter(
    (r) => activeIds.includes(r.id) && !originalIds.includes(r.id) && getRoleKind(r.name) !== "default"
  );
  const unconfirmed = sensitiveNew.filter((r) => !confirmed.includes(r.id));
  const rolesChanged = activeIds.some((r) => !originalIds.includes(r)) || originalIds.some((r) => !activeIds.includes(r));

  async function saveRoles() {
    setRolesSaving(true);
    const assign = activeIds.filter((r) => !originalIds.includes(r));
    const remove = originalIds.filter((r) => !activeIds.includes(r));
    await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/roles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assign, remove }),
    });
    setRolesSaving(false);
    setRolesSaved(true);
    setTimeout(() => setRolesSaved(false), 2500);
    router.refresh();
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const [deleteExpanded, setDeleteExpanded] = useState(false);
  const [purge, setPurge] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purge }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? "Failed to delete");
      setDeleting(false);
      return;
    }
    router.push("/users");
  }

  return (
    <div className="p-4 space-y-3">

      {/* ── Edit Details ─────────────────────────────────────────────────── */}
      <SidebarCard icon={Pencil} title="Edit Details">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-[13px]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 text-[13px]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Avatar URL</label>
            <Input
              placeholder="https://…"
              value={picture}
              onChange={(e) => setPicture(e.target.value)}
              className="h-8 text-[13px]"
            />
            {picture && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={picture} alt="" className="mt-2 w-8 h-8 rounded-xl border border-border object-cover" />
            )}
          </div>
          {editError && <p className="text-[11px] text-destructive">{editError}</p>}
          <div className="flex items-center justify-between pt-0.5">
            <button
              onClick={sendPasswordReset}
              disabled={resetting || resetSent}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              {resetSent ? "Email sent!" : resetting ? "Sending…" : "Reset password"}
            </button>
            <SaveButton onClick={saveEdit} saving={editSaving} saved={editSaved} disabled={!name || !email} />
          </div>
        </div>
      </SidebarCard>

      {/* ── Spending Limit ───────────────────────────────────────────────── */}
      <SidebarCard icon={Gauge} title="Spending Limit">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Amount ({currency})</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground select-none">
                {symbol}
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value)}
                placeholder="0.00"
                className="pl-6 h-8 text-[13px]"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Reset period</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="total">Total (never resets)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end pt-0.5">
            <SaveButton onClick={saveLimit} saving={limitSaving} saved={limitSaved} disabled={!limitValue} />
          </div>
        </div>
      </SidebarCard>

      {/* ── Access ───────────────────────────────────────────────────────── */}
      <SidebarCard icon={UserCog} title="Access">
        {allRoles.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-2">No access roles available.</p>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <AccessColumn
                  id="assigned"
                  label="Assigned"
                  roles={allRoles.filter((r) => activeIds.includes(r.id))}
                  draggingId={draggingId}
                />
                <AccessColumn
                  id="available"
                  label="Available"
                  roles={allRoles.filter((r) => !activeIds.includes(r.id))}
                  draggingId={draggingId}
                />
              </div>

              {sensitiveNew.length > 0 && (
                <div className="space-y-1.5">
                  {sensitiveNew.map((role) => {
                    const kind = getRoleKind(role.name);
                    const isConfirmed = confirmed.includes(role.id);
                    return (
                      <div key={role.id} className={cn(
                        "px-3 py-2 rounded-xl text-[11px]",
                        kind === "ai"
                          ? "bg-blue-50/80 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-800/40"
                          : "bg-orange-50/80 border border-orange-100 dark:bg-orange-950/30 dark:border-orange-800/40"
                      )}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <AlertTriangle className={cn("w-3 h-3 shrink-0", kind === "ai" ? "text-blue-500" : "text-orange-500")} />
                          <p className={kind === "ai" ? "text-blue-700 dark:text-blue-300" : "text-orange-700 dark:text-orange-300"}>
                            <span className="font-semibold">{role.name}</span>
                            {kind === "ai" ? " — grants AI access, may incur costs." : " — grants full admin privileges."}
                          </p>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isConfirmed}
                            onChange={(e) =>
                              setConfirmed((p) =>
                                e.target.checked ? [...p, role.id] : p.filter((x) => x !== role.id)
                              )
                            }
                            className="rounded"
                          />
                          <span className={cn(
                            "text-[10px] font-medium",
                            kind === "ai" ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"
                          )}>
                            I confirm this assignment
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end">
                <SaveButton
                  onClick={saveRoles}
                  saving={rolesSaving}
                  saved={rolesSaved}
                  disabled={!rolesChanged || unconfirmed.length > 0}
                />
              </div>
            </div>

            <DragOverlay>
              {draggingId ? (() => {
                const role = allRoles.find((r) => r.id === draggingId);
                if (!role) return null;
                return <RoleChip role={role} isDragging />;
              })() : null}
            </DragOverlay>
          </DndContext>
        )}
      </SidebarCard>

      {/* ── Danger Zone ──────────────────────────────────────────────────── */}
      <SidebarCard icon={Lock} title="Danger Zone">
        {!deleteExpanded ? (
          <button
            onClick={() => setDeleteExpanded(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:border-destructive/40 transition-all text-[12px] font-medium"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            Delete this user
          </button>
        ) : (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 space-y-3">
            <p className="text-[12px] text-foreground leading-relaxed">
              Permanently delete{" "}
              <span className="font-semibold text-destructive">{user.name}</span>?
              This cannot be undone.
            </p>
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={purge}
                onChange={(e) => setPurge(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <span className="text-[11px] text-muted-foreground leading-relaxed">
                Also purge all usage data &amp; conversation history
              </span>
            </label>
            {deleteError && <p className="text-[11px] text-destructive">{deleteError}</p>}
            <div className="flex gap-2 pt-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs flex-1 text-muted-foreground"
                onClick={() => { setDeleteExpanded(false); setDeleteError(""); setPurge(false); }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs flex-1"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                {deleting ? "Deleting…" : "Delete user"}
              </Button>
            </div>
          </div>
        )}
      </SidebarCard>

    </div>
  );
}

// ─── Skeleton twins ───────────────────────────────────────────────────────────
// Structural copies of the components above, used by `loading.tsx` while the
// server page resolves and by UserConversations while it fetches. Wrappers keep
// the exact loaded classes; only the data shimmers.

export function UserDetailStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-background rounded-2xl border border-border/60 px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <SkeletonLine lh="h-[15px]" h="h-2.5" w="w-20" delay={stagger(i, 100)} />
            <Skeleton className="w-7 h-7 rounded-lg" delay={stagger(i, 100, 30)} />
          </div>
          {/* text-2xl → 32px line box */}
          <SkeletonLine lh="h-8" h="h-6" w="w-24" delay={stagger(i, 100, 60)} />
          <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-14" className="mt-1" delay={stagger(i, 100, 90)} />
          {i === 2 && (
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between">
                <SkeletonLine lh="h-[15px]" h="h-2.5" w="w-16" delay={stagger(i, 100, 120)} />
                <SkeletonLine lh="h-[15px]" h="h-2.5" w="w-8" delay={stagger(i, 100, 150)} />
              </div>
              <Skeleton className="h-1.5 rounded-full w-full" delay={stagger(i, 100, 180)} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function UserUsageTableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-background rounded-2xl border border-border/60 overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border/60">
            {["Model", "Input", "Output", "Cache read", "Cache create", "Cost"].map((h, i) => (
              <TableHead
                key={h}
                className={cn(
                  "text-[10px] uppercase tracking-widest font-semibold text-muted-foreground h-9",
                  i > 0 ? "text-right" : "pl-5"
                )}
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRow key={i} className="border-b border-border/40">
              <TableCell className="pl-5 py-3">
                <Skeleton className="h-5 w-40 rounded-md" delay={stagger(i)} />
              </TableCell>
              {[0, 1, 2, 3].map((j) => (
                <TableCell key={j}>
                  <SkeletonLine lh="h-[18px]" w="w-12" className="justify-end" delay={stagger(i, 80, 20 * (j + 1))} />
                </TableCell>
              ))}
              <TableCell className="pr-5">
                <SkeletonLine lh="h-[18px]" w="w-14" className="justify-end" delay={stagger(i, 80, 100)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function UserConversationsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-4 py-3.5 border border-border/60 rounded-2xl bg-background shadow-sm"
        >
          <div className="flex-1 min-w-0">
            {/* text-[13px] title → 19.5px line */}
            <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-3/4" delay={stagger(i, 60)} />
            <div className="flex items-center gap-2 mt-1">
              <Skeleton className="h-5 w-24 rounded-md" delay={stagger(i, 60, 20)} />
              <SkeletonLine lh="h-[16.5px]" w="w-16" delay={stagger(i, 60, 40)} />
              <SkeletonLine lh="h-[16.5px]" w="w-24" delay={stagger(i, 60, 60)} />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2 mt-0.5">
            <SkeletonLine lh="h-[18px]" h="h-3.5" w="w-12" delay={stagger(i, 60, 80)} />
            <span className="w-3.5 h-3.5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SidebarField({ label, delay }: { label: string; delay: number }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <Skeleton className="h-8 w-full rounded-md" delay={delay} />
    </div>
  );
}

export function UserDetailSidebarSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <SidebarCard icon={Pencil} title="Edit Details">
        <div className="space-y-3">
          <SidebarField label="Name" delay={0} />
          <SidebarField label="Email" delay={60} />
          <SidebarField label="Avatar URL" delay={120} />
          <div className="flex items-center justify-between pt-0.5">
            <SkeletonLine lh="h-[16.5px]" w="w-24" delay={180} />
            <Skeleton className="h-7 w-14 rounded-md" delay={200} />
          </div>
        </div>
      </SidebarCard>

      <SidebarCard icon={Gauge} title="Spending Limit">
        <div className="space-y-3">
          <SidebarField label="Amount" delay={240} />
          <SidebarField label="Reset period" delay={300} />
          <div className="flex justify-end pt-0.5">
            <Skeleton className="h-7 w-14 rounded-md" delay={360} />
          </div>
        </div>
      </SidebarCard>

      <SidebarCard icon={UserCog} title="Access">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {["Assigned", "Available"].map((label, c) => (
              <div key={label} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
                </div>
                <div className="min-h-[80px] rounded-xl border-2 border-dashed border-border/40 bg-muted/20 p-2 flex flex-col gap-1">
                  {Array.from({ length: c === 0 ? 1 : 2 }).map((_, k) => (
                    <Skeleton key={k} className="h-[30px] w-full rounded-lg" delay={stagger(k, 60, 400 + c * 40)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-7 w-14 rounded-md" delay={520} />
          </div>
        </div>
      </SidebarCard>

      <SidebarCard icon={Lock} title="Danger Zone">
        <Skeleton className="h-[38px] w-full rounded-xl" delay={560} />
      </SidebarCard>
    </div>
  );
}
