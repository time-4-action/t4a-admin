"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isAiRole, isDevRole } from "@/lib/ai-role";
import { Plus, Trash2, Bot, ShieldCheck, ShieldAlert, Pencil, Check, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Role {
  id: string;
  name: string;
  description?: string;
}

const isAdminRole = (name: string) => name.toLowerCase().includes("admin");

type RoleKind = "ai" | "admin" | "default";
function getRoleKind(name: string): RoleKind {
  if (isAiRole(name)) return "ai";
  if (isAdminRole(name)) return "admin";
  return "default";
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/admin/roles")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (Array.isArray(data)) {
          const order = { ai: 0, admin: 1, default: 2 };
          const filtered = data.filter((r: Role) => !isDevRole(r.name));
          filtered.sort((a: Role, b: Role) => {
            const ka = getRoleKind(a.name), kb = getRoleKind(b.name);
            if (order[ka] !== order[kb]) return order[ka] - order[kb];
            return a.name.localeCompare(b.name);
          });
          setRoles(filtered);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    setDeleteError("");
    setDeleteTarget(null);
    const res = await fetch(`/api/admin/roles/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDeleteError(body.error ?? "Failed to delete role.");
    } else {
      load();
    }
  }

  function startEdit(role: Role) {
    setEditingId(role.id);
    setEditName(role.name);
    setEditDesc(role.description ?? "");
  }

  function cancelEdit() { setEditingId(null); }

  async function saveEdit(role: Role) {
    if (!editName.trim()) return;
    setSaving(true);
    await fetch(`/api/admin/roles/${encodeURIComponent(role.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() }),
    });
    setSaving(false);
    setEditingId(null);
    load();
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b border-border flex items-center justify-between px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold text-foreground">Roles</h1>
          {roles.length > 0 && (
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full tabular-nums">
              {roles.length}
            </span>
          )}
        </div>
        <Link href="/roles/new">
          <Button size="sm" className="h-8 text-xs gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            New Role
          </Button>
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {deleteError && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/8 border border-destructive/15 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {deleteError}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-[60px] bg-muted/60 animate-pulse rounded-2xl" style={{ opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div className="border border-border rounded-2xl py-20 text-center">
            <ShieldCheck className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No roles yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Create your first role to get started.</p>
            <Link href="/roles/new">
              <Button size="sm" variant="outline" className="text-xs">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Role
              </Button>
            </Link>
          </div>
        ) : (
          <div className="bg-background border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
            {roles.map((role) => {
              const kind = getRoleKind(role.name);
              const editing = editingId === role.id;
              return (
                <div
                  key={role.id}
                  className={cn(
                    "flex items-center gap-4 px-5 py-3.5 transition-colors group",
                    !editing && "hover:bg-muted/30",
                    kind === "ai" && "bg-blue-50/30",
                    kind === "admin" && "bg-orange-50/30",
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                    kind === "ai" && "bg-blue-100",
                    kind === "admin" && "bg-orange-100",
                    kind === "default" && "bg-muted",
                  )}>
                    {kind === "ai"
                      ? <Bot className="w-[15px] h-[15px] text-blue-500" />
                      : kind === "admin"
                      ? <ShieldAlert className="w-[15px] h-[15px] text-orange-500" />
                      : <ShieldCheck className="w-[15px] h-[15px] text-muted-foreground" />
                    }
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {editing ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-7 text-[13px] w-36"
                          autoFocus
                        />
                        <Input
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          placeholder="Description"
                          className="h-7 text-[13px] flex-1"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-foreground">{role.name}</span>
                        {kind === "ai" && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
                            AI
                          </span>
                        )}
                        {kind === "admin" && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">
                            Admin
                          </span>
                        )}
                        {role.description && (
                          <span className="text-[12px] text-muted-foreground">{role.description}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className={cn("flex items-center gap-0.5 shrink-0 transition-opacity", !editing && "opacity-0 group-hover:opacity-100")}>
                    {editing ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => saveEdit(role)} disabled={saving || !editName.trim()} title="Save">
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={cancelEdit} title="Cancel">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => startEdit(role)} title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/8" onClick={() => setDeleteTarget(role)} disabled={deleting === role.id} title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm" showCloseButton={false}>
          <DialogTitle className="sr-only">Delete Role</DialogTitle>
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Delete &ldquo;{deleteTarget?.name}&rdquo;?</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                This role will be permanently removed. Users with this role will lose it immediately. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground border-destructive"
                onClick={confirmDelete}
              >
                Delete role
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
