"use client";
import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WARRANTY_ADMIN_ROLE_NAME } from "@/lib/warranty-role";
import { cn } from "@/lib/utils";
import { Search, X, Wrench, Loader2, Check, ArrowLeft, AlertCircle } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

interface Role {
  id: string;
  name: string;
}

function Avatar({ name, email, size = 30 }: { name: string; email?: string; size?: number }) {
  const src = name || email || "?";
  const initials = src.split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join("") || src[0]?.toUpperCase() || "?";
  return (
    <div
      className="rounded-full bg-muted border border-border flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="font-semibold text-muted-foreground" style={{ fontSize: size * 0.36 }}>{initials}</span>
    </div>
  );
}

function Toggle({ enabled, pending, onClick }: { enabled: boolean; pending: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed",
        enabled ? "bg-blue-500" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
          enabled ? "translate-x-4" : "translate-x-0"
        )}
      />
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-3 h-3 text-white animate-spin" />
        </span>
      )}
    </button>
  );
}

function ConfirmToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none shrink-0",
        on ? "bg-blue-500" : "bg-muted border border-border"
      )}
    >
      <span className={cn(
        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200",
        on ? "translate-x-5" : "translate-x-0"
      )} />
    </button>
  );
}

export default function WarrantyAccessPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [warrantyRole, setWarrantyRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Confirmation dialog
  const [confirmUser, setConfirmUser] = useState<User | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/roles").then((r) => r.json()),
    ]).then(([usersData, rolesData]) => {
      if (Array.isArray(usersData)) setUsers(usersData);
      if (Array.isArray(rolesData)) {
        const role = rolesData.find((r: Role) => r.name.toLowerCase() === WARRANTY_ADMIN_ROLE_NAME.toLowerCase());
        if (role) setWarrantyRole(role);
      }
    }).finally(() => setLoading(false));
  }, []);

  const hasWarrantyAccess = useCallback((user: User) =>
    user.roles.some((r) => r.toLowerCase() === WARRANTY_ADMIN_ROLE_NAME.toLowerCase()),
    []
  );

  function handleToggle(user: User) {
    if (!hasWarrantyAccess(user)) {
      // Granting — show confirmation first
      setConfirmUser(user);
      setConfirmed(false);
    } else {
      // Revoking — no confirmation needed
      doToggle(user, false);
    }
  }

  async function doToggle(user: User, granting: boolean) {
    if (!warrantyRole) return;
    setError(null);
    setPending((p) => new Set(p).add(user.id));
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          granting ? { assign: [warrantyRole.id] } : { remove: [warrantyRole.id] }
        ),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Couldn't update warranty access.");
        return;
      }

      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== user.id) return u;
          return {
            ...u,
            roles: granting
              ? [...u.roles, WARRANTY_ADMIN_ROLE_NAME]
              : u.roles.filter((r) => r.toLowerCase() !== WARRANTY_ADMIN_ROLE_NAME.toLowerCase()),
          };
        })
      );

      setSaved((s) => {
        const next = new Set(s).add(user.id);
        setTimeout(() => setSaved((cur) => { const n = new Set(cur); n.delete(user.id); return n; }), 1500);
        return next;
      });
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(user.id); return n; });
    }
  }

  function handleConfirm() {
    if (!confirmUser || !confirmed) return;
    const user = confirmUser;
    setConfirmUser(null);
    setConfirmed(false);
    doToggle(user, true);
  }

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.email.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
  });

  const withAccess = filtered.filter((u) => hasWarrantyAccess(u));
  const withoutAccess = filtered.filter((u) => !hasWarrantyAccess(u));

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-blue-500" />
          <h1 className="font-display text-lg font-medium tracking-tight text-foreground">Warranty Access</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-36 sm:w-52 text-xs bg-background"
            />
          </div>
          {search && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}>
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-3xl">
        <p className="text-[12px] text-muted-foreground -mb-1">
          Members of the <strong className="text-foreground">{WARRANTY_ADMIN_ROLE_NAME}</strong> role can manage warranty
          claims and are offered as claim assignees. Only an admin can change this.
        </p>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-[12px] text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
                <div className="skeleton w-[30px] h-[30px] rounded-full shrink-0" style={{ animationDelay: `${i * 60}ms` }} />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-32 rounded" style={{ animationDelay: `${i * 60 + 20}ms` }} />
                  <div className="skeleton h-2.5 w-48 rounded" style={{ animationDelay: `${i * 60 + 40}ms` }} />
                </div>
                <div className="skeleton h-5 w-9 rounded-full shrink-0" style={{ animationDelay: `${i * 60 + 60}ms` }} />
              </div>
            ))}
          </div>
        ) : !warrantyRole ? (
          <div className="border border-border rounded-xl py-16 text-center text-[13px] text-muted-foreground">
            Warranty role &ldquo;{WARRANTY_ADMIN_ROLE_NAME}&rdquo; not found. Check your <code className="text-xs bg-muted px-1.5 py-0.5 rounded">NEXT_PUBLIC_WARRANTY_ADMIN_ROLE_NAME</code> setting.
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-border rounded-xl py-16 text-center text-[13px] text-muted-foreground">
            No users match your search.
          </div>
        ) : (
          <>
            {/* Users with access */}
            {withAccess.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Has warranty access</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">{withAccess.length}</span>
                </div>
                <div className="space-y-1.5">
                  {withAccess.map((user, i) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      hasAccess={true}
                      pending={pending.has(user.id)}
                      saved={saved.has(user.id)}
                      onToggle={() => handleToggle(user)}
                      animDelay={i * 40}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Users without access */}
            {withoutAccess.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No warranty access</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{withoutAccess.length}</span>
                </div>
                <div className="space-y-1.5">
                  {withoutAccess.map((user, i) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      hasAccess={false}
                      pending={pending.has(user.id)}
                      saved={saved.has(user.id)}
                      onToggle={() => handleToggle(user)}
                      animDelay={i * 40}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Confirmation dialog */}
      <Dialog open={!!confirmUser} onOpenChange={(o) => { if (!o) { setConfirmUser(null); setConfirmed(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">Confirm Warranty Access</DialogTitle>

          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => { setConfirmUser(null); setConfirmed(false); }}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-sm font-semibold leading-tight">Grant warranty access</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {confirmUser?.name || confirmUser?.email} · Enable the toggle to confirm
              </p>
            </div>
          </div>

          <div className={cn(
            "rounded-xl border p-4 transition-all duration-200",
            confirmed ? "border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-600/60" : "border-border bg-background"
          )}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  confirmed ? "bg-blue-500" : "bg-blue-100 dark:bg-blue-900/50"
                )}>
                  <Wrench className={cn("w-4 h-4", confirmed ? "text-white" : "text-blue-500")} />
                </div>
                <div>
                  <p className={cn("text-[13px] font-semibold", confirmed ? "text-blue-700 dark:text-blue-300" : "text-foreground")}>
                    {WARRANTY_ADMIN_ROLE_NAME}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Warranty admin · manages claims</p>
                </div>
              </div>
              <ConfirmToggle on={confirmed} onToggle={() => setConfirmed((v) => !v)} />
            </div>
            {confirmed && (
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-blue-200 dark:border-blue-800 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                <Check className="w-3 h-3 shrink-0" />
                I understand this grants access to manage warranty claims.
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => { setConfirmUser(null); setConfirmed(false); }}>
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!confirmed}
              className={cn(
                "transition-all duration-200",
                confirmed && "bg-blue-500 hover:bg-blue-600 border-blue-500 text-white"
              )}
            >
              Confirm & grant
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserRow({
  user,
  hasAccess,
  pending,
  saved,
  onToggle,
  animDelay,
}: {
  user: User;
  hasAccess: boolean;
  pending: boolean;
  saved: boolean;
  onToggle: () => void;
  animDelay: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 border rounded-xl transition-colors",
        hasAccess ? "border-blue-100 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-950/10" : "border-border bg-background"
      )}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <Avatar name={user.name} email={user.email} size={30} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate leading-tight">{user.name || user.email}</p>
        {user.name && (
          <p className="text-[11px] text-muted-foreground truncate leading-tight">{user.email}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {saved && !pending && (
          <span className="flex items-center gap-1 text-[10px] text-accent-brand font-medium">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
        <Toggle enabled={hasAccess} pending={pending} onClick={onToggle} />
      </div>
    </div>
  );
}
