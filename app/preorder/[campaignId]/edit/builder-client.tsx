"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  Search,
  Package,
  PencilLine,
  Layers,
  Rocket,
  Eye,
  EyeOff,
  Upload,
  FileSpreadsheet,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PreorderCampaign,
  PreorderRow,
  PreorderTab,
  PreorderGroup,
  CampaignStatus,
} from "@/types/preorder";

type RowDraft = Omit<PreorderRow, "id" | "order">;
type GroupDraft = {
  name: string;
  parentCode?: string | null;
  description?: string | null;
  images?: string[];
  rows: RowDraft[];
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;

function move<T>(arr: T[], idx: number, delta: number): T[] {
  const next = [...arr];
  const j = idx + delta;
  if (j < 0 || j >= next.length) return next;
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}

function materializeGroup(draft: GroupDraft): PreorderGroup {
  return {
    id: uid(),
    name: draft.name,
    order: 0,
    parentCode: draft.parentCode ?? null,
    description: draft.description ?? null,
    images: draft.images ?? [],
    rows: draft.rows.map((r, i) => ({ ...r, id: uid(), order: i })),
  };
}

export default function BuilderClient({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<PreorderCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [productPickerTab, setProductPickerTab] = useState<string | null>(null);
  const [csvTab, setCsvTab] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (groupId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  useEffect(() => {
    fetch(`/api/admin/preorder/campaigns/${campaignId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "Not found");
        setCampaign(data.campaign);
        setActiveTabId(data.campaign.tabs[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [campaignId]);

  const mutate = useCallback((fn: (c: PreorderCampaign) => PreorderCampaign) => {
    setCampaign((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
  }, []);

  const mutateTab = useCallback(
    (tabId: string, fn: (t: PreorderTab) => PreorderTab) =>
      mutate((c) => ({ ...c, tabs: c.tabs.map((t) => (t.id === tabId ? fn(t) : t)) })),
    [mutate],
  );

  const mutateGroup = useCallback(
    (tabId: string, groupId: string, fn: (g: PreorderGroup) => PreorderGroup) =>
      mutateTab(tabId, (t) => ({
        ...t,
        groups: t.groups.map((g) => (g.id === groupId ? fn(g) : g)),
      })),
    [mutateTab],
  );

  // ── Tabs ──
  function addTab() {
    const t: PreorderTab = { id: uid(), name: "New tab", order: 0, groups: [] };
    mutate((c) => ({ ...c, tabs: [...c.tabs, t] }));
    setActiveTabId(t.id);
  }
  function deleteTab(tabId: string) {
    const rest = campaign?.tabs.filter((t) => t.id !== tabId) ?? [];
    mutate((c) => ({ ...c, tabs: c.tabs.filter((t) => t.id !== tabId) }));
    setActiveTabId((cur) => (cur !== tabId ? cur : rest[0]?.id ?? null));
  }
  function moveTab(tabId: string, delta: number) {
    mutate((c) => {
      const idx = c.tabs.findIndex((t) => t.id === tabId);
      return { ...c, tabs: move(c.tabs, idx, delta) };
    });
  }

  // ── Groups ──
  function addGroups(tabId: string, drafts: GroupDraft[]) {
    if (drafts.length === 0) return;
    mutateTab(tabId, (t) => ({ ...t, groups: [...t.groups, ...drafts.map(materializeGroup)] }));
  }
  function addBlankGroup(tabId: string) {
    addGroups(tabId, [{ name: "New group", rows: [] }]);
  }
  function deleteGroup(tabId: string, groupId: string) {
    mutateTab(tabId, (t) => ({ ...t, groups: t.groups.filter((g) => g.id !== groupId) }));
  }
  function moveGroup(tabId: string, groupId: string, delta: number) {
    mutateTab(tabId, (t) => {
      const idx = t.groups.findIndex((g) => g.id === groupId);
      return { ...t, groups: move(t.groups, idx, delta) };
    });
  }

  // ── Rows ──
  function addManualRow(tabId: string, groupId: string) {
    mutateGroup(tabId, groupId, (g) => ({
      ...g,
      rows: [
        ...g.rows,
        {
          id: uid(),
          order: g.rows.length,
          source: "manual",
          code: "",
          name: "",
          ean: null,
          variantLabel: null,
          size: null,
          tag: null,
          rrp: null,
          partnerPrice: null,
          discountedPrice: null,
          image: null,
        },
      ],
    }));
  }
  function updateRow(tabId: string, groupId: string, rowId: string, patch: Partial<PreorderRow>) {
    mutateGroup(tabId, groupId, (g) => ({
      ...g,
      rows: g.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    }));
  }
  function deleteRow(tabId: string, groupId: string, rowId: string) {
    mutateGroup(tabId, groupId, (g) => ({ ...g, rows: g.rows.filter((r) => r.id !== rowId) }));
  }
  function moveRow(tabId: string, groupId: string, rowId: string, delta: number) {
    mutateGroup(tabId, groupId, (g) => {
      const idx = g.rows.findIndex((r) => r.id === rowId);
      return { ...g, rows: move(g.rows, idx, delta) };
    });
  }

  const save = useCallback(
    async (statusOverride?: CampaignStatus) => {
      if (!campaign) return;
      setSaving(true);
      setError(null);
      const tabs = campaign.tabs.map((t, ti) => ({
        ...t,
        order: ti,
        groups: t.groups.map((g, gi) => ({
          ...g,
          order: gi,
          rows: g.rows.map((r, ri) => ({ ...r, order: ri })),
        })),
      }));
      try {
        const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: campaign.title,
            season: campaign.season,
            currency: campaign.currency,
            deadline: campaign.deadline,
            ...(statusOverride ? { status: statusOverride } : {}),
            tabs,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "Save failed");
        setCampaign(data.campaign);
        setDirty(false);
        setSavedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [campaign, campaignId],
  );

  const activeTab = useMemo(
    () => campaign?.tabs.find((t) => t.id === activeTabId) ?? null,
    [campaign, activeTabId],
  );

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-6 w-64 rounded skeleton" />
        <div className="h-40 w-full rounded-xl skeleton" />
      </div>
    );
  }
  if (error && !campaign) {
    return (
      <div className="p-8">
        <Link href="/preorder" className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to campaigns
        </Link>
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</div>
      </div>
    );
  }
  if (!campaign) return null;

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 md:px-6 h-14">
          <Link href="/preorder" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back to campaigns">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Input
            value={campaign.title}
            onChange={(e) => mutate((c) => ({ ...c, title: e.target.value }))}
            className="h-8 w-48 md:w-72 text-sm font-medium bg-background"
            aria-label="Campaign title"
          />
          <span className={cn(
            "hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0",
            campaign.status === "open" ? "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300"
              : campaign.status === "closed" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
          )}>
            {campaign.status}
          </span>
          <div className="flex-1" />
          {savedAt && !dirty && !saving && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-lime-600" /> Saved
            </span>
          )}
          <Link href={`/preorder/${campaignId}/preview`} className="hidden md:inline-flex" title="Preview as partner">
            <Button variant="ghost" size="sm" className="h-8"><Eye className="w-3.5 h-3.5" /> Preview</Button>
          </Link>
          <Link href={`/preorder/${campaignId}`} className="hidden lg:inline-flex" title="Campaign overview">
            <Button variant="ghost" size="sm" className="h-8"><LayoutDashboard className="w-3.5 h-3.5" /> Overview</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => save()} disabled={saving} className="h-8">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </Button>
          {campaign.status === "open" ? (
            <Button variant="outline" size="sm" onClick={() => save("draft")} disabled={saving} className="h-8"><EyeOff className="w-3.5 h-3.5" /> Unpublish</Button>
          ) : (
            <Button size="sm" onClick={() => save("open")} disabled={saving} className="h-8"><Rocket className="w-3.5 h-3.5" /> Publish</Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-6 pb-2.5 text-[12px]">
          <label className="flex items-center gap-1.5 text-muted-foreground">
            Season
            <Input value={campaign.season ?? ""} onChange={(e) => mutate((c) => ({ ...c, season: e.target.value }))} className="h-7 w-32 text-xs bg-background" placeholder="—" />
          </label>
          <label className="flex items-center gap-1.5 text-muted-foreground">
            Deadline
            <Input type="date" value={campaign.deadline ? campaign.deadline.slice(0, 10) : ""} onChange={(e) => mutate((c) => ({ ...c, deadline: e.target.value ? new Date(e.target.value).toISOString() : null }))} className="h-7 w-40 text-xs bg-background" />
          </label>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* Tab rail */}
        <aside className="w-44 md:w-52 shrink-0 border-r border-border overflow-y-auto p-2 space-y-1">
          {campaign.tabs.map((t, ti) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer text-[13px]",
                t.id === activeTabId ? "bg-lime-600/10 text-lime-700 dark:text-lime-300" : "hover:bg-muted text-foreground",
              )}
              onClick={() => setActiveTabId(t.id)}
            >
              <Layers className="w-3.5 h-3.5 shrink-0 opacity-60" />
              <span className="flex-1 truncate">{t.name || "Untitled"}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {t.groups.reduce((n, g) => n + g.rows.length, 0)}
              </span>
              <span className="opacity-0 group-hover:opacity-100 flex items-center">
                <button onClick={(e) => { e.stopPropagation(); moveTab(t.id, -1); }} disabled={ti === 0} className="p-0.5 disabled:opacity-30 hover:text-foreground" aria-label="Move tab up"><ChevronUp className="w-3 h-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); moveTab(t.id, 1); }} disabled={ti === campaign.tabs.length - 1} className="p-0.5 disabled:opacity-30 hover:text-foreground" aria-label="Move tab down"><ChevronDown className="w-3 h-3" /></button>
              </span>
            </div>
          ))}
          <button onClick={addTab} className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add tab
          </button>
        </aside>

        {/* Active tab editor */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6">
          {!activeTab ? (
            <div className="text-center text-[13px] text-muted-foreground py-20">
              <Layers className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
              Add a tab to start building the order sheet.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input value={activeTab.name} onChange={(e) => mutateTab(activeTab.id, (t) => ({ ...t, name: e.target.value }))} className="h-9 max-w-xs text-sm font-semibold bg-background" aria-label="Tab name" />
                <Input value={activeTab.discountNote ?? ""} onChange={(e) => mutateTab(activeTab.id, (t) => ({ ...t, discountNote: e.target.value }))} className="h-9 max-w-xs text-xs bg-background" placeholder="Discount note (optional)" />
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => deleteTab(activeTab.id)} className="h-8 text-destructive hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" /> Delete tab
                </Button>
              </div>

              {/* Primary add actions — a group is a parent product */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5">
                <Button size="sm" onClick={() => setProductPickerTab(activeTab.id)}>
                  <Search className="w-3.5 h-3.5" /> Add product
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCsvTab(activeTab.id)}>
                  <Upload className="w-3.5 h-3.5" /> Import SKUs
                </Button>
                <Button variant="ghost" size="sm" onClick={() => addBlankGroup(activeTab.id)} className="text-muted-foreground">
                  <Plus className="w-3.5 h-3.5" /> Blank group
                </Button>
                <span className="text-[11px] text-muted-foreground ml-auto hidden sm:block">
                  Each product becomes a group of its variants — delete any you don&rsquo;t want.
                </span>
              </div>

              {activeTab.groups.map((g, gi) => (
                <section key={g.id} className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className={cn("flex items-center gap-2 px-3 py-2 bg-muted/40", !collapsed.has(g.id) && "border-b border-border")}>
                    <button
                      type="button"
                      onClick={() => toggleCollapse(g.id)}
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0"
                      aria-label={collapsed.has(g.id) ? "Expand group" : "Collapse group"}
                      title={collapsed.has(g.id) ? "Expand" : "Collapse"}
                    >
                      {collapsed.has(g.id) ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <Input value={g.name} onChange={(e) => mutateGroup(activeTab.id, g.id, (gr) => ({ ...gr, name: e.target.value }))} className="h-7 max-w-[280px] text-[13px] font-medium bg-background" aria-label="Group name" />
                    <span className="text-[11px] text-muted-foreground tabular-nums">{g.rows.length} variant{g.rows.length === 1 ? "" : "s"}</span>
                    <div className="flex-1" />
                    <button onClick={() => moveGroup(activeTab.id, g.id, -1)} disabled={gi === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30" aria-label="Move group up"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => moveGroup(activeTab.id, g.id, 1)} disabled={gi === activeTab.groups.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30" aria-label="Move group down"><ChevronDown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteGroup(activeTab.id, g.id)} className="p-1 rounded hover:bg-muted text-destructive" aria-label="Delete group"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>

                  {!collapsed.has(g.id) && g.rows.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                            <th className="text-left font-semibold px-3 py-1.5 min-w-[200px]">Variant</th>
                            <th className="text-left font-semibold px-2 py-1.5">SKU</th>
                            <th className="text-left font-semibold px-2 py-1.5">Size / label</th>
                            <th className="text-right font-semibold px-2 py-1.5 w-20">RRP</th>
                            <th className="text-right font-semibold px-2 py-1.5 w-20">Partner</th>
                            <th className="text-right font-semibold px-2 py-1.5 w-20">Disc.</th>
                            <th className="px-2 py-1.5 w-16" />
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((r, ri) => (
                            <RowEditor
                              key={r.id}
                              row={r}
                              first={ri === 0}
                              last={ri === g.rows.length - 1}
                              onChange={(patch) => updateRow(activeTab.id, g.id, r.id, patch)}
                              onDelete={() => deleteRow(activeTab.id, g.id, r.id)}
                              onMove={(d) => moveRow(activeTab.id, g.id, r.id, d)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {!collapsed.has(g.id) && (
                    <div className="flex items-center gap-2 px-3 py-2 border-t border-border/60">
                      <Button variant="ghost" size="xs" onClick={() => addManualRow(activeTab.id, g.id)}>
                        <PencilLine className="w-3 h-3" /> Add variant manually
                      </Button>
                    </div>
                  )}
                </section>
              ))}

              {activeTab.groups.length === 0 && (
                <div className="text-center text-[13px] text-muted-foreground py-14 rounded-xl border border-dashed border-border">
                  <FileSpreadsheet className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
                  No products yet. Use <strong className="text-foreground">Add product</strong> or <strong className="text-foreground">Import SKUs</strong> above.
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {error && campaign && (
        <div className="fixed bottom-4 right-4 z-30 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive shadow">{error}</div>
      )}

      {productPickerTab && (
        <ProductPickerDialog
          onClose={() => setProductPickerTab(null)}
          onAddGroup={(g) => addGroups(productPickerTab, [g])}
        />
      )}
      {csvTab && (
        <CsvImportDialog
          onClose={() => setCsvTab(null)}
          onAddGroups={(gs) => addGroups(csvTab, gs)}
        />
      )}
    </div>
  );
}

// ── Row editor ──
function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function priceStr(n?: number | null): string {
  return n === null || n === undefined ? "" : String(n);
}

function RowEditor({
  row, first, last, onChange, onDelete, onMove,
}: {
  row: PreorderRow;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<PreorderRow>) => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
}) {
  const cell = "px-2 py-1 border-b border-border/40";
  const inp = "h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-[12px] hover:border-border focus:border-ring focus:bg-background focus:outline-none";
  return (
    <tr className="hover:bg-muted/20">
      <td className={cn(cell, "pl-3")}>
        <div className="flex items-center gap-1.5">
          {row.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.image} alt="" className="w-6 h-6 rounded object-cover ring-1 ring-border shrink-0" />
          ) : (
            <span className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0"><Package className="w-3 h-3 text-muted-foreground" /></span>
          )}
          <input className={inp} value={row.name} placeholder="Variant name" onChange={(e) => onChange({ name: e.target.value })} />
          {row.tag && (
            <span className="text-[9px] font-bold uppercase text-lime-700 bg-lime-100 dark:bg-lime-900/50 dark:text-lime-300 rounded px-1 shrink-0">
              {row.tag === "NEW" ? "NEW" : "PRE"}
            </span>
          )}
        </div>
      </td>
      <td className={cell}><input className={cn(inp, "font-mono text-[11px]")} value={row.code} placeholder="SKU" onChange={(e) => onChange({ code: e.target.value })} /></td>
      <td className={cell}><input className={inp} value={row.variantLabel ?? row.size ?? ""} placeholder="size / label" onChange={(e) => onChange({ variantLabel: e.target.value || null })} /></td>
      <td className={cell}><input className={cn(inp, "text-right tabular-nums")} value={priceStr(row.rrp)} inputMode="decimal" onChange={(e) => onChange({ rrp: numOrNull(e.target.value) })} /></td>
      <td className={cell}><input className={cn(inp, "text-right tabular-nums")} value={priceStr(row.partnerPrice)} inputMode="decimal" onChange={(e) => onChange({ partnerPrice: numOrNull(e.target.value) })} /></td>
      <td className={cell}><input className={cn(inp, "text-right tabular-nums")} value={priceStr(row.discountedPrice)} inputMode="decimal" onChange={(e) => onChange({ discountedPrice: numOrNull(e.target.value) })} /></td>
      <td className={cn(cell, "whitespace-nowrap")}>
        <div className="flex items-center justify-end">
          <button onClick={() => onMove(-1)} disabled={first} className="p-0.5 disabled:opacity-30 hover:text-foreground text-muted-foreground" aria-label="Move up"><ChevronUp className="w-3 h-3" /></button>
          <button onClick={() => onMove(1)} disabled={last} className="p-0.5 disabled:opacity-30 hover:text-foreground text-muted-foreground" aria-label="Move down"><ChevronDown className="w-3 h-3" /></button>
          <button onClick={onDelete} className="p-0.5 text-muted-foreground hover:text-destructive" aria-label="Delete variant"><Trash2 className="w-3 h-3" /></button>
        </div>
      </td>
    </tr>
  );
}

// ── Product picker: search catalogue, add the parent + all its variants as a group ──
type Hit = { code: string; name: string; image?: string | null };

function ProductPickerDialog({
  onClose, onAddGroup,
}: {
  onClose: () => void;
  onAddGroup: (g: GroupDraft) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/preorder/products/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setResults((data.candidates ?? []).map((c: { code: string; name: string; image?: string | null }) => ({ code: c.code, name: c.name, image: c.image })));
        })
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  async function pick(h: Hit) {
    setResolving(h.code);
    try {
      const r = await fetch(`/api/admin/preorder/products/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: h.code }),
      });
      const data = await r.json();
      if (r.ok && data.group) {
        onAddGroup(data.group);
        setAdded((s) => new Set(s).add(h.code));
      }
    } finally {
      setResolving(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Search className="w-4 h-4 text-lime-600" /> Add product</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input autoFocus placeholder="Search by name, SKU or EAN…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-9" />
        </div>
        <p className="text-[11px] text-muted-foreground">Adds the product as a group with all its variants.</p>
        <div className="max-h-80 overflow-y-auto -mx-1 mt-1">
          {loading && <div className="text-[12px] text-muted-foreground px-2 py-3">Searching…</div>}
          {!loading && q.trim().length >= 2 && results.length === 0 && <div className="text-[12px] text-muted-foreground px-2 py-3">No matches.</div>}
          {results.map((c) => (
            <div key={c.code} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40">
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image} alt="" className="w-8 h-8 rounded object-cover ring-1 ring-border shrink-0" />
              ) : (
                <span className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0"><Package className="w-3.5 h-3.5 text-muted-foreground" /></span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-foreground truncate">{c.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">{c.code}</div>
              </div>
              <Button size="xs" variant={added.has(c.code) ? "ghost" : "outline"} disabled={resolving === c.code} onClick={() => pick(c)}>
                {resolving === c.code ? <Loader2 className="w-3 h-3 animate-spin" /> : added.has(c.code) ? <><Check className="w-3 h-3" /> Added</> : <><Plus className="w-3 h-3" /> Add</>}
              </Button>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-1"><Button size="sm" variant="outline" onClick={onClose}>Done</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// ── CSV / SKU import: paste codes, resolve, add grouped by parent ──
function CsvImportDialog({
  onClose, onAddGroups,
}: {
  onClose: () => void;
  onAddGroups: (gs: GroupDraft[]) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [done, setDone] = useState<number | null>(null);

  function parseCodes(raw: string): string[] {
    return Array.from(
      new Set(
        raw
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText((prev) => (prev ? prev + "\n" : "") + content);
  }

  async function run() {
    const codes = parseCodes(text);
    if (codes.length === 0) return;
    setBusy(true);
    setNotFound([]);
    setDone(null);
    try {
      const r = await fetch(`/api/admin/preorder/products/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      });
      const data = await r.json();
      const groups: GroupDraft[] = data.groups ?? [];
      onAddGroups(groups);
      setNotFound(data.notFound ?? []);
      setDone(groups.reduce((n: number, g: GroupDraft) => n + g.rows.length, 0));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4 text-lime-600" /> Import SKUs</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-muted-foreground">
          Paste SKU / EAN codes (any separator) or upload a CSV. Each resolves against the
          catalogue and is grouped under its parent product.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"P01250001071\nP01250001076, 4262434061897\n…"}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] font-mono focus:border-ring focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-muted-foreground inline-flex items-center gap-1.5 cursor-pointer hover:text-foreground">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Upload CSV
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
          </label>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={run} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Import
          </Button>
        </div>
        {done !== null && (
          <p className="text-[12px] text-lime-600 dark:text-lime-400">Imported {done} variant{done === 1 ? "" : "s"}.</p>
        )}
        {notFound.length > 0 && (
          <p className="text-[12px] text-amber-600 dark:text-amber-400">
            Not found: <span className="font-mono">{notFound.slice(0, 12).join(", ")}</span>
            {notFound.length > 12 ? ` +${notFound.length - 12} more` : ""}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
