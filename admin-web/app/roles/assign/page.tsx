"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isAiRole, isDevRole } from "@/lib/ai-role";
import { cn } from "@/lib/utils";
import { Check, Search, Bot, ShieldCheck, ShieldAlert, AlertTriangle, ArrowLeft } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

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

function Avatar({ name, email }: { name: string; email?: string }) {
  const src = name || email || "?";
  const initials = src.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || src[0]?.toUpperCase() || "?";
  return (
    <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
      <span className="text-[10px] font-semibold text-muted-foreground">{initials}</span>
    </div>
  );
}

function Toggle({ on, onToggle, kind }: { on: boolean; onToggle: () => void; kind: RoleKind }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 shrink-0",
        on
          ? kind === "ai" ? "bg-blue-500 focus-visible:ring-blue-500"
          : kind === "admin" ? "bg-orange-500 focus-visible:ring-orange-500"
          : "bg-foreground"
          : "bg-muted border border-border"
      )}
    >
      <span className={cn(
        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200",
        on ? "translate-x-5" : "translate-x-0"
      )} />
    </button>
  );
}

export default function AssignRolesPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<User | null>(null);
  const [userRoleIds, setUserRoleIds] = useState<string[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmToggles, setConfirmToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/admin/users").then((r) => r.ok ? r.json() : []).then((data) => { if (Array.isArray(data)) setUsers(data); });
    fetch("/api/admin/roles").then((r) => r.ok ? r.json() : []).then((data: Role[]) => {
      if (Array.isArray(data)) {
        const order = { ai: 0, admin: 1, default: 2 };
        const filtered = data.filter((r) => !isDevRole(r.name));
        filtered.sort((a, b) => {
          const ka = getRoleKind(a.name), kb = getRoleKind(b.name);
          if (order[ka] !== order[kb]) return order[ka] - order[kb];
          return a.name.localeCompare(b.name);
        });
        setRoles(filtered);
      }
    });
  }, []);

  async function selectUser(user: User) {
    setSelected(user);
    setSaved(false);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/roles`);
    const data = await res.json();
    const ids = Array.isArray(data) ? data.map((r: any) => r.id) : [];
    setUserRoleIds(ids);
    setOriginalIds(ids);
  }

  function toggleRole(roleId: string) {
    setUserRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
    setSaved(false);
  }

  // Sensitive roles being newly assigned
  const sensitiveAssignments = roles.filter(
    (r) => userRoleIds.includes(r.id) && !originalIds.includes(r.id) && getRoleKind(r.name) !== "default"
  );

  function handleSaveClick() {
    if (sensitiveAssignments.length > 0) {
      const initial: Record<string, boolean> = {};
      sensitiveAssignments.forEach((r) => { initial[r.id] = false; });
      setConfirmToggles(initial);
      setConfirmOpen(true);
    } else {
      save();
    }
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setConfirmOpen(false);
    const assign = userRoleIds.filter((r) => !originalIds.includes(r));
    const remove = originalIds.filter((r) => !userRoleIds.includes(r));
    await fetch(`/api/admin/users/${encodeURIComponent(selected.id)}/roles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assign, remove }),
    });
    setSaving(false);
    setSaved(true);
    setOriginalIds(userRoleIds);
  }

  const aiRoleName = roles.find(r => isAiRole(r.name))?.name ?? "";
  const filtered = users.filter(
    (u) =>
      !search.trim() ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const allConfirmed = Object.keys(confirmToggles).length > 0 && Object.values(confirmToggles).every(Boolean);
  const hasAdminInConfirm = sensitiveAssignments.some(r => getRoleKind(r.name) === "admin");

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b border-border flex items-center px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <h1 className="text-sm font-semibold text-foreground">Assign Roles</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* User list */}
        <div className="w-72 border-r border-border flex flex-col shrink-0">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map((user) => {
              const hasAi = user.roles?.includes(aiRoleName);
              return (
                <button
                  key={user.id}
                  onClick={() => selectUser(user)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/40 transition-colors",
                    selected?.id === user.id ? "bg-muted" : "hover:bg-muted/40"
                  )}
                >
                  <Avatar name={user.name ?? ""} email={user.email} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground truncate leading-tight">{user.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate leading-tight">{user.email}</p>
                  </div>
                  {hasAi && <Bot className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No users found.</p>
            )}
          </div>
        </div>

        {/* Role assignment panel */}
        <div className="flex-1 p-8 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center pb-16">
              <ShieldCheck className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Select a user to manage their roles</p>
            </div>
          ) : (
            <div className="max-w-md">
              <div className="flex items-center gap-3 mb-6">
                <Avatar name={selected.name ?? ""} email={selected.email} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{selected.email}</p>
                </div>
              </div>

              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No roles available. <a href="/roles/new" className="underline">Create one</a>.</p>
              ) : (
                <div className="space-y-2 mb-6">
                  {roles.map((role) => {
                    const active = userRoleIds.includes(role.id);
                    const kind = getRoleKind(role.name);
                    return (
                      <div key={role.id}>
                        <button
                          onClick={() => toggleRole(role.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all duration-150",
                            kind === "ai" && (active
                              ? "border-blue-300 bg-blue-50 dark:bg-blue-950/50 dark:border-blue-600/60"
                              : "border-border bg-background hover:bg-blue-50/50 hover:border-blue-200"),
                            kind === "admin" && (active
                              ? "border-orange-300 bg-orange-50 dark:bg-orange-950/50 dark:border-orange-600/60"
                              : "border-border bg-background hover:bg-orange-50/50 hover:border-orange-200"),
                            kind === "default" && (active
                              ? "border-foreground/25 bg-muted"
                              : "border-border bg-background hover:bg-muted/40"),
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150",
                            kind === "ai" && (active ? "bg-blue-500 shadow-sm shadow-blue-200" : "bg-blue-100 dark:bg-blue-900/50"),
                            kind === "admin" && (active ? "bg-orange-500 shadow-sm shadow-orange-200" : "bg-orange-100 dark:bg-orange-900/50"),
                            kind === "default" && (active ? "bg-foreground/10" : "bg-muted"),
                          )}>
                            {kind === "ai"
                              ? <Bot className={cn("w-4 h-4", active ? "text-white" : "text-blue-500 dark:text-blue-400")} />
                              : kind === "admin"
                              ? <ShieldAlert className={cn("w-4 h-4", active ? "text-white" : "text-orange-500 dark:text-orange-400")} />
                              : <ShieldCheck className={cn("w-4 h-4", active ? "text-foreground" : "text-muted-foreground")} />
                            }
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={cn(
                                "text-[13px] font-semibold leading-tight",
                                kind === "ai" && (active ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground"),
                                kind === "admin" && (active ? "text-orange-700 dark:text-orange-300" : "text-muted-foreground"),
                                kind === "default" && (active ? "text-foreground" : "text-muted-foreground"),
                              )}>
                                {role.name}
                              </p>
                              {kind === "ai" && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded-full">
                                  AI Access
                                </span>
                              )}
                              {kind === "admin" && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/50 px-1.5 py-0.5 rounded-full">
                                  Admin
                                </span>
                              )}
                            </div>
                            {role.description && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">{role.description}</p>
                            )}
                          </div>

                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150",
                            kind === "ai" && (active ? "border-blue-500 bg-blue-500" : "border-border bg-background"),
                            kind === "admin" && (active ? "border-orange-500 bg-orange-500" : "border-border bg-background"),
                            kind === "default" && (active ? "border-foreground bg-foreground" : "border-border bg-background"),
                          )}>
                            {active && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>

                        {active && kind === "ai" && (
                          <div className="flex gap-2 mx-0.5 mt-1 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 dark:bg-blue-950/40 dark:border-blue-800/60">
                            <AlertTriangle className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-px" />
                            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                              Grants access to AI features and <strong>company data</strong>. Usage may incur <strong>additional costs</strong>.
                            </p>
                          </div>
                        )}
                        {active && kind === "admin" && (
                          <div className="flex gap-2 mx-0.5 mt-1 px-3 py-2 rounded-lg bg-orange-50 border border-orange-100 dark:bg-orange-950/40 dark:border-orange-800/60">
                            <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-px" />
                            <p className="text-[11px] text-orange-700 dark:text-orange-300 leading-relaxed">
                              Grants <strong>full admin access</strong> — manage users, adjust limits, and modify system settings.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleSaveClick} disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
                {saved && <span className="text-xs text-muted-foreground font-medium">Saved</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">Confirm Role Changes</DialogTitle>

          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => setConfirmOpen(false)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-sm font-semibold leading-tight">Confirm role changes</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {selected?.name} · Enable each toggle to grant access
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {sensitiveAssignments.map((role) => {
              const kind = getRoleKind(role.name);
              const isOn = confirmToggles[role.id] ?? false;
              return (
                <div
                  key={role.id}
                  className={cn(
                    "rounded-xl border p-4 transition-all duration-200",
                    kind === "ai" && (isOn
                      ? "border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-600/60"
                      : "border-border bg-background"),
                    kind === "admin" && (isOn
                      ? "border-orange-300 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-600/60"
                      : "border-border bg-background"),
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200",
                        kind === "ai" && (isOn ? "bg-blue-500" : "bg-blue-100 dark:bg-blue-900/50"),
                        kind === "admin" && (isOn ? "bg-orange-500" : "bg-orange-100 dark:bg-orange-900/50"),
                      )}>
                        {kind === "ai"
                          ? <Bot className={cn("w-4 h-4", isOn ? "text-white" : "text-blue-500")} />
                          : <ShieldAlert className={cn("w-4 h-4", isOn ? "text-white" : "text-orange-500")} />
                        }
                      </div>
                      <div className="min-w-0">
                        <p className={cn(
                          "text-[13px] font-semibold leading-tight transition-colors",
                          kind === "ai" && (isOn ? "text-blue-700 dark:text-blue-300" : "text-foreground"),
                          kind === "admin" && (isOn ? "text-orange-700 dark:text-orange-300" : "text-foreground"),
                        )}>
                          {role.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {kind === "ai" ? "AI access · company data · billable" : "Admin access · user management"}
                        </p>
                      </div>
                    </div>
                    <Toggle
                      on={isOn}
                      kind={kind}
                      onToggle={() => setConfirmToggles((prev) => ({ ...prev, [role.id]: !prev[role.id] }))}
                    />
                  </div>

                  {isOn && (
                    <div className={cn(
                      "flex items-center gap-1.5 mt-3 pt-3 border-t text-[11px] font-medium",
                      kind === "ai"
                        ? "border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400"
                        : "border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400"
                    )}>
                      <Check className="w-3 h-3 shrink-0" />
                      {kind === "ai"
                        ? "I understand this grants AI access and may incur costs."
                        : "I understand this grants full admin privileges."}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground">
              {allConfirmed
                ? "All confirmed. Ready to save."
                : `${Object.values(confirmToggles).filter(Boolean).length}/${Object.keys(confirmToggles).length} confirmed`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>Back</Button>
              <Button
                size="sm"
                onClick={save}
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
