"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isDevRole } from "@/lib/ai-role";
import { Loader2, ChevronDown, ChevronRight, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Scope { value: string; description: string }
interface ResourceServer { id: string; name: string; identifier: string; scopes: Scope[] }

// permKey encodes a permission as a single string for Set lookups
const permKey = (identifier: string, scope: string) => `${identifier}||${scope}`;

export default function NewAccessTypePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [servers, setServers] = useState<ResourceServer[]>([]);
  const [serversLoading, setServersLoading] = useState(true);
  const [serversError, setServersError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/resource-servers")
      .then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body;
      })
      .then(d => {
        if (Array.isArray(d)) {
          setServers(d);
          if (d.length > 0) setExpanded(new Set([d[0].id]));
        }
      })
      .catch(err => setServersError(err.message))
      .finally(() => setServersLoading(false));
  }, []);

  function toggleScope(identifier: string, scope: string) {
    const key = permKey(identifier, scope);
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleServer(server: ResourceServer) {
    const allSelected = server.scopes.every(s => selected.has(permKey(server.identifier, s.value)));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        server.scopes.forEach(s => next.delete(permKey(server.identifier, s.value)));
      } else {
        server.scopes.forEach(s => next.add(permKey(server.identifier, s.value)));
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required."); return; }
    if (isDevRole(name.trim())) { setError("This name is reserved."); return; }
    setSaving(true);
    setError("");

    // 1. Create the role
    const createRes = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() }),
    });
    if (!createRes.ok) {
      const body = await createRes.json().catch(() => ({}));
      setError(body.error ?? "Failed to create access type.");
      setSaving(false);
      return;
    }
    const { id: roleId } = await createRes.json();

    // 2. Add selected permissions if any
    if (selected.size > 0) {
      const permissions = [...selected].map(key => {
        const [resource_server_identifier, permission_name] = key.split("||");
        return { resource_server_identifier, permission_name };
      });
      await fetch(`/api/admin/roles/${encodeURIComponent(roleId)}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
    }

    router.push("/roles");
  }

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b border-border flex items-center px-4 md:px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <h1 className="font-display text-lg font-medium tracking-tight text-foreground">New Access Type</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <form onSubmit={handleSubmit} className="max-w-xl space-y-6">

          {/* Name + description */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Editor"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Permission picker */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                API Permissions
              </label>
              {selectedCount > 0 && (
                <span className="text-[10px] font-bold bg-foreground text-background px-2 py-0.5 rounded-full tabular-nums">
                  {selectedCount} selected
                </span>
              )}
            </div>

            {serversLoading ? (
              <div className="space-y-2">
                {[0, 1].map(i => (
                  <div key={i} className="h-12 bg-muted/60 animate-pulse rounded-xl" style={{ opacity: 1 - i * 0.3 }} />
                ))}
              </div>
            ) : serversError ? (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/8 border border-destructive/15 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Failed to load APIs: {serversError}
              </div>
            ) : servers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-xl">
                No APIs found in Auth0. Make sure your Management API client has <code className="font-mono">read:resource_servers</code> permission.
              </p>
            ) : (
              <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
                {servers.map((server) => {
                  const isExpanded = expanded.has(server.id);
                  const serverSelected = server.scopes.filter(s => selected.has(permKey(server.identifier, s.value))).length;
                  const allSelected = serverSelected === server.scopes.length;

                  return (
                    <div key={server.id}>
                      {/* Server header */}
                      <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                        <button
                          type="button"
                          onClick={() => setExpanded(prev => {
                            const next = new Set(prev);
                            next.has(server.id) ? next.delete(server.id) : next.add(server.id);
                            return next;
                          })}
                          className="flex items-center gap-2 flex-1 text-left min-w-0"
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                          <div className="min-w-0">
                            <span className="text-[13px] font-semibold text-foreground">{server.name}</span>
                            <span className="ml-2 text-[11px] text-muted-foreground font-mono truncate">{server.identifier}</span>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          {serverSelected > 0 && (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400 px-1.5 py-0.5 rounded-full tabular-nums">
                              {serverSelected}/{server.scopes.length}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleServer(server)}
                            className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {allSelected ? "None" : "All"}
                          </button>
                        </div>
                      </div>

                      {/* Scopes */}
                      {isExpanded && (
                        <div className="divide-y divide-border/40">
                          {server.scopes.map((scope) => {
                            const key = permKey(server.identifier, scope.value);
                            const isOn = selected.has(key);
                            return (
                              <button
                                key={scope.value}
                                type="button"
                                onClick={() => toggleScope(server.identifier, scope.value)}
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
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => router.push("/roles")}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? "Creating…" : "Create Access Type"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
