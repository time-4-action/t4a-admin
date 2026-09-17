"use client";
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ElementType,
  type ReactNode,
} from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonAvatar, SkeletonLine, stagger } from "@/components/ui/skeleton";
import {
  Search,
  X,
  Loader2,
  Check,
  ArrowLeft,
  AlertCircle,
  UserRound,
  ShieldCheck,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
  roles: string[];
}

interface Role {
  id: string;
  name: string;
}

export type AccessAccent = "indigo" | "amber" | "rose" | "blue" | "teal" | "lime" | "cyan";

// Full literal class strings per accent (Tailwind can't see interpolated names).
const ACCENTS: Record<
  AccessAccent,
  {
    iconText: string;
    chip: string;
    switchOn: string;
    countBadge: string;
    accentBar: string;
    rowGranted: string;
    badge: string;
    panelOn: string;
    iconOn: string;
    iconOff: string;
    titleOn: string;
    ack: string;
    btn: string;
  }
> = {
  indigo: {
    iconText: "text-indigo-500",
    chip: "bg-indigo-50 border-indigo-200/70 dark:bg-indigo-950/40 dark:border-indigo-800/50",
    switchOn: "bg-indigo-500",
    countBadge:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300",
    accentBar: "bg-indigo-500",
    rowGranted: "bg-indigo-50/40 dark:bg-indigo-950/15",
    badge:
      "bg-indigo-50 text-indigo-700 border-indigo-200/70 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60",
    panelOn:
      "border-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-600/60",
    iconOn: "bg-indigo-500",
    iconOff: "bg-indigo-100 dark:bg-indigo-900/50",
    titleOn: "text-indigo-700 dark:text-indigo-300",
    ack: "text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
    btn: "bg-indigo-500 hover:bg-indigo-600 border-indigo-500 text-white",
  },
  amber: {
    iconText: "text-amber-600 dark:text-amber-500",
    chip: "bg-amber-50 border-amber-200/70 dark:bg-amber-950/40 dark:border-amber-800/50",
    switchOn: "bg-amber-500",
    countBadge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    accentBar: "bg-amber-500",
    rowGranted: "bg-amber-50/50 dark:bg-amber-950/15",
    badge:
      "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60",
    panelOn:
      "border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-600/60",
    iconOn: "bg-amber-500",
    iconOff: "bg-amber-100 dark:bg-amber-900/50",
    titleOn: "text-amber-700 dark:text-amber-300",
    ack: "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    btn: "bg-amber-500 hover:bg-amber-600 border-amber-500 text-white",
  },
  rose: {
    iconText: "text-rose-600 dark:text-rose-500",
    chip: "bg-rose-50 border-rose-200/70 dark:bg-rose-950/40 dark:border-rose-800/50",
    switchOn: "bg-rose-500",
    countBadge:
      "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    accentBar: "bg-rose-500",
    rowGranted: "bg-rose-50/50 dark:bg-rose-950/15",
    badge:
      "bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60",
    panelOn:
      "border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-600/60",
    iconOn: "bg-rose-500",
    iconOff: "bg-rose-100 dark:bg-rose-900/50",
    titleOn: "text-rose-700 dark:text-rose-300",
    ack: "text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800",
    btn: "bg-rose-500 hover:bg-rose-600 border-rose-500 text-white",
  },
  blue: {
    iconText: "text-blue-600 dark:text-blue-500",
    chip: "bg-blue-50 border-blue-200/70 dark:bg-blue-950/40 dark:border-blue-800/50",
    switchOn: "bg-blue-500",
    countBadge:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    accentBar: "bg-blue-500",
    rowGranted: "bg-blue-50/50 dark:bg-blue-950/15",
    badge:
      "bg-blue-50 text-blue-700 border-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60",
    panelOn:
      "border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-600/60",
    iconOn: "bg-blue-500",
    iconOff: "bg-blue-100 dark:bg-blue-900/50",
    titleOn: "text-blue-700 dark:text-blue-300",
    ack: "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    btn: "bg-blue-500 hover:bg-blue-600 border-blue-500 text-white",
  },
  teal: {
    iconText: "text-teal-600 dark:text-teal-500",
    chip: "bg-teal-50 border-teal-200/70 dark:bg-teal-950/40 dark:border-teal-800/50",
    switchOn: "bg-teal-500",
    countBadge:
      "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
    accentBar: "bg-teal-500",
    rowGranted: "bg-teal-50/50 dark:bg-teal-950/15",
    badge:
      "bg-teal-50 text-teal-700 border-teal-200/70 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60",
    panelOn:
      "border-teal-300 bg-teal-50 dark:bg-teal-950/40 dark:border-teal-600/60",
    iconOn: "bg-teal-500",
    iconOff: "bg-teal-100 dark:bg-teal-900/50",
    titleOn: "text-teal-700 dark:text-teal-300",
    ack: "text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800",
    btn: "bg-teal-500 hover:bg-teal-600 border-teal-500 text-white",
  },
  lime: {
    iconText: "text-lime-600 dark:text-lime-500",
    chip: "bg-lime-50 border-lime-200/70 dark:bg-lime-950/40 dark:border-lime-800/50",
    switchOn: "bg-lime-500",
    countBadge:
      "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300",
    accentBar: "bg-lime-500",
    rowGranted: "bg-lime-50/50 dark:bg-lime-950/15",
    badge:
      "bg-lime-50 text-lime-700 border-lime-200/70 dark:bg-lime-950/40 dark:text-lime-300 dark:border-lime-800/60",
    panelOn:
      "border-lime-300 bg-lime-50 dark:bg-lime-950/40 dark:border-lime-600/60",
    iconOn: "bg-lime-500",
    iconOff: "bg-lime-100 dark:bg-lime-900/50",
    titleOn: "text-lime-700 dark:text-lime-300",
    ack: "text-lime-600 dark:text-lime-400 border-lime-200 dark:border-lime-800",
    btn: "bg-lime-500 hover:bg-lime-600 border-lime-500 text-white",
  },
  cyan: {
    iconText: "text-cyan-600 dark:text-cyan-500",
    chip: "bg-cyan-50 border-cyan-200/70 dark:bg-cyan-950/40 dark:border-cyan-800/50",
    switchOn: "bg-cyan-500",
    countBadge:
      "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
    accentBar: "bg-cyan-500",
    rowGranted: "bg-cyan-50/50 dark:bg-cyan-950/15",
    badge:
      "bg-cyan-50 text-cyan-700 border-cyan-200/70 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800/60",
    panelOn:
      "border-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 dark:border-cyan-600/60",
    iconOn: "bg-cyan-500",
    iconOff: "bg-cyan-100 dark:bg-cyan-900/50",
    titleOn: "text-cyan-700 dark:text-cyan-300",
    ack: "text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800",
    btn: "bg-cyan-500 hover:bg-cyan-600 border-cyan-500 text-white",
  },
};

type Tab = "all" | "granted" | "none";

export function AccessManager({
  roleName,
  title,
  lead,
  icon: Icon,
  accent,
  envVarName,
  grant,
}: {
  roleName: string;
  title: string;
  lead: ReactNode;
  icon: ElementType;
  accent: AccessAccent;
  envVarName: string;
  grant: { heading: string; roleSubtitle: string; ack: string };
}) {
  const a = ACCENTS[accent];

  const [users, setUsers] = useState<User[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [confirmUser, setConfirmUser] = useState<User | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/roles").then((r) => r.json()),
    ])
      .then(([usersData, rolesData]) => {
        if (Array.isArray(usersData)) setUsers(usersData);
        if (Array.isArray(rolesData)) {
          const found = rolesData.find(
            (r: Role) => r.name.toLowerCase() === roleName.toLowerCase(),
          );
          if (found) setRole(found);
        }
      })
      .finally(() => setLoading(false));
  }, [roleName]);

  const has = useCallback(
    (u: User) => u.roles.some((r) => r.toLowerCase() === roleName.toLowerCase()),
    [roleName],
  );

  // Super-admins (the "admin" role) always have access via that role — they
  // can't be toggled here, so they're surfaced as a locked "full access" badge.
  // EXCEPTION: when this page *manages the admin role itself* (the Super Admins
  // page), admins must remain toggleable, so the lock is bypassed there.
  const managingAdminRole = roleName.toLowerCase() === "admin";
  const isAdmin = useCallback(
    (u: User) =>
      !managingAdminRole && u.roles.some((r) => r.toLowerCase() === "admin"),
    [managingAdminRole],
  );
  const hasAccess = useCallback((u: User) => isAdmin(u) || has(u), [isAdmin, has]);

  // On the Super Admins page, learn who we are so we can stop someone revoking
  // their own admin role (the server enforces this too; this just disables the
  // toggle up front).
  useEffect(() => {
    if (!managingAdminRole) return;
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setCurrentUserId(d?.id ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [managingAdminRole]);

  function handleToggle(user: User) {
    if (!has(user)) {
      setConfirmUser(user);
      setConfirmed(false);
    } else {
      doToggle(user, false);
    }
  }

  async function doToggle(user: User, granting: boolean) {
    if (!role) return;
    setError(null);
    setPending((p) => new Set(p).add(user.id));
    try {
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(user.id)}/roles`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            granting ? { assign: [role.id] } : { remove: [role.id] },
          ),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Couldn't update access.");
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id !== user.id
            ? u
            : {
                ...u,
                roles: granting
                  ? [...u.roles, roleName]
                  : u.roles.filter(
                      (r) => r.toLowerCase() !== roleName.toLowerCase(),
                    ),
              },
        ),
      );
      setSaved((s) => {
        const next = new Set(s).add(user.id);
        setTimeout(
          () =>
            setSaved((cur) => {
              const n = new Set(cur);
              n.delete(user.id);
              return n;
            }),
          1600,
        );
        return next;
      });
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(user.id);
        return n;
      });
    }
  }

  function handleConfirm() {
    if (!confirmUser || !confirmed) return;
    const user = confirmUser;
    setConfirmUser(null);
    setConfirmed(false);
    doToggle(user, true);
  }

  const searched = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        (u.email || "").toLowerCase().includes(term) ||
        (u.name || "").toLowerCase().includes(term),
    );
  }, [users, q]);

  const grantedAll = useMemo(() => users.filter(hasAccess).length, [users, hasAccess]);
  const grantedSearched = useMemo(
    () => searched.filter(hasAccess).length,
    [searched, hasAccess],
  );

  const visible = useMemo(() => {
    const list =
      tab === "granted"
        ? searched.filter(hasAccess)
        : tab === "none"
          ? searched.filter((u) => !hasAccess(u))
          : searched;
    return [...list].sort((x, y) =>
      (x.name || x.email || "").localeCompare(y.name || y.email || ""),
    );
  }, [searched, tab, hasAccess]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: searched.length },
    { key: "granted", label: "With access", count: grantedSearched },
    { key: "none", label: "No access", count: searched.length - grantedSearched },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">
              {title}
            </h1>
            {loading ? (
              <Skeleton className="h-5 w-10 rounded-full shrink-0" />
            ) : users.length > 0 && (
              <span
                className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0 tabular-nums"
                title={`${grantedAll} of ${users.length} have access`}
              >
                {grantedAll}/{users.length}
              </span>
            )}
          </div>
          <div className="relative shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search people…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 pr-7 h-8 w-40 sm:w-60 text-xs bg-background"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Segmented filter */}
        <div className="px-4 md:px-8 pb-3">
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 h-7 text-[12px] font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  {loading ? (
                    <Skeleton className="h-4 w-6 rounded-full" />
                  ) : (
                  <span
                    className={cn(
                      "tabular-nums text-[10px] font-semibold rounded-full px-1.5 py-px",
                      active && t.key === "granted"
                        ? a.countBadge
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t.count}
                  </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="space-y-4">
          <p className="text-[12px] text-muted-foreground leading-relaxed">{lead}</p>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-[12px] text-destructive"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl border border-border/60 bg-background shadow-sm overflow-hidden divide-y divide-border/50">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <SkeletonAvatar size="w-[34px] h-[34px]" delay={stagger(i, 60)} />
                  <div className="min-w-0 flex-1">
                    {/* leading-tight: 13px → 16.25px, 11px → 13.75px */}
                    <SkeletonLine lh="h-4" w="w-32" delay={stagger(i, 60, 20)} />
                    <SkeletonLine lh="h-[14px]" h="h-2.5" w="w-48" delay={stagger(i, 60, 40)} />
                  </div>
                  {i % 3 === 0 && (
                    <Skeleton className="hidden sm:block h-5 w-24 rounded-full shrink-0" delay={stagger(i, 60, 50)} />
                  )}
                  <Skeleton className="h-[22px] w-10 rounded-full shrink-0" delay={stagger(i, 60, 60)} />
                </div>
              ))}
            </div>
          ) : !role ? (
            <div className="rounded-2xl border border-border/60 bg-background shadow-sm py-16 px-6 text-center">
              <div
                className={cn(
                  "mx-auto mb-3 w-10 h-10 rounded-xl border flex items-center justify-center",
                  a.chip,
                )}
              >
                <Icon className={cn("w-5 h-5", a.iconText)} />
              </div>
              <p className="text-[13px] text-foreground font-medium">
                Role &ldquo;{roleName}&rdquo; not found
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Check your{" "}
                <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">
                  {envVarName}
                </code>{" "}
                setting.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-background shadow-sm py-16 px-6 text-center">
              <div className="mx-auto mb-3 w-10 h-10 rounded-xl bg-muted border border-border/60 flex items-center justify-center">
                <UserRound className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-[13px] text-foreground font-medium">
                {q.trim() ? "No people match your search" : "Nobody here yet"}
              </p>
              {q.trim() && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="text-[12px] text-muted-foreground hover:text-foreground mt-1 underline underline-offset-2"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-background shadow-sm overflow-hidden divide-y divide-border/50">
              {visible.map((user, i) => (
                <UserRow
                  key={user.id}
                  user={user}
                  roleName={roleName}
                  granted={has(user)}
                  lockedLabel={
                    isAdmin(user)
                      ? "Admin · full access"
                      : managingAdminRole &&
                          has(user) &&
                          !!currentUserId &&
                          user.id === currentUserId
                        ? "You · can't revoke your own access"
                        : null
                  }
                  pending={pending.has(user.id)}
                  saved={saved.has(user.id)}
                  onToggle={() => handleToggle(user)}
                  accent={a}
                  animDelay={Math.min(i, 12) * 30}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grant confirmation */}
      <Dialog
        open={!!confirmUser}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmUser(null);
            setConfirmed(false);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">{grant.heading}</DialogTitle>

          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => {
                setConfirmUser(null);
                setConfirmed(false);
              }}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">{grant.heading}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {confirmUser?.name || confirmUser?.email} · Enable the toggle to
                confirm
              </p>
            </div>
          </div>

          <div
            className={cn(
              "rounded-xl border p-4 transition-all duration-200",
              confirmed ? a.panelOn : "border-border bg-background",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    confirmed ? a.iconOn : a.iconOff,
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4",
                      confirmed ? "text-white" : a.iconText,
                    )}
                  />
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-[13px] font-semibold truncate",
                      confirmed ? a.titleOn : "text-foreground",
                    )}
                  >
                    {roleName}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {grant.roleSubtitle}
                  </p>
                </div>
              </div>
              <ConfirmSwitch
                on={confirmed}
                onToggle={() => setConfirmed((v) => !v)}
                accentOn={a.switchOn}
              />
            </div>
            {confirmed && (
              <div
                className={cn(
                  "flex items-center gap-1.5 mt-3 pt-3 border-t text-[11px] font-medium",
                  a.ack,
                )}
              >
                <Check className="w-3 h-3 shrink-0" />
                {grant.ack}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setConfirmUser(null);
                setConfirmed(false);
              }}
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!confirmed}
              className={cn("transition-all duration-200", confirmed && a.btn)}
            >
              Confirm &amp; grant
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Avatar({ user, size = 34 }: { user: User; size?: number }) {
  if (user.picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.picture}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="rounded-full object-cover ring-1 ring-border shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials =
    (user.name || user.email || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      className="flex items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold ring-1 ring-border shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

function Switch({
  on,
  pending,
  onClick,
  accentOn,
}: {
  on: boolean;
  pending: boolean;
  onClick: () => void;
  accentOn: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={pending}
      className={cn(
        "relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed",
        on ? accentOn : "bg-muted-foreground/25",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200",
          on ? "translate-x-[20px]" : "translate-x-0.5",
        )}
      >
        {pending && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </span>
    </button>
  );
}

function ConfirmSwitch({
  on,
  onToggle,
  accentOn,
}: {
  on: boolean;
  onToggle: () => void;
  accentOn: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none shrink-0",
        on ? accentOn : "bg-muted border border-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200",
          on ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

function UserRow({
  user,
  roleName,
  granted,
  lockedLabel,
  pending,
  saved,
  onToggle,
  accent,
  animDelay,
}: {
  user: User;
  roleName: string;
  granted: boolean;
  // When set, the row shows a non-toggleable badge with this text instead of a
  // switch (e.g. an admin's implicit access, or your own row you can't revoke).
  lockedLabel: string | null;
  pending: boolean;
  saved: boolean;
  onToggle: () => void;
  accent: (typeof ACCENTS)[AccessAccent];
  animDelay: number;
}) {
  const accessible = !!lockedLabel || granted;
  return (
    <div
      className={cn(
        "reveal relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
        accessible && accent.rowGranted,
      )}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      {accessible && (
        <span
          className={cn(
            "absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full",
            lockedLabel ? "bg-muted-foreground/40" : accent.accentBar,
          )}
        />
      )}
      <Avatar user={user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground leading-tight">
          {user.name || user.email}
        </p>
        {user.name && (
          <p className="truncate text-[11px] text-muted-foreground leading-tight">
            {user.email}
          </p>
        )}
      </div>
      {lockedLabel ? (
        // Locked: access is implicit / self-protected — no toggle.
        <span
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
          title={lockedLabel}
        >
          <ShieldCheck className="w-3 h-3 shrink-0" />
          <span className="truncate">{lockedLabel}</span>
        </span>
      ) : (
        <>
          {granted && (
            <span
              className={cn(
                "hidden sm:inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold max-w-[160px]",
                accent.badge,
              )}
            >
              <Check className="w-3 h-3 shrink-0" />
              <span className="truncate">{roleName}</span>
            </span>
          )}
          {saved && !pending && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-accent-brand">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          <Switch
            on={granted}
            pending={pending}
            onClick={onToggle}
            accentOn={accent.switchOn}
          />
        </>
      )}
    </div>
  );
}
