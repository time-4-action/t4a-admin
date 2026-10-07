"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isAiRole, isDevRole } from "@/lib/ai-role";
import {
  Trash2, Bot, ShieldCheck, ShieldAlert, AlertTriangle, Plus,
  Settings2, Loader2, Check, X, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";

interface Role { id: string; name: string; description?: string }
interface Permission {
  permission_name: string;
  description: string;
  resource_server_identifier: string;
  resource_server_name: string;
}
interface Scope { value: string; description: string }
interface ResourceServer { id: string; name: string; identifier: string; scopes: Scope[] }

const isAdminRole = (n: string) => n.toLowerCase().includes("admin");
type RoleKind = "ai" | "admin" | "default";
function getRoleKind(name: string): RoleKind {
  if (isAiRole(name)) return "ai";
  if (isAdminRole(name)) return "admin";
  return "default";
}

const permKey = (identifier: string, scope: string) => `${identifier}||${scope}`;

// Twin of the permission chip row (mono `px-1.5 py-0.5` chips ≈ 22px tall).
const CHIP_WIDTHS = ["w-24", "w-32", "w-20", "w-28", "w-36", "w-24"];
function PermChipsSkeleton({ count, delay = 0 }: { count: number; delay?: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-[22px] rounded-md", CHIP_WIDTHS[i % CHIP_WIDTHS.length])} delay={delay + i * 30} />
      ))}
    </div>
  );
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolePerms, setRolePerms] = useState<Map<string, Permission[]>>(new Map());

  // Delete
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  // Manage permissions dialog
  const [editTarget, setEditTarget] = useState<Role | null>(null);
  const [servers, setServers] = useState<ResourceServer[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [serversError, setServersError] = useState("");
  const [editSelected, setEditSelected] = useState<Set<string>>(new Set());
  const [editOriginal, setEditOriginal] = useState<Set<string>>(new Set());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSearch, setEditSearch] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/admin/roles")
      .then(r => r.ok ? r.json() : [])
      .then((data) => {
        if (!Array.isArray(data)) return;
        const order = { ai: 0, admin: 1, default: 2 };
        const filtered = data.filter((r: Role) => !isDevRole(r.name));
        filtered.sort((a: Role, b: Role) => {
          const ka = getRoleKind(a.name), kb = getRoleKind(b.name);
          return order[ka] !== order[kb] ? order[ka] - order[kb] : a.name.localeCompare(b.name);
        });
        setRoles(filtered);
        // load permissions for all roles in parallel
        Promise.all(filtered.map((r: Role) =>
          fetch(`/api/admin/roles/${encodeURIComponent(r.id)}/permissions`)
            .then(res => res.ok ? res.json() : [])
            .then((perms: Permission[]) => ({ id: r.id, perms: Array.isArray(perms) ? perms : [] }))
        )).then(results => {
          const map = new Map<string, Permission[]>();
          results.forEach(({ id, perms }) => map.set(id, perms));
          setRolePerms(map);
        });
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    setDeleteError("");
    setDeleteTarget(null);
    const res = await fetch(`/api/admin/roles/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDeleteError(body.error ?? "Failed to delete access type.");
    } else {
      load();
    }
  }

  // ── Manage permissions dialog ───────────────────────────────────────────────
  async function openEdit(role: Role) {
    setEditTarget(role);
    setEditError("");
    setEditSaving(false);
    setEditSearch("");
    setServersError("");
    setServersLoading(true);

    const [serversRes, permsData] = await Promise.all([
      fetch("/api/admin/resource-servers").then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body;
      }).catch(err => { setServersError(err.message); return []; }),
      Promise.resolve(rolePerms.get(role.id) ?? []),
    ]);

    const srvs: ResourceServer[] = Array.isArray(serversRes) ? serversRes : [];
    setServers(srvs);

    const keys = new Set(permsData.map((p: Permission) => permKey(p.resource_server_identifier, p.permission_name)));
    setEditSelected(new Set(keys));
    setEditOriginal(new Set(keys));
    setServersLoading(false);
  }

  function toggleEditScope(identifier: string, scope: string) {
    const key = permKey(identifier, scope);
    setEditSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function savePermissions() {
    if (!editTarget) return;
    setEditSaving(true);
    setEditError("");

    const toAdd = [...editSelected].filter(k => !editOriginal.has(k));
    const toRemove = [...editOriginal].filter(k => !editSelected.has(k));

    const toPerms = (keys: string[]) => keys.map(k => {
      const [resource_server_identifier, permission_name] = k.split("||");
      return { resource_server_identifier, permission_name };
    });

    try {
      if (toAdd.length) {
        const res = await fetch(`/api/admin/roles/${encodeURIComponent(editTarget.id)}/permissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissions: toPerms(toAdd) }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to add permissions");
      }
      if (toRemove.length) {
        const res = await fetch(`/api/admin/roles/${encodeURIComponent(editTarget.id)}/permissions`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissions: toPerms(toRemove) }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to remove permissions");
      }

      // Update local cache
      const newPerms: Permission[] = [...editSelected].map(k => {
        const [resource_server_identifier, permission_name] = k.split("||");
        const srv = servers.find(s => s.identifier === resource_server_identifier);
        const scope = srv?.scopes.find(s => s.value === permission_name);
        return {
          permission_name,
          description: scope?.description ?? "",
          resource_server_identifier,
          resource_server_name: srv?.name ?? resource_server_identifier,
        };
      });
      setRolePerms(prev => new Map(prev).set(editTarget.id, newPerms));
      setEditTarget(null);
    } catch (err: any) {
      setEditError(err.message ?? "Something went wrong");
    } finally {
      setEditSaving(false);
    }
  }

  const editHasChanges = editSelected.size !== editOriginal.size ||
    [...editSelected].some(k => !editOriginal.has(k));

  // Scope detail panel state
  const [selectedScope, setSelectedScope] = useState<{ name: string; description: string } | null>(null);

  // Which roles have the selected scope
  const rolesWithScope = selectedScope
    ? roles.filter(r => (rolePerms.get(r.id) ?? []).some(p => p.permission_name === selectedScope.name))
    : [];

  function selectScope(name: string, description: string) {
    setSelectedScope(s => s?.name === name ? null : { name, description });
  }

  return (
    <div className="flex h-full">
      {/* ── Main list ── */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground">Access Types</h1>
            {loading ? (
              <Skeleton className="h-[19px] w-7 rounded-full" />
            ) : roles.length > 0 && (
              <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full tabular-nums">
                {roles.length}
              </span>
            )}
          </div>
          <Link href="/roles/new">
            <Button size="sm" className="h-8 text-xs gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              New Access Type
            </Button>
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {deleteError && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/8 border border-destructive/15 text-xs text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {deleteError}
            </div>
          )}

          {loading ? (
            <div className="bg-background border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-4 px-5 py-4">
                  <Skeleton className="w-8 h-8 rounded-xl shrink-0 mt-0.5" delay={stagger(i, 100)} />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-28" delay={stagger(i, 100, 30)} />
                      <SkeletonLine lh="h-[19.5px]" w="w-48" delay={stagger(i, 100, 60)} />
                    </div>
                    <PermChipsSkeleton count={[5, 3, 6, 2][i]} delay={stagger(i, 100, 90)} />
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                    <Skeleton className="h-7 w-7 rounded-md" delay={stagger(i, 100, 120)} />
                    <Skeleton className="h-7 w-7 rounded-md" delay={stagger(i, 100, 150)} />
                  </div>
                </div>
              ))}
            </div>
          ) : roles.length === 0 ? (
            <div className="border border-border rounded-2xl py-20 text-center">
              <ShieldCheck className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No access types yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Create your first access type.</p>
              <Link href="/roles/new">
                <Button size="sm" variant="outline" className="text-xs gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  New Access Type
                </Button>
              </Link>
            </div>
          ) : (
            <div className="bg-background border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
              {roles.map((role) => {
                const kind = getRoleKind(role.name);
                const perms = rolePerms.get(role.id);
                const grouped = perms
                  ? perms.reduce<Record<string, Permission[]>>((acc, p) => {
                      const key = p.resource_server_name || p.resource_server_identifier;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(p);
                      return acc;
                    }, {})
                  : null;

                return (
                  <div
                    key={role.id}
                    className={cn(
                      "flex items-start gap-4 px-5 py-4 transition-colors group",
                      kind === "ai" && "bg-blue-50/30",
                      kind === "admin" && "bg-orange-50/30",
                    )}
                  >
                    {/* Icon */}
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                      kind === "ai" && "bg-blue-100",
                      kind === "admin" && "bg-orange-100",
                      kind === "default" && "bg-muted",
                    )}>
                      {kind === "ai" ? <Bot className="w-[15px] h-[15px] text-blue-500" />
                        : kind === "admin" ? <ShieldAlert className="w-[15px] h-[15px] text-orange-500" />
                        : <ShieldCheck className="w-[15px] h-[15px] text-muted-foreground" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Name row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-foreground">{role.name}</span>
                        {kind === "ai" && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">AI</span>
                        )}
                        {kind === "admin" && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">Admin</span>
                        )}
                        {role.description && (
                          <span className="text-[12px] text-muted-foreground">{role.description}</span>
                        )}
                      </div>

                      {/* Permissions */}
                      {grouped === null ? (
                        <PermChipsSkeleton count={4} />
                      ) : Object.keys(grouped).length === 0 ? (
                        <p className="text-[11px] text-muted-foreground/50">No permissions assigned</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {Object.values(grouped).flat().map(p => (
                            <button
                              key={p.permission_name}
                              type="button"
                              onClick={() => selectScope(p.permission_name, p.description)}
                              className={cn(
                                "text-[11px] font-mono border px-1.5 py-0.5 rounded-md transition-colors cursor-pointer",
                                selectedScope?.name === p.permission_name
                                  ? "bg-foreground text-background border-foreground"
                                  : "bg-muted border-border/60 text-foreground hover:bg-muted/70 hover:border-foreground/30"
                              )}
                            >
                              {p.permission_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(role)}
                        title="Manage permissions"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/8"
                        onClick={() => setDeleteTarget(role)}
                        disabled={deleting === role.id}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Scope detail panel (desktop: inline, mobile: overlay) ── */}
      {/* Mobile overlay */}
      {selectedScope && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setSelectedScope(null)}
        />
      )}
      <div className={cn(
        // Mobile: fixed overlay from right
        "fixed top-0 right-0 bottom-0 z-50 md:relative md:z-auto",
        "flex flex-col shrink-0 border-l border-border transition-all duration-200 overflow-hidden bg-background",
        selectedScope ? "w-72" : "w-0"
      )}>
        {selectedScope && (
          <>
            <div className="h-14 border-b border-border flex items-center justify-between px-5 shrink-0 bg-background/80 backdrop-blur-sm">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Scope</p>
              <button
                onClick={() => setSelectedScope(null)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Name</p>
                <p className="text-[13px] font-mono font-semibold text-foreground break-all">{selectedScope.name}</p>
              </div>
              {selectedScope.description && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</p>
                  <p className="text-[13px] text-foreground leading-relaxed">{selectedScope.description}</p>
                </div>
              )}
              {rolesWithScope.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Assigned to</p>
                  <div className="flex flex-col gap-1.5">
                    {rolesWithScope.map(r => {
                      const k = getRoleKind(r.name);
                      return (
                        <div key={r.id} className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium",
                          k === "ai" && "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-700/50 dark:text-blue-300",
                          k === "admin" && "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/40 dark:border-orange-700/50 dark:text-orange-300",
                          k === "default" && "bg-muted border-border text-foreground",
                        )}>
                          {k === "ai" ? <Bot className="w-3 h-3 shrink-0" />
                            : k === "admin" ? <ShieldAlert className="w-3 h-3 shrink-0" />
                            : <ShieldCheck className="w-3 h-3 shrink-0" />}
                          {r.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Manage permissions dialog ────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">Manage Permissions</DialogTitle>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <div>
              <p className="text-sm font-semibold">{editTarget?.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Manage API permissions</p>
            </div>
            <div className="flex items-center gap-2">
              {editSelected.size > 0 && (
                <span className="text-[10px] font-bold bg-foreground text-background px-2 py-0.5 rounded-full tabular-nums">
                  {editSelected.size} selected
                </span>
              )}
              <button
                onClick={() => setEditTarget(null)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search */}
          {(serversLoading || servers.length > 0) && (
            <div className="px-5 py-3 border-b border-border shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search permissions…"
                  value={editSearch}
                  onChange={e => setEditSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-background"
                  autoFocus={false}
                  disabled={serversLoading}
                />
                {editSearch && (
                  <button
                    onClick={() => setEditSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {serversLoading ? (
              <>
                <div className="flex items-center justify-between px-5 py-2 border-b border-border/60 bg-muted/10 shrink-0">
                  <SkeletonLine lh="h-[16.5px]" w="w-24" />
                  <SkeletonLine lh="h-[16.5px]" w="w-14" />
                </div>
                <div className="divide-y divide-border/30">
                  {[80, 60, 90, 50, 70, 65, 55, 85].map((w, i) => (
                    <div key={i} className="w-full flex items-center gap-3 px-5 py-2.5">
                      <Skeleton className="w-4 h-4 rounded shrink-0" delay={stagger(i, 50)} />
                      <SkeletonLine lh="h-[18px]" style={{ width: w * 2 }} w="" delay={stagger(i, 50, 30)} />
                      <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="flex-1" className="flex-1" delay={stagger(i, 50, 60)} />
                    </div>
                  ))}
                </div>
              </>
            ) : serversError ? (
              <div className="m-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/8 border border-destructive/15 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Failed to load APIs: {serversError}
              </div>
            ) : servers.length === 0 ? (
              <div className="p-8 text-center space-y-1">
                <p className="text-xs text-muted-foreground">No APIs found in Auth0.</p>
                <p className="text-[11px] text-muted-foreground/60">Make sure your Management API client has <code className="font-mono">read:resource_servers</code> permission.</p>
              </div>
            ) : (() => {
              const searchLower = editSearch.toLowerCase().trim();
              const filteredServers = servers.map(server => ({
                ...server,
                scopes: searchLower
                  ? server.scopes.filter(s =>
                      s.value.toLowerCase().includes(searchLower) ||
                      s.description.toLowerCase().includes(searchLower)
                    )
                  : server.scopes,
              })).filter(server => !searchLower || server.scopes.length > 0);

              if (searchLower && filteredServers.length === 0) {
                return (
                  <div className="p-8 text-center">
                    <p className="text-xs text-muted-foreground">No permissions match &ldquo;{editSearch}&rdquo;.</p>
                  </div>
                );
              }

              const allScopes = filteredServers.flatMap(server =>
                server.scopes.map(scope => ({ server, scope }))
              );
              const allSelected = allScopes.length > 0 && allScopes.every(({ server, scope }) =>
                editSelected.has(permKey(server.identifier, scope.value))
              );

              return (
                <>
                  {/* Select all / none */}
                  <div className="flex items-center justify-between px-5 py-2 border-b border-border/60 bg-muted/10 shrink-0">
                    <span className="text-[11px] text-muted-foreground">{allScopes.length} permissions</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditSelected(prev => {
                          const next = new Set(prev);
                          if (allSelected) {
                            allScopes.forEach(({ server, scope }) => next.delete(permKey(server.identifier, scope.value)));
                          } else {
                            allScopes.forEach(({ server, scope }) => next.add(permKey(server.identifier, scope.value)));
                          }
                          return next;
                        });
                      }}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {allSelected ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <div className="divide-y divide-border/30">
                    {allScopes.map(({ server, scope }) => {
                      const key = permKey(server.identifier, scope.value);
                      const isOn = editSelected.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleEditScope(server.identifier, scope.value)}
                          className={cn(
                            "w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors",
                            isOn ? "bg-blue-50/60 dark:bg-blue-950/20" : "hover:bg-muted/30"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                            isOn ? "bg-blue-500 border-blue-500" : "border-border"
                          )}>
                            {isOn && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className={cn(
                            "text-[12px] font-mono",
                            isOn ? "text-blue-700 dark:text-blue-300 font-semibold" : "text-foreground"
                          )}>
                            {scope.value}
                          </span>
                          {scope.description && (
                            <span className="text-[11px] text-muted-foreground flex-1 truncate">
                              — {scope.description}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-border shrink-0">
            {editError
              ? <p className="text-xs text-destructive">{editError}</p>
              : <span />
            }
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button
                size="sm"
                onClick={savePermissions}
                disabled={editSaving || !editHasChanges}
                className="gap-1.5"
              >
                {editSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editSaving ? "Saving…" : "Save Permissions"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm" showCloseButton={false}>
          <DialogTitle className="sr-only">Delete Access Type</DialogTitle>
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Delete &ldquo;{deleteTarget?.name}&rdquo;?</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                This access type will be permanently removed. Users with this access will lose it immediately. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                size="sm"
                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground border-destructive"
                onClick={confirmDelete}
              >
                Delete access
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
