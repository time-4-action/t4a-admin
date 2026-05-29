"use client";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { KeyRound, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Scope { value: string; description: string }
interface ResourceServer { id: string; name: string; identifier: string; scopes: Scope[] }

export default function ScopesPage() {
  const [servers, setServers] = useState<ResourceServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Scope | null>(null);

  useEffect(() => {
    fetch("/api/admin/resource-servers")
      .then(r => r.ok ? r.json() : r.json().then((b: any) => Promise.reject(b.error ?? `HTTP ${r.status}`)))
      .then((data: ResourceServer[]) => setServers(Array.isArray(data) ? data : []))
      .catch((err: any) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const allScopes = useMemo(() => servers.flatMap(s => s.scopes), [servers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allScopes;
    return allScopes.filter(s =>
      s.value.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
    );
  }, [allScopes, search]);

  return (
    <div className="flex h-full">
      {/* ── Left: list ── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground">Scopes</h1>
            {!loading && allScopes.length > 0 && (
              <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full tabular-nums">
                {filtered.length}{filtered.length !== allScopes.length ? `/${allScopes.length}` : ""}
              </span>
            )}
          </div>
          <div className="relative w-36 sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search scopes…"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null); }}
              className="pl-8 h-8 text-xs bg-background"
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setSelected(null); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 md:p-8 space-y-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-1" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="skeleton h-3.5 rounded w-40" style={{ animationDelay: `${i * 60}ms` }} />
                  <div className="skeleton h-3 rounded flex-1" style={{ animationDelay: `${i * 60 + 40}ms` }} />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="m-6 flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/8 border border-destructive/15 text-xs text-destructive">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <KeyRound className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">
                {search ? `No scopes match "${search}"` : "No scopes found"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {filtered.map(scope => (
                <button
                  key={scope.value}
                  type="button"
                  onClick={() => setSelected(s => s?.value === scope.value ? null : scope)}
                  className={cn(
                    "w-full flex items-baseline gap-4 px-4 md:px-8 py-3 text-left transition-colors",
                    selected?.value === scope.value
                      ? "bg-muted/60 border-l-2 border-l-foreground"
                      : "hover:bg-muted/30 border-l-2 border-l-transparent"
                  )}
                >
                  <span className={cn(
                    "text-[12px] font-mono shrink-0",
                    selected?.value === scope.value ? "text-foreground font-semibold" : "text-foreground"
                  )}>
                    {scope.value}
                  </span>
                  {scope.description && (
                    <span className="text-[12px] text-muted-foreground truncate leading-relaxed">
                      {scope.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile overlay backdrop */}
      {selected && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setSelected(null)}
        />
      )}
      {/* ── Right: detail panel ── */}
      <div className={cn(
        "fixed top-0 right-0 bottom-0 z-50 md:relative md:z-auto",
        "flex flex-col shrink-0 border-l border-border transition-all duration-200 overflow-hidden bg-background",
        selected ? "w-72" : "w-0"
      )}>
        {selected && (
          <>
            <div className="h-14 border-b border-border flex items-center justify-between px-5 shrink-0 bg-background/80 backdrop-blur-sm">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Scope detail</p>
              <button
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Name</p>
                <p className="text-[13px] font-mono font-semibold text-foreground break-all">{selected.value}</p>
              </div>
              {selected.description && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</p>
                  <p className="text-[13px] text-foreground leading-relaxed">{selected.description}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
