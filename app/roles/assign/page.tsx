"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isAiRole, isDevRole } from "@/lib/ai-role";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonAvatar, SkeletonLine, stagger } from "@/components/ui/skeleton";
import {
  Check, Search, Bot, ShieldCheck, ShieldAlert, AlertTriangle, ArrowLeft,
  UserCheck, Users, Plus, Minus, Loader2,
} from "lucide-react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
} from "@dnd-kit/core";

interface User { id: string; name: string; email: string; roles: string[] }
interface Role { id: string; name: string; description?: string }

const isAdminRole = (n: string) => n.toLowerCase().includes("admin");
type RoleKind = "ai" | "admin" | "default";
function getRoleKind(name: string): RoleKind {
  if (isAiRole(name)) return "ai";
  if (isAdminRole(name)) return "admin";
  return "default";
}

function Avatar({ name, email, size = 28 }: { name: string; email?: string; size?: number }) {
  const src = name || email || "?";
  const initials = src.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || src[0]?.toUpperCase() || "?";
  return (
    <div
      className="rounded-full bg-muted border border-border flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="font-semibold text-muted-foreground" style={{ fontSize: size * 0.36 }}>{initials}</span>
    </div>
  );
}

// ─── Access chip (for DnD single-user mode) ───────────────────────────────────

function AccessChip({ role, isDragging }: { role: Role; isDragging?: boolean }) {
  const kind = getRoleKind(role.name);
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-medium select-none transition-all",
      isDragging && "shadow-xl opacity-90 rotate-1 scale-105",
      kind === "ai" && "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-700/50 dark:text-blue-300",
      kind === "admin" && "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/40 dark:border-orange-700/50 dark:text-orange-300",
      kind === "default" && "bg-muted border-border text-foreground",
    )}>
      {kind === "ai" ? <Bot className="w-3.5 h-3.5 shrink-0" />
        : kind === "admin" ? <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
        : <ShieldCheck className="w-3.5 h-3.5 shrink-0" />}
      <span>{role.name}</span>
      {kind === "ai" && <span className="ml-auto text-[9px] font-bold uppercase tracking-wide bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">AI</span>}
      {kind === "admin" && <span className="ml-auto text-[9px] font-bold uppercase tracking-wide bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full">Admin</span>}
    </div>
  );
}

function DraggableChip({ role }: { role: Role }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: role.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-30")}>
      <AccessChip role={role} />
    </div>
  );
}

function DropZone({ id, label, roles, draggingId }: { id: string; label: string; roles: Role[]; draggingId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const isAssigned = id === "assigned";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
        {roles.length > 0 && (
          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full",
            isAssigned ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" : "bg-muted text-muted-foreground"
          )}>{roles.length}</span>
        )}
      </div>
      <div ref={setNodeRef} className={cn(
        "min-h-[110px] rounded-2xl border-2 border-dashed p-3 flex flex-col gap-2 transition-colors duration-150",
        isOver ? isAssigned ? "border-blue-400 bg-blue-50/60 dark:bg-blue-950/20" : "border-muted-foreground/40 bg-muted/40" : "border-border/40 bg-muted/10",
        draggingId && !isOver && "border-border/60",
      )}>
        {roles.length === 0
          ? <p className="text-[11px] text-muted-foreground/40 text-center m-auto">{isAssigned ? "Drag here to grant" : "Drag here to revoke"}</p>
          : roles.map((r) => <DraggableChip key={r.id} role={r} />)
        }
      </div>
    </div>
  );
}

// ─── Batch row (for multi-user mode) ─────────────────────────────────────────

function BatchRow({
  role,
  count,
  total,
  loading,
  onGrantAll,
  onRemoveAll,
}: {
  role: Role;
  count: number;
  total: number;
  loading?: boolean;
  onGrantAll: () => void;
  onRemoveAll: () => void;
}) {
  const kind = getRoleKind(role.name);
  const allHave = count === total;
  const noneHave = count === 0;

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors",
      allHave
        ? kind === "ai" ? "border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800/40"
          : kind === "admin" ? "border-orange-200 bg-orange-50/60 dark:bg-orange-950/20 dark:border-orange-800/40"
          : "border-border bg-muted/40"
        : "border-border bg-background hover:bg-muted/20",
    )}>
      {/* Icon */}
      <div className={cn(
        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
        kind === "ai" && (allHave ? "bg-blue-500" : "bg-blue-100 dark:bg-blue-900/50"),
        kind === "admin" && (allHave ? "bg-orange-500" : "bg-orange-100 dark:bg-orange-900/50"),
        kind === "default" && (allHave ? "bg-foreground/10" : "bg-muted"),
      )}>
        {kind === "ai" ? <Bot className={cn("w-4 h-4", allHave ? "text-white" : "text-blue-500")} />
          : kind === "admin" ? <ShieldAlert className={cn("w-4 h-4", allHave ? "text-white" : "text-orange-500")} />
          : <ShieldCheck className={cn("w-4 h-4", allHave ? "text-foreground/70" : "text-muted-foreground")} />}
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-[13px] font-semibold leading-tight",
          kind === "ai" && (allHave ? "text-blue-700 dark:text-blue-300" : "text-foreground"),
          kind === "admin" && (allHave ? "text-orange-700 dark:text-orange-300" : "text-foreground"),
          kind === "default" && "text-foreground",
        )}>{role.name}</p>
        {role.description && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{role.description}</p>}
      </div>

      {/* Count badge — shimmers while the selected users' access is still loading */}
      {loading ? (
        <Skeleton className="h-[26px] w-10 rounded-lg shrink-0" />
      ) : (
      <div className={cn(
        "px-2.5 py-1 rounded-lg text-[11px] font-semibold tabular-nums shrink-0",
        allHave ? kind === "ai" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          : kind === "admin" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
          : "bg-muted text-foreground"
          : noneHave ? "bg-muted text-muted-foreground"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      )}>
        {count}/{total}
      </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {!allHave && (
          <button
            onClick={onGrantAll}
            className={cn(
              "flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-colors",
              kind === "ai" ? "border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40"
                : kind === "admin" ? "border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/40"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Plus className="w-3 h-3" />
            Grant all
          </button>
        )}
        {!noneHave && (
          <button
            onClick={onRemoveAll}
            className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium border border-border text-muted-foreground hover:bg-destructive/8 hover:text-destructive hover:border-destructive/30 transition-colors"
          >
            <Minus className="w-3 h-3" />
            Remove all
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Confirmation toggles ─────────────────────────────────────────────────────

function ConfirmToggle({ on, onToggle, kind }: { on: boolean; onToggle: () => void; kind: RoleKind }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none shrink-0",
        on ? kind === "ai" ? "bg-blue-500" : kind === "admin" ? "bg-orange-500" : "bg-foreground" : "bg-muted border border-border"
      )}
    >
      <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200", on ? "translate-x-5" : "translate-x-0")} />
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AssignAccessPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState("");

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Per-user role state caches (mutable working copy + original for diff)
  const [rolesMap, setRolesMap] = useState<Map<string, string[]>>(new Map());
  const [origMap, setOrigMap] = useState<Map<string, string[]>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  // Single-user DnD
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmToggles, setConfirmToggles] = useState<Record<string, boolean>>({});
  const [pendingSave, setPendingSave] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/admin/users")
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d)) setUsers(d); })
      .finally(() => setUsersLoading(false));
    fetch("/api/admin/roles").then(r => r.ok ? r.json() : []).then((d: Role[]) => {
      if (!Array.isArray(d)) return;
      const order = { ai: 0, admin: 1, default: 2 };
      const f = d.filter(r => !isDevRole(r.name));
      f.sort((a, b) => {
        const ka = getRoleKind(a.name), kb = getRoleKind(b.name);
        return order[ka] !== order[kb] ? order[ka] - order[kb] : a.name.localeCompare(b.name);
      });
      setRoles(f);
    });
  }, []);

  const fetchUserRoles = useCallback(async (userId: string) => {
    if (rolesMap.has(userId)) return;
    setLoadingIds(p => new Set(p).add(userId));
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/roles`);
    const text = await res.text();
    const data = text ? JSON.parse(text) : [];
    const ids: string[] = Array.isArray(data) ? data.map((r: any) => r.id) : [];
    setRolesMap(p => new Map(p).set(userId, ids));
    setOrigMap(p => new Map(p).set(userId, ids));
    setLoadingIds(p => { const n = new Set(p); n.delete(userId); return n; });
  }, [rolesMap]);

  async function toggleSelect(user: User) {
    const next = new Set(selectedIds);
    if (next.has(user.id)) {
      next.delete(user.id);
    } else {
      next.add(user.id);
      await fetchUserRoles(user.id);
    }
    setSelectedIds(next);
    setSaved(false);
  }

  async function selectAll() {
    const visible = filteredUsers.map(u => u.id);
    const allSelected = visible.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      await Promise.all(visible.map(async (id) => {
        next.add(id);
        const user = users.find(u => u.id === id)!;
        await fetchUserRoles(user.id);
      }));
      setSelectedIds(next);
    }
    setSaved(false);
  }

  // ── DnD (single user) ──────────────────────────────────────────────────────
  function handleDragStart(e: DragStartEvent) { setDraggingId(String(e.active.id)); }
  function handleDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = e;
    if (!over) return;
    const roleId = String(active.id);
    const dest = String(over.id);
    const uid = [...selectedIds][0];
    if (!uid) return;
    const current = rolesMap.get(uid) ?? [];
    if (dest === "assigned" && !current.includes(roleId)) {
      setRolesMap(p => new Map(p).set(uid, [...current, roleId]));
      setSaved(false);
    } else if (dest === "available" && current.includes(roleId)) {
      setRolesMap(p => new Map(p).set(uid, current.filter(r => r !== roleId)));
      setSaved(false);
    }
  }

  // ── Batch actions (multi-user) ──────────────────────────────────────────────
  function grantToAll(roleId: string) {
    setRolesMap(p => {
      const next = new Map(p);
      for (const uid of selectedIds) {
        const cur = next.get(uid) ?? [];
        if (!cur.includes(roleId)) next.set(uid, [...cur, roleId]);
      }
      return next;
    });
    setSaved(false);
  }

  function removeFromAll(roleId: string) {
    setRolesMap(p => {
      const next = new Map(p);
      for (const uid of selectedIds) {
        const cur = next.get(uid) ?? [];
        next.set(uid, cur.filter(r => r !== roleId));
      }
      return next;
    });
    setSaved(false);
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const sensitiveNewRoles = roles.filter(r => {
    const kind = getRoleKind(r.name);
    if (kind === "default") return false;
    return [...selectedIds].some(uid => {
      const cur = rolesMap.get(uid) ?? [];
      const orig = origMap.get(uid) ?? [];
      return cur.includes(r.id) && !orig.includes(r.id);
    });
  });

  function handleSaveClick() {
    if (sensitiveNewRoles.length > 0) {
      const init: Record<string, boolean> = {};
      sensitiveNewRoles.forEach(r => { init[r.id] = false; });
      setConfirmToggles(init);
      setConfirmOpen(true);
      setPendingSave(true);
    } else {
      doSave();
    }
  }

  async function doSave() {
    setSaving(true);
    setConfirmOpen(false);
    await Promise.all([...selectedIds].map(async (uid) => {
      const cur = rolesMap.get(uid) ?? [];
      const orig = origMap.get(uid) ?? [];
      const assign = cur.filter(r => !orig.includes(r));
      const remove = orig.filter(r => !cur.includes(r));
      if (!assign.length && !remove.length) return;
      await fetch(`/api/admin/users/${encodeURIComponent(uid)}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assign, remove }),
      });
      setOrigMap(p => new Map(p).set(uid, cur));
    }));
    setSaving(false);
    setSaved(true);
    setPendingSave(false);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const aiRoleName = roles.find(r => isAiRole(r.name))?.name ?? "";
  const filteredUsers = users.filter(u =>
    !search.trim() ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedArr = [...selectedIds];
  const isSingle = selectedArr.length === 1;
  const isMulti = selectedArr.length > 1;

  const hasChanges = selectedArr.some(uid => {
    const cur = rolesMap.get(uid) ?? [];
    const orig = origMap.get(uid) ?? [];
    return cur.some(r => !orig.includes(r)) || orig.some(r => !cur.includes(r));
  });

  const allConfirmed = Object.keys(confirmToggles).length > 0 && Object.values(confirmToggles).every(Boolean);
  const hasAdminInConfirm = sensitiveNewRoles.some(r => getRoleKind(r.name) === "admin");

  const singleUid = isSingle ? selectedArr[0] : null;
  const singleRoles = singleUid ? (rolesMap.get(singleUid) ?? []) : [];
  const assignedRoles = roles.filter(r => singleRoles.includes(r.id));
  const availableRoles = roles.filter(r => !singleRoles.includes(r.id));
  const draggingRole = draggingId ? roles.find(r => r.id === draggingId) ?? null : null;

  const allVisibleSelected = filteredUsers.length > 0 && filteredUsers.every(u => selectedIds.has(u.id));

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b border-border flex items-center px-4 md:px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <h1 className="font-display text-lg font-medium tracking-tight text-foreground">Assign Access</h1>
      </header>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

        {/* ── User list ───────────────────────────────────────────────────── */}
        <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-border flex flex-col shrink-0 max-h-[40vh] md:max-h-none">
          {/* Search + select all */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>
            <div className="flex items-center justify-between px-0.5">
              <button
                onClick={selectAll}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {allVisibleSelected ? "Deselect all" : "Select all"}
              </button>
              {selectedIds.size > 0 && (
                <span className="text-[10px] font-bold bg-foreground text-background px-2 py-0.5 rounded-full tabular-nums">
                  {selectedIds.size} selected
                </span>
              )}
            </div>
          </div>

          {/* User rows */}
          <div className="flex-1 overflow-y-auto">
            {usersLoading && Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/40">
                <Skeleton className="w-4 h-4 rounded shrink-0" delay={stagger(i, 60)} />
                <SkeletonAvatar size="w-7 h-7" delay={stagger(i, 60, 20)} />
                <div className="min-w-0 flex-1">
                  {/* leading-tight: 13px → 16.25px, 11px → 13.75px */}
                  <SkeletonLine lh="h-4" w="w-28" delay={stagger(i, 60, 40)} />
                  <SkeletonLine lh="h-[14px]" h="h-2.5" w="w-40" delay={stagger(i, 60, 60)} />
                </div>
              </div>
            ))}
            {filteredUsers.map((user) => {
              const isSelected = selectedIds.has(user.id);
              const isLoading = loadingIds.has(user.id);
              const hasAi = user.roles?.includes(aiRoleName);
              return (
                <button
                  key={user.id}
                  onClick={() => toggleSelect(user)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/40 transition-colors",
                    isSelected ? "bg-muted" : "hover:bg-muted/40"
                  )}
                >
                  {/* Checkbox */}
                  <div className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                    isSelected ? "bg-foreground border-foreground" : "border-border"
                  )}>
                    {isSelected && <Check className="w-2.5 h-2.5 text-background" />}
                  </div>

                  <Avatar name={user.name ?? ""} email={user.email} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground truncate leading-tight">{user.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate leading-tight">{user.email}</p>
                  </div>
                  {isLoading
                    ? <Loader2 className="w-3 h-3 text-muted-foreground animate-spin shrink-0" />
                    : hasAi && <Bot className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  }
                </button>
              );
            })}
            {!usersLoading && filteredUsers.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No users found.</p>
            )}
          </div>
        </div>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {selectedIds.size === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center pb-16">
              <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Select one or more users to manage their access</p>
            </div>

          ) : isSingle ? (
            /* ── Single user: DnD columns ─────────────────────────────────── */
            <div className="p-4 md:p-8 max-w-lg">
              {(() => {
                const user = users.find(u => u.id === singleUid)!;
                return (
                  <div className="flex items-center gap-3 mb-6">
                    <div className="relative">
                      <Avatar name={user?.name ?? ""} email={user?.email} size={32} />
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-foreground flex items-center justify-center">
                        <UserCheck className="w-2.5 h-2.5 text-background" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{user?.name}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                );
              })()}

              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No access types available. <a href="/roles/new" className="underline">Create one</a>.</p>
              ) : loadingIds.has(singleUid!) ? (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {["Current Access", "Available Access"].map((label, c) => (
                    <div key={label} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
                      </div>
                      <div className="min-h-[110px] rounded-2xl border-2 border-dashed border-border/40 bg-muted/10 p-3 flex flex-col gap-2">
                        {Array.from({ length: c === 0 ? 1 : 2 }).map((_, k) => (
                          <Skeleton key={k} className="h-9 w-full rounded-xl" delay={stagger(k, 60, c * 40)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <DropZone id="assigned" label="Current Access" roles={assignedRoles} draggingId={draggingId} />
                    <DropZone id="available" label="Available Access" roles={availableRoles} draggingId={draggingId} />
                  </div>
                  <DragOverlay>{draggingRole ? <AccessChip role={draggingRole} isDragging /> : null}</DragOverlay>
                </DndContext>
              )}

              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleSaveClick} disabled={saving || !hasChanges}>
                  {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Saving…</> : "Save Changes"}
                </Button>
                {saved && <span className="text-xs text-muted-foreground font-medium">Saved</span>}
              </div>
            </div>

          ) : (
            /* ── Multiple users: batch view ───────────────────────────────── */
            <div className="p-4 md:p-8 max-w-2xl">
              {/* Selected users avatars */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center">
                  {[...selectedIds].slice(0, 4).map((uid, i) => {
                    const u = users.find(x => x.id === uid);
                    if (!u) return null;
                    return (
                      <div key={uid} className="ring-2 ring-background rounded-full" style={{ marginLeft: i > 0 ? -8 : 0 }}>
                        <Avatar name={u.name ?? ""} email={u.email} size={28} />
                      </div>
                    );
                  })}
                  {selectedIds.size > 4 && (
                    <div className="w-7 h-7 rounded-full bg-muted border-2 border-background flex items-center justify-center -ml-2">
                      <span className="text-[9px] font-bold text-muted-foreground">+{selectedIds.size - 4}</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedIds.size} users selected</p>
                  <p className="text-xs text-muted-foreground">Changes will apply to all selected users</p>
                </div>
              </div>

              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No access types available. <a href="/roles/new" className="underline">Create one</a>.</p>
              ) : (
                <div className="space-y-2 mb-6">
                  {roles.map((role) => {
                    const readyUsers = [...selectedIds].filter(uid => !loadingIds.has(uid));
                    const count = readyUsers.filter(uid => (rolesMap.get(uid) ?? []).includes(role.id)).length;
                    return (
                      <BatchRow
                        key={role.id}
                        role={role}
                        count={count}
                        total={readyUsers.length}
                        loading={loadingIds.size > 0}
                        onGrantAll={() => grantToAll(role.id)}
                        onRemoveAll={() => removeFromAll(role.id)}
                      />
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleSaveClick} disabled={saving || !hasChanges || loadingIds.size > 0}>
                  {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Saving…</> : "Save Changes"}
                </Button>
                {saved && <span className="text-xs text-muted-foreground font-medium">Saved</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Confirmation dialog ────────────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setPendingSave(false); }}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">Confirm Access Changes</DialogTitle>

          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => { setConfirmOpen(false); setPendingSave(false); }}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-sm font-semibold leading-tight">Confirm access changes</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isMulti ? `${selectedIds.size} users` : users.find(u => u.id === singleUid)?.name} · Enable each toggle to confirm
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {sensitiveNewRoles.map((role) => {
              const kind = getRoleKind(role.name);
              const isOn = confirmToggles[role.id] ?? false;
              const affectedCount = isMulti
                ? [...selectedIds].filter(uid => {
                    const cur = rolesMap.get(uid) ?? [];
                    const orig = origMap.get(uid) ?? [];
                    return cur.includes(role.id) && !orig.includes(role.id);
                  }).length
                : 1;
              return (
                <div key={role.id} className={cn(
                  "rounded-xl border p-4 transition-all duration-200",
                  kind === "ai" && (isOn ? "border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-600/60" : "border-border bg-background"),
                  kind === "admin" && (isOn ? "border-orange-300 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-600/60" : "border-border bg-background"),
                )}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        kind === "ai" && (isOn ? "bg-blue-500" : "bg-blue-100 dark:bg-blue-900/50"),
                        kind === "admin" && (isOn ? "bg-orange-500" : "bg-orange-100 dark:bg-orange-900/50"),
                      )}>
                        {kind === "ai"
                          ? <Bot className={cn("w-4 h-4", isOn ? "text-white" : "text-blue-500")} />
                          : <ShieldAlert className={cn("w-4 h-4", isOn ? "text-white" : "text-orange-500")} />}
                      </div>
                      <div>
                        <p className={cn("text-[13px] font-semibold",
                          kind === "ai" && (isOn ? "text-blue-700 dark:text-blue-300" : "text-foreground"),
                          kind === "admin" && (isOn ? "text-orange-700 dark:text-orange-300" : "text-foreground"),
                        )}>{role.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {kind === "ai" ? "AI access · billable" : "Admin · full control"}
                          {isMulti && ` · ${affectedCount} user${affectedCount > 1 ? "s" : ""}`}
                        </p>
                      </div>
                    </div>
                    <ConfirmToggle on={isOn} kind={kind} onToggle={() => setConfirmToggles(p => ({ ...p, [role.id]: !p[role.id] }))} />
                  </div>
                  {isOn && (
                    <div className={cn("flex items-center gap-1.5 mt-3 pt-3 border-t text-[11px] font-medium",
                      kind === "ai" ? "border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400" : "border-orange-200 text-orange-600 dark:border-orange-800 dark:text-orange-400"
                    )}>
                      <Check className="w-3 h-3 shrink-0" />
                      {kind === "ai" ? "I understand this grants AI access and may incur costs." : "I understand this grants full admin privileges."}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground">
              {allConfirmed ? "All confirmed. Ready to save." : `${Object.values(confirmToggles).filter(Boolean).length}/${Object.keys(confirmToggles).length} confirmed`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setConfirmOpen(false); setPendingSave(false); }}>Back</Button>
              <Button
                size="sm"
                onClick={doSave}
                disabled={!allConfirmed || saving}
                className={cn(
                  "transition-all duration-200",
                  allConfirmed && hasAdminInConfirm && "bg-orange-500 hover:bg-orange-600 border-orange-500 text-white",
                  allConfirmed && !hasAdminInConfirm && "bg-blue-500 hover:bg-blue-600 border-blue-500 text-white",
                )}
              >
                {saving ? "Saving…" : "Confirm & save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
