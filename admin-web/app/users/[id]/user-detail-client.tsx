"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrency } from "@/lib/currency-context";
import { isAiRole } from "@/lib/ai-role";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, Euro, MessageSquare, Gauge, Bot, ShieldCheck, ShieldAlert,
  Check, AlertTriangle, RotateCcw, Trash2, Pencil, Lock, UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="grid grid-cols-3 gap-3">
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
                  pct > 80 ? "text-destructive" : pct > 60 ? "text-amber-500" : "text-emerald-600"
                )}>
                  {Math.round(pct)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    pct > 80 ? "bg-destructive" : pct > 60 ? "bg-amber-500" : "bg-emerald-500"
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
    <div className="bg-background rounded-2xl border border-border/60 overflow-hidden shadow-sm">
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
        saved && "bg-emerald-600 hover:bg-emerald-600 border-emerald-600"
      )}
      onClick={onClick}
      disabled={disabled || saving || saved}
    >
      {saved ? (
        <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
      ) : saving ? "Saving…" : "Save"}
    </Button>
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

  // ── Roles ─────────────────────────────────────────────────────────────────
  const [activeIds, setActiveIds] = useState(() => currentRoles.map((r) => r.id));
  const [originalIds] = useState(() => currentRoles.map((r) => r.id));
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [rolesSaving, setRolesSaving] = useState(false);
  const [rolesSaved, setRolesSaved] = useState(false);

  function toggleRole(id: string) {
    setActiveIds((p) => (p.includes(id) ? p.filter((r) => r !== id) : [...p, id]));
    setConfirmed((p) => p.filter((c) => c !== id));
    setRolesSaved(false);
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
              <RotateCcw className="w-3 h-3" />
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

      {/* ── Roles ────────────────────────────────────────────────────────── */}
      <SidebarCard icon={UserCog} title="Roles">
        {allRoles.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-2">No roles available.</p>
        ) : (
          <div className="space-y-1.5">
            {allRoles.map((role) => {
              const active = activeIds.includes(role.id);
              const kind = getRoleKind(role.name);
              const isNewSensitive = active && !originalIds.includes(role.id) && kind !== "default";
              const isConfirmed = confirmed.includes(role.id);

              return (
                <div key={role.id}>
                  <button
                    onClick={() => toggleRole(role.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all duration-150",
                      kind === "ai" && (active
                        ? "border-blue-200 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700/50"
                        : "border-transparent hover:border-blue-200/60 hover:bg-blue-50/40"),
                      kind === "admin" && (active
                        ? "border-orange-200 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-700/50"
                        : "border-transparent hover:border-orange-200/60 hover:bg-orange-50/40"),
                      kind === "default" && (active
                        ? "border-border bg-muted"
                        : "border-transparent hover:bg-muted/60"),
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                      kind === "ai" && (active ? "bg-blue-500" : "bg-blue-100 dark:bg-blue-900/50"),
                      kind === "admin" && (active ? "bg-orange-500" : "bg-orange-100 dark:bg-orange-900/50"),
                      kind === "default" && (active ? "bg-foreground/10" : "bg-muted"),
                    )}>
                      {kind === "ai"
                        ? <Bot className={cn("w-3.5 h-3.5", active ? "text-white" : "text-blue-500")} />
                        : kind === "admin"
                        ? <ShieldAlert className={cn("w-3.5 h-3.5", active ? "text-white" : "text-orange-500")} />
                        : <ShieldCheck className={cn("w-3.5 h-3.5", active ? "text-foreground/60" : "text-muted-foreground")} />
                      }
                    </div>
                    <span className={cn(
                      "flex-1 text-[12px] font-medium truncate",
                      kind === "ai" && (active ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground"),
                      kind === "admin" && (active ? "text-orange-700 dark:text-orange-300" : "text-muted-foreground"),
                      kind === "default" && (active ? "text-foreground" : "text-muted-foreground"),
                    )}>
                      {role.name}
                    </span>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                      kind === "ai" && (active ? "border-blue-500 bg-blue-500" : "border-muted-foreground/30"),
                      kind === "admin" && (active ? "border-orange-500 bg-orange-500" : "border-muted-foreground/30"),
                      kind === "default" && (active ? "border-foreground bg-foreground" : "border-muted-foreground/30"),
                    )}>
                      {active && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                  </button>

                  {isNewSensitive && (
                    <div className={cn(
                      "mx-1 mt-1 px-3 py-2 rounded-xl text-[11px]",
                      kind === "ai"
                        ? "bg-blue-50/80 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-800/40"
                        : "bg-orange-50/80 border border-orange-100 dark:bg-orange-950/30 dark:border-orange-800/40"
                    )}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <AlertTriangle className={cn("w-3 h-3 shrink-0", kind === "ai" ? "text-blue-500" : "text-orange-500")} />
                        <p className={kind === "ai" ? "text-blue-700 dark:text-blue-300" : "text-orange-700 dark:text-orange-300"}>
                          {kind === "ai" ? "Grants AI access — may incur costs." : "Grants full admin privileges."}
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
                  )}
                </div>
              );
            })}

            <div className="flex justify-end pt-1">
              <SaveButton
                onClick={saveRoles}
                saving={rolesSaving}
                saved={rolesSaved}
                disabled={!rolesChanged || unconfirmed.length > 0}
              />
            </div>
          </div>
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
                {deleting ? "Deleting…" : "Delete user"}
              </Button>
            </div>
          </div>
        )}
      </SidebarCard>

    </div>
  );
}
