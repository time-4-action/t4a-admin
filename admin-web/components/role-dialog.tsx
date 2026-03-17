"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isAiRole, isDevRole } from "@/lib/ai-role";
import { Bot, ShieldAlert, ShieldCheck, Check, AlertTriangle, ArrowLeft } from "lucide-react";
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
          ? kind === "ai"
            ? "bg-blue-500 focus-visible:ring-blue-500"
            : kind === "admin"
            ? "bg-orange-500 focus-visible:ring-orange-500"
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

export default function RoleDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmToggles, setConfirmToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/roles").then((r) => r.json()),
      fetch(`/api/admin/users/${encodeURIComponent(user.id)}/roles`).then((r) => r.json()),
    ]).then(([all, userRoles]) => {
      if (Array.isArray(all)) {
        const order = { ai: 0, admin: 1, default: 2 };
        const sorted = all.filter((r: Role) => !isDevRole(r.name)).sort((a, b) => {
          const ka = getRoleKind(a.name), kb = getRoleKind(b.name);
          if (order[ka] !== order[kb]) return order[ka] - order[kb];
          return a.name.localeCompare(b.name);
        });
        setAllRoles(sorted);
      }
      if (Array.isArray(userRoles)) {
        const ids = userRoles.map((r: Role) => r.id);
        setActiveIds(ids);
        setOriginalIds(ids);
      }
    });
  }, [user.id]);

  function toggle(id: string) {
    setActiveIds((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]);
  }

  // Sensitive roles that are being newly assigned (not previously active)
  const sensitiveAssignments = allRoles.filter(
    (r) => activeIds.includes(r.id) && !originalIds.includes(r.id) && getRoleKind(r.name) !== "default"
  );

  function handleSaveClick() {
    if (sensitiveAssignments.length > 0) {
      const initial: Record<string, boolean> = {};
      sensitiveAssignments.forEach((r) => { initial[r.id] = false; });
      setConfirmToggles(initial);
      setConfirming(true);
    } else {
      save();
    }
  }

  async function save() {
    setSaving(true);
    const assign = activeIds.filter((r) => !originalIds.includes(r));
    const remove = originalIds.filter((r) => !activeIds.includes(r));
    await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/roles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assign, remove }),
    });
    setSaving(false);
    onClose();
  }

  const allConfirmed = Object.keys(confirmToggles).length > 0 && Object.values(confirmToggles).every(Boolean);
  const hasAdminInConfirm = sensitiveAssignments.some(r => getRoleKind(r.name) === "admin");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        {!confirming ? (
          <>
            <DialogHeader className="pb-0">
              <DialogTitle className="text-base">Manage Roles</DialogTitle>
              <p className="text-[12px] text-muted-foreground">
                {user.name}
                {user.email && <span className="opacity-60"> · {user.email}</span>}
              </p>
            </DialogHeader>

            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-0.5 -mr-1">
              {allRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
              ) : (
                allRoles.map((role) => {
                  const active = activeIds.includes(role.id);
                  const kind = getRoleKind(role.name);
                  return (
                    <div key={role.id}>
                      <button
                        onClick={() => toggle(role.id)}
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
                          <p className={cn(
                            "text-[13px] font-semibold leading-tight",
                            kind === "ai" && (active ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground"),
                            kind === "admin" && (active ? "text-orange-700 dark:text-orange-300" : "text-muted-foreground"),
                            kind === "default" && (active ? "text-foreground" : "text-muted-foreground"),
                          )}>
                            {role.name}
                          </p>
                          {role.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{role.description}</p>
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
                })
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSaveClick}>Save changes</Button>
            </DialogFooter>
          </>
        ) : (
          /* ── Confirmation panel ── */
          <div className="animate-in slide-in-from-right-4 fade-in-0 duration-200">
            <div className="flex items-center gap-2 mb-5">
              <button
                onClick={() => setConfirming(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <p className="text-sm font-semibold leading-tight">Confirm role changes</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Enable each toggle to grant access</p>
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

            <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-border">
              <p className="text-[11px] text-muted-foreground">
                {allConfirmed ? "All confirmed. Ready to save." : `${Object.values(confirmToggles).filter(Boolean).length}/${Object.keys(confirmToggles).length} confirmed`}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Back</Button>
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
