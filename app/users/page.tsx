"use client";
import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LimitDialog from "@/components/limit-dialog";
import RoleDialog from "@/components/role-dialog";
import AiAccessDialog from "@/components/ai-access-dialog";
import EditUserDialog from "@/components/edit-user-dialog";
import DeleteUserDialog from "@/components/delete-user-dialog";
import Link from "next/link";
import { useCurrency } from "@/lib/currency-context";
import { AI_ROLE_NAME, isAiRole } from "@/lib/ai-role";
import { Search, Bot, Gauge, ShieldCheck, ShieldAlert, Pencil, Trash2, UserPlus, Loader2 } from "lucide-react";

const isAdminRole = (name: string) => name.toLowerCase().includes("admin");
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonAvatar, SkeletonLine, stagger } from "@/components/ui/skeleton";

interface Role { id: string; name: string; }

function Avatar({ name, email, picture }: { name: string; email?: string; picture?: string }) {
  if (picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={picture} alt={name} className="w-7 h-7 rounded-full border border-border object-cover shrink-0" />
    );
  }
  const src = name || email || "?";
  const initials = src
    .split(" ").filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join("") || src[0]?.toUpperCase() || "?";
  return (
    <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
      <span className="text-[10px] font-semibold text-muted-foreground">{initials}</span>
    </div>
  );
}

type AiFilter = "all" | "ai" | "no-ai";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState("");
  const [aiFilter, setAiFilter] = useState<AiFilter>("all");
  const [limitTarget, setLimitTarget] = useState<any>(null);
  const [roleTarget, setRoleTarget] = useState<any>(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
const [aiConfirmTarget, setAiConfirmTarget] = useState<any>(null);
  const { fmt, fmtLimit } = useCurrency();

  function reload() {
    fetch("/api/admin/users").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setUsers(data);
      setLoading(false);
    });
  }

  useEffect(() => {
    reload();
    fetch("/api/admin/roles").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setAllRoles(data);
    });
  }, []);

  // Match AI role case-insensitively against actual fetched roles
  const aiRole = allRoles.find((r) => isAiRole(r.name));
  // Use the real role name from Auth0 (not the env var) for all comparisons
  const aiRoleName = aiRole?.name;

async function toggleAiAccess(user: any) {
    if (!aiRole || !aiRoleName) return;
    const hasAi = user.roles?.includes(aiRoleName);
    setTogglingId(user.id);
    await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/roles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        hasAi ? { remove: [aiRole.id] } : { assign: [aiRole.id] }
      ),
    });
    setTogglingId(null);
    reload();
  }

  const filtered = users
    .filter((u) =>
      !search.trim() ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    )
    .filter((u) => {
      if (!aiRoleName) return true; // roles not loaded yet, show all
      if (aiFilter === "ai") return u.roles?.includes(aiRoleName);
      if (aiFilter === "no-ai") return !u.roles?.includes(aiRoleName);
      return true;
    });

  const aiCount = aiRoleName ? users.filter((u) => u.roles?.includes(aiRoleName)).length : 0;

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">Users</h1>
            {loading ? (
              <Skeleton className="h-5 w-8 rounded-full shrink-0" />
            ) : users.length > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                {users.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 w-40 md:w-56 text-xs bg-background"
              />
            </div>
            <Link href="/users/new">
              <Button size="sm" className="h-8 text-xs gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New User</span>
              </Button>
            </Link>
          </div>
        </div>
        {/* Filters row */}
        <div className="flex items-center gap-2 px-4 md:px-8 pb-3">
          {/* Mobile search */}
          <div className="relative sm:hidden flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-background w-full"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto sm:flex-none">
            {(["all", "ai", "no-ai"] as AiFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setAiFilter(f)}
                className={cn(
                  "flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors select-none whitespace-nowrap",
                  aiFilter === f
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
                )}
              >
                {f === "ai" && <Bot className="w-3 h-3" />}
                {f === "all" ? `All (${users.length})` : f === "ai" ? `AI (${aiCount})` : `No AI (${users.length - aiCount})`}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="bg-background border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">User</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Spend</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">AI Access</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Roles</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Limit</TableHead>
                <TableHead className="h-9 w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i} className="border-b border-border/60">
                      <TableCell className="pl-5 py-3">
                        <div className="flex items-center gap-3">
                          <SkeletonAvatar size="w-7 h-7" delay={stagger(i)} />
                          <div>
                            <SkeletonLine lh="h-4" w="w-28" delay={stagger(i, 80, 40)} />
                            <SkeletonLine lh="h-[14px]" h="h-2.5" w="w-40" delay={stagger(i, 80, 80)} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><SkeletonLine lh="h-[19.5px]" w="w-12" delay={stagger(i)} /></TableCell>
                      <TableCell><Skeleton className="h-[26px] w-[68px] rounded-full" delay={stagger(i, 80, 20)} /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" delay={stagger(i, 80, 40)} /></TableCell>
                      <TableCell><SkeletonLine lh="h-[16.5px]" w="w-16" delay={stagger(i, 80, 60)} /></TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center gap-1 justify-end">
                          {[0, 1, 2, 3].map((j) => (
                            <Skeleton key={j} className="h-7 w-7 rounded-md" delay={stagger(i, 80, j * 30)} />
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                : filtered.map((u) => {
                    const hasAi = aiRoleName ? u.roles?.includes(aiRoleName) : false;
                    const otherRoles = (u.roles ?? []).filter((r: string) => !isAiRole(r));
                    return (
                      <TableRow key={u.id} className="border-b border-border/60 hover:bg-muted/30 transition-colors">
                        <TableCell className="pl-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name ?? ""} email={u.email} picture={u.picture} />
                            <div className="min-w-0">
                              <Link href={`/users/${u.id}`} className="text-[13px] font-medium text-foreground hover:underline block truncate leading-tight">
                                {u.name}
                              </Link>
                              <span className="text-[11px] text-muted-foreground block truncate leading-tight">{u.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-[13px] font-semibold tabular-nums">{fmt(u.totalCostUsd)}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => hasAi ? toggleAiAccess(u) : setAiConfirmTarget(u)}
                            disabled={!aiRole || togglingId === u.id}
                            title={hasAi ? "Revoke AI access" : "Grant AI access"}
                            className={cn(
                              "flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all",
                              hasAi
                                ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700"
                                : "bg-muted text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground",
                              togglingId === u.id && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {togglingId === u.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Bot className={cn("w-3 h-3", hasAi ? "text-blue-500" : "text-muted-foreground")} />
                            }
                            {hasAi ? "Active" : "None"}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1.5 flex-wrap">
                            {otherRoles.length > 0
                              ? otherRoles.map((r: string) => {
                                  const admin = isAdminRole(r);
                                  return (
                                    <span
                                      key={r}
                                      className={cn(
                                        "inline-flex items-center gap-1 text-[10px] font-semibold px-2 h-5 rounded-full border",
                                        admin
                                          ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800"
                                          : "bg-muted text-muted-foreground border-border"
                                      )}
                                    >
                                      {admin
                                        ? <ShieldAlert className="w-2.5 h-2.5 shrink-0" />
                                        : <ShieldCheck className="w-2.5 h-2.5 shrink-0" />
                                      }
                                      {r}
                                    </span>
                                  );
                                })
                              : <span className="text-[11px] text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.limit
                            ? <span className="text-[11px] font-mono text-muted-foreground">{fmtLimit(u.limit.limitUsd)}/{u.limit.period}</span>
                            : <span className="text-[11px] text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Set limit" onClick={() => setLimitTarget(u)}>
                              <Gauge className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Manage roles" onClick={() => setRoleTarget(u)}>
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Edit user" onClick={() => setEditTarget(u)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" title="Delete user" onClick={() => setDeleteTarget(u)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-[13px] text-muted-foreground py-16">
                    No users match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {aiConfirmTarget && (
        <AiAccessDialog
          user={aiConfirmTarget}
          onConfirm={async () => { await toggleAiAccess(aiConfirmTarget); setAiConfirmTarget(null); }}
          onClose={() => setAiConfirmTarget(null)}
        />
      )}
      {limitTarget && (
        <LimitDialog user={limitTarget} onClose={() => setLimitTarget(null)} onSaved={() => { setLimitTarget(null); reload(); }} />
      )}
      {roleTarget && (
        <RoleDialog user={roleTarget} onClose={() => { setRoleTarget(null); reload(); }} />
      )}
      {editTarget && (
        <EditUserDialog user={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); reload(); }} />
      )}
      {deleteTarget && (
        <DeleteUserDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => { setDeleteTarget(null); reload(); }} />
      )}
    </div>
  );
}
