"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CampaignHeader } from "@/app/preorder/[campaignId]/campaign-nav";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ChevronsDownUp,
  ChevronsUpDown,
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
  RefreshCw,
  GripVertical,
  Percent,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  activeTiers,
  type PreorderCampaign,
  type PreorderRow,
  type PreorderTab,
  type PreorderTier,
  type PreorderGroup,
  type CampaignStatus,
} from "@/types/preorder";
import { fmtMoney } from "@/app/preorder/preorder-shared";
import type { MkPricelist } from "@/types/documents";

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

// Reorder an array by moving the item with `activeId` to where `overId` sits.
function reorderById<T extends { id: string }>(arr: T[], activeId: string, overId: string): T[] {
  const from = arr.findIndex((x) => x.id === activeId);
  const to = arr.findIndex((x) => x.id === overId);
  if (from === -1 || to === -1 || from === to) return arr;
  return arrayMove(arr, from, to);
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
  // The product picker either adds a NEW group to a tab, or appends a product's
  // variants to an EXISTING group ("Add from catalogue" in the group footer).
  const [picker, setPicker] = useState<{ tabId: string; groupId?: string } | null>(null);
  const [csvTab, setCsvTab] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pricelists, setPricelists] = useState<MkPricelist[]>([]);
  const [repricing, setRepricing] = useState(false);
  const [repricedAt, setRepricedAt] = useState<number | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);

  const sensors = useSensors(
    // A small drag threshold so plain clicks (select / double-click rename) still register.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  // Metakocka sales price lists → the RRP / partner-price selectors.
  useEffect(() => {
    fetch(`/api/admin/preorder/pricelists`)
      .then((r) => r.json())
      .then((data) => setPricelists(data.pricelists ?? []))
      .catch(() => setPricelists([]));
  }, []);

  // Bumped on every edit — lets an in-flight autosave tell whether the sheet was
  // touched again before it resolved (so it doesn't wrongly clear the dirty flag).
  const editSeqRef = useRef(0);
  // Mirror of `dirty` for the beforeunload handler (which can't read fresh state).
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const mutate = useCallback((fn: (c: PreorderCampaign) => PreorderCampaign) => {
    editSeqRef.current += 1;
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
  function reorderTabs(activeId: string, overId: string) {
    mutate((c) => ({ ...c, tabs: reorderById(c.tabs, activeId, overId) }));
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
  function reorderGroups(tabId: string, activeId: string, overId: string) {
    mutateTab(tabId, (t) => ({ ...t, groups: reorderById(t.groups, activeId, overId) }));
  }

  // ── Rows ──
  // Append a product's variants to an existing group, skipping SKUs already in it.
  function appendRows(tabId: string, groupId: string, drafts: RowDraft[]) {
    mutateGroup(tabId, groupId, (g) => {
      const have = new Set(g.rows.map((r) => r.code));
      const fresh = drafts.filter((r) => !r.code || !have.has(r.code));
      return { ...g, rows: [...g.rows, ...fresh.map((r, i) => ({ ...r, id: uid(), order: g.rows.length + i }))] };
    });
  }
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
  function reorderRows(tabId: string, groupId: string, activeId: string, overId: string) {
    mutateGroup(tabId, groupId, (g) => ({ ...g, rows: reorderById(g.rows, activeId, overId) }));
  }

  const save = useCallback(
    async (statusOverride?: CampaignStatus) => {
      if (!campaign) return;
      const seqAtSave = editSeqRef.current;
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
            rrpPricelist: campaign.rrpPricelist ?? null,
            partnerPricelist: campaign.partnerPricelist ?? null,
            ...(statusOverride ? { status: statusOverride } : {}),
            tabs,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "Save failed");
        // Don't replace the whole campaign from the response — that would clobber any
        // keystrokes made while the request was in flight. Only reflect the server
        // status (publish/unpublish). Local edits remain the source of truth.
        setCampaign((prev) => (prev ? { ...prev, status: data.campaign.status } : data.campaign));
        // Only mark clean if nothing was edited since this save started.
        if (editSeqRef.current === seqAtSave) setDirty(false);
        setSavedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [campaign, campaignId],
  );

  // Autosave: persist ~900ms after the last edit. `save` re-identifies on every
  // edit (it closes over `campaign`), so this effect re-arms the timer per keystroke,
  // debouncing to one write after typing settles.
  useEffect(() => {
    if (!dirty || saving) return;
    const t = setTimeout(() => { void save(); }, 900);
    return () => clearTimeout(t);
  }, [dirty, saving, save]);

  // Best-effort flush if the tab is closed with unsaved edits mid-debounce.
  useEffect(() => {
    const onLeave = () => {
      if (dirtyRef.current) void save();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [save]);

  // Re-apply the selected price lists to every catalogue row already on the sheet.
  // Manual products are left untouched. Marks the sheet dirty so it can be saved.
  const reprice = useCallback(async () => {
    if (!campaign) return;
    const codes = new Set<string>();
    for (const t of campaign.tabs)
      for (const g of t.groups)
        for (const r of g.rows) if (r.source === "catalogue" && r.code) codes.add(r.code);
    if (codes.size === 0) return;
    setRepricing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/preorder/products/reprice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codes: Array.from(codes),
          rrpPricelist: campaign.rrpPricelist ?? null,
          partnerPricelist: campaign.partnerPricelist ?? null,
        }),
      });
      const data = await res.json();
      const prices: Record<string, { rrp: number | null; partnerPrice: number | null; taxCode?: string | null }> =
        data.prices ?? {};
      mutate((c) => ({
        ...c,
        tabs: c.tabs.map((t) => ({
          ...t,
          groups: t.groups.map((g) => ({
            ...g,
            rows: g.rows.map((row) => {
              if (row.source !== "catalogue") return row;
              const p = prices[row.code];
              return p ? { ...row, rrp: p.rrp, partnerPrice: p.partnerPrice, taxCode: p.taxCode ?? row.taxCode ?? null } : row;
            }),
          })),
        })),
      }));
      // Markets / customer rules may point at other price lists: refresh their books too.
      await fetch(`/api/admin/preorder/campaigns/${campaignId}/price-books/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => undefined);
      setRepricedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-pricing failed");
    } finally {
      setRepricing(false);
    }
  }, [campaign, mutate, campaignId]);

  const activeTab = useMemo(
    () => campaign?.tabs.find((t) => t.id === activeTabId) ?? null,
    [campaign, activeTabId],
  );
  // The group the variant picker is open for (live, so "In group" ticks update as rows land).
  const pickerGroup = useMemo(
    () => (picker?.groupId ? campaign?.tabs.find((t) => t.id === picker.tabId)?.groups.find((g) => g.id === picker.groupId) ?? null : null),
    [campaign, picker],
  );

  if (loading) return <BuilderSkeleton campaignId={campaignId} />;
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
      <CampaignHeader
        campaignId={campaignId}
        active="sheet"
        title={
          <div className="flex items-center gap-2">
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
          </div>
        }
        actions={
          <>
            <span
              className="text-[11px] text-muted-foreground inline-flex items-center gap-1 min-w-[70px] justify-end"
              title="Changes save automatically"
            >
              {saving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              ) : dirty ? (
                <><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved</>
              ) : savedAt ? (
                <><Check className="w-3.5 h-3.5 text-lime-600" /> Saved</>
              ) : null}
            </span>
            {campaign.status === "open" ? (
              <Button variant="outline" size="sm" onClick={() => save("draft")} disabled={saving} className="h-8"><EyeOff className="w-3.5 h-3.5" /> Unpublish</Button>
            ) : (
              <Button size="sm" onClick={() => save("open")} disabled={saving} className="h-8"><Rocket className="w-3.5 h-3.5" /> Publish</Button>
            )}
          </>
        }
      />
      {/* Campaign settings toolbar — page-specific, so it sits below the shared header. */}
      <div className="shrink-0 border-b border-border bg-muted/30 px-4 md:px-6 py-2.5 flex flex-wrap items-end gap-x-5 gap-y-3">
        <SettingsField label="Season">
          <Input value={campaign.season ?? ""} onChange={(e) => mutate((c) => ({ ...c, season: e.target.value }))} className="h-8 w-36 text-[12px] bg-background" placeholder="e.g. 2026" />
        </SettingsField>
        <SettingsField label="Deadline">
          <DatePicker
            value={campaign.deadline ?? null}
            withTime
            placeholder="Set deadline"
            onChange={(iso) => mutate((c) => ({ ...c, deadline: iso }))}
            triggerClassName="h-8"
          />
        </SettingsField>
        <div className="hidden md:block w-px h-8 bg-border" aria-hidden />
        <SettingsField label="RRP price list" hint="Recommended retail prices shown next to the partner price">
          <PricelistSelect
            label="RRP list"
            value={campaign.rrpPricelist ?? null}
            pricelists={pricelists}
            onChange={(v) => mutate((c) => ({ ...c, rrpPricelist: v }))}
          />
        </SettingsField>
        <SettingsField label="Partner price list" hint="The price list the sheet's row prices come from">
          <PricelistSelect
            label="Partner list"
            value={campaign.partnerPricelist ?? null}
            pricelists={pricelists}
            onChange={(v) => mutate((c) => ({ ...c, partnerPricelist: v }))}
          />
        </SettingsField>
        <div className="flex items-center gap-2 h-8">
          <Button
            variant="outline"
            size="sm"
            className="h-8 bg-background"
            onClick={reprice}
            disabled={repricing}
            title="Re-apply the selected price lists to every catalogue row on the sheet"
          >
            {repricing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-price sheet
          </Button>
          {repricedAt && !repricing && (
            <span className="text-[11px] text-lime-600 dark:text-lime-400 inline-flex items-center gap-1">
              <Check className="w-3 h-3" /> Repriced
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Tab rail */}
        <aside className="w-44 md:w-52 shrink-0 border-r border-border overflow-y-auto p-2 space-y-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e: DragEndEvent) => {
              const { active, over } = e;
              if (over && active.id !== over.id) reorderTabs(String(active.id), String(over.id));
            }}
          >
            <SortableContext items={campaign.tabs.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {campaign.tabs.map((t) => (
                <SortableTab
                  key={t.id}
                  tab={t}
                  active={t.id === activeTabId}
                  count={t.groups.reduce((n, g) => n + g.rows.length, 0)}
                  renaming={renamingTabId === t.id}
                  onSelect={() => setActiveTabId(t.id)}
                  onStartRename={() => { setActiveTabId(t.id); setRenamingTabId(t.id); }}
                  onRename={(name) => mutateTab(t.id, (x) => ({ ...x, name }))}
                  onEndRename={() => setRenamingTabId(null)}
                />
              ))}
            </SortableContext>
          </DndContext>
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
              <div className="rounded-xl border border-border bg-surface px-4 py-3 flex flex-wrap items-end gap-x-5 gap-y-3">
                <SettingsField label="Tab name">
                  <Input value={activeTab.name} onChange={(e) => mutateTab(activeTab.id, (t) => ({ ...t, name: e.target.value }))} className="h-8 w-56 text-[13px] font-semibold bg-background" aria-label="Tab name" />
                </SettingsField>
                <SettingsField label="Discount note" hint="Free-text hint shown to the partner under this tab's name">
                  <Input value={activeTab.discountNote ?? ""} onChange={(e) => mutateTab(activeTab.id, (t) => ({ ...t, discountNote: e.target.value }))} className="h-8 w-80 text-[12px] bg-background" placeholder="Optional — shown to partners under the tab" />
                </SettingsField>
                <div className="flex-1" />
                {activeTab.groups.length > 0 && (() => {
                  const allCollapsed = activeTab.groups.every((g) => collapsed.has(g.id));
                  const ids = activeTab.groups.map((g) => g.id);
                  return (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (allCollapsed) ids.forEach((id) => next.delete(id));
                        else ids.forEach((id) => next.add(id));
                        return next;
                      })}
                      className="h-8 text-muted-foreground"
                    >
                      {allCollapsed ? <><ChevronsUpDown className="w-3.5 h-3.5" /> Expand all</> : <><ChevronsDownUp className="w-3.5 h-3.5" /> Collapse all</>}
                    </Button>
                  );
                })()}
                <Button variant="ghost" size="sm" onClick={() => deleteTab(activeTab.id)} className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-3.5 h-3.5" /> Delete tab
                </Button>
              </div>

              <TierEditor
                key={activeTab.id}
                tab={activeTab}
                currency={campaign.currency}
                onChange={(tiers) => mutateTab(activeTab.id, (t) => ({ ...t, tiers }))}
                otherTabCount={campaign.tabs.length - 1}
                onApplyToAllTabs={() =>
                  mutate((c) => ({
                    ...c,
                    tabs: c.tabs.map((t) =>
                      t.id === activeTab.id
                        ? t
                        : { ...t, tiers: (activeTab.tiers ?? []).map((x) => ({ ...x, id: uid() })) },
                    ),
                  }))
                }
              />

              {/* Primary add actions — a group is a parent product */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5">
                <Button size="sm" onClick={() => setPicker({ tabId: activeTab.id })}>
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

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e: DragEndEvent) => {
                  const { active, over } = e;
                  if (over && active.id !== over.id) reorderGroups(activeTab.id, String(active.id), String(over.id));
                }}
              >
                <SortableContext items={activeTab.groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-4">
                    {activeTab.groups.map((g) => (
                      <GroupSection
                        key={g.id}
                        group={g}
                        collapsed={collapsed.has(g.id)}
                        sensors={sensors}
                        onToggleCollapse={() => toggleCollapse(g.id)}
                        onRenameGroup={(name) => mutateGroup(activeTab.id, g.id, (gr) => ({ ...gr, name }))}
                        onDeleteGroup={() => deleteGroup(activeTab.id, g.id)}
                        onAddRow={() => addManualRow(activeTab.id, g.id)}
                        onAddFromCatalogue={() => setPicker({ tabId: activeTab.id, groupId: g.id })}
                        onUpdateRow={(rowId, patch) => updateRow(activeTab.id, g.id, rowId, patch)}
                        onDeleteRow={(rowId) => deleteRow(activeTab.id, g.id, rowId)}
                        onReorderRows={(a, o) => reorderRows(activeTab.id, g.id, a, o)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

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

      {picker && !picker.groupId && (
        <ProductPickerDialog
          rrpPricelist={campaign.rrpPricelist ?? null}
          partnerPricelist={campaign.partnerPricelist ?? null}
          onClose={() => setPicker(null)}
          onAddGroup={(g) => addGroups(picker.tabId, [g])}
        />
      )}
      {picker?.groupId && pickerGroup && (
        <VariantPickerDialog
          group={pickerGroup}
          rrpPricelist={campaign.rrpPricelist ?? null}
          partnerPricelist={campaign.partnerPricelist ?? null}
          onClose={() => setPicker(null)}
          onAddRows={(rows) => appendRows(picker.tabId, picker.groupId!, rows)}
        />
      )}
      {csvTab && (
        <CsvImportDialog
          rrpPricelist={campaign.rrpPricelist ?? null}
          partnerPricelist={campaign.partnerPricelist ?? null}
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
  return n === null || n === undefined ? "" : n.toFixed(2);
}

// A price cell: shows two decimals, edits as a plain number, commits on blur /
// Enter (so typing never fights a formatter), and re-syncs when the row's value
// changes underneath it (re-price).
function PriceInput({ value, onCommit, placeholder = "—" }: { value?: number | null; onCommit: (n: number | null) => void; placeholder?: string }) {
  const [text, setText] = useState(() => priceStr(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(priceStr(value));
  }, [value, focused]);
  const commit = () => {
    const n = numOrNull(text);
    onCommit(n);
    setText(priceStr(n));
  };
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[12.5px] text-right tabular-nums text-foreground",
        "hover:border-border focus:border-ring focus:bg-background focus:outline-none placeholder:text-muted-foreground/50",
      )}
      value={text}
      placeholder={placeholder}
      inputMode="decimal"
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

const RowEditor = memo(function RowEditor({
  row, onChange, onDelete,
}: {
  row: PreorderRow;
  onChange: (patch: Partial<PreorderRow>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: "relative" as const, zIndex: 10, opacity: 0.9 } : {}),
  };
  const cell = "px-1.5 py-1 border-b border-border/40 align-middle";
  const inp = "h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[12.5px] text-foreground hover:border-border focus:border-ring focus:bg-background focus:outline-none placeholder:text-muted-foreground/50";
  return (
    <tr ref={setNodeRef} style={style} className={cn("group/row hover:bg-muted/25", isDragging && "bg-surface shadow-lg", row.restricted && "bg-amber-50/40 dark:bg-amber-950/10")} {...attributes}>
      {/* drag handle */}
      <td className={cn(cell, "pl-2 pr-0 w-7")}>
        <button
          type="button"
          {...listeners}
          className="flex h-8 w-5 items-center justify-center rounded cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-foreground"
          aria-label="Drag to reorder variant"
          title="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </td>
      {/* variant */}
      <td className={cell}>
        <div className="flex items-center gap-2 min-w-0">
          {row.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.image} alt="" className="w-8 h-8 rounded-md object-cover ring-1 ring-border shrink-0" />
          ) : (
            <span className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0"><Package className="w-3.5 h-3.5 text-muted-foreground" /></span>
          )}
          <input className={cn(inp, "font-medium")} value={row.name} placeholder="Variant name" onChange={(e) => onChange({ name: e.target.value })} />
          {row.tag && (
            <span className="text-[9px] font-bold uppercase text-lime-700 bg-lime-100 dark:bg-lime-900/50 dark:text-lime-300 rounded px-1 shrink-0">
              {row.tag === "NEW" ? "NEW" : "PRE"}
            </span>
          )}
        </div>
      </td>
      <td className={cell}><input className={cn(inp, "font-mono text-[11.5px] text-muted-foreground focus:text-foreground")} value={row.code} placeholder="SKU" onChange={(e) => onChange({ code: e.target.value })} /></td>
      <td className={cell}><input className={inp} value={row.variantLabel ?? row.size ?? ""} placeholder="size / label" onChange={(e) => onChange({ variantLabel: e.target.value || null })} /></td>
      <td className={cn(cell, "border-l border-l-border/40")}><PriceInput value={row.rrp} onCommit={(n) => onChange({ rrp: n })} /></td>
      <td className={cell}><PriceInput value={row.partnerPrice} onCommit={(n) => onChange({ partnerPrice: n })} /></td>
      <td className={cell}><PriceInput value={row.discountedPrice} onCommit={(n) => onChange({ discountedPrice: n })} /></td>
      {/* actions */}
      <td className={cn(cell, "pr-2 whitespace-nowrap")}>
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={() => onChange({ restricted: !row.restricted })}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              row.restricted
                ? "text-amber-600 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-900/30"
                : "text-muted-foreground/40 hover:text-foreground hover:bg-muted opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
            )}
            aria-label={row.restricted ? "Restricted — shown only where a market or customer exposes it" : "In the default assortment"}
            title={row.restricted ? "Restricted: not in the default assortment (only markets / customers that expose it see it)" : "In the default assortment — click to restrict"}
          >
            {row.restricted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-colors"
            aria-label="Delete variant"
            title="Delete variant"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
});

// ── Sortable tab (rail): click to select, double-click to rename inline, grip to drag ──
function SortableTab({
  tab, active, count, renaming, onSelect, onStartRename, onRename, onEndRename,
}: {
  tab: PreorderTab;
  active: boolean;
  count: number;
  renaming: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onEndRename: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 10, opacity: 0.9 } : {}),
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1 rounded-lg pl-1 pr-2 py-1.5 text-[13px]",
        isDragging && "shadow-lg bg-surface",
        active ? "bg-lime-600/10 text-lime-700 dark:text-lime-300" : "hover:bg-muted text-foreground",
        !renaming && "cursor-pointer",
      )}
      onClick={() => !renaming && onSelect()}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="p-0.5 -mr-0.5 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-foreground shrink-0"
        aria-label="Drag to reorder tab"
        title="Drag to reorder"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <Layers className="w-3.5 h-3.5 shrink-0 opacity-60" />
      {renaming ? (
        <input
          autoFocus
          defaultValue={tab.name}
          onFocus={(e) => e.target.select()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onRename(e.target.value)}
          onBlur={onEndRename}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          }}
          className="flex-1 min-w-0 h-6 rounded border border-ring bg-background px-1.5 text-[13px] outline-none"
          aria-label="Tab name"
        />
      ) : (
        <span
          className="flex-1 truncate select-none"
          onDoubleClick={(e) => { e.stopPropagation(); onStartRename(); }}
          title="Double-click to rename"
        >
          {tab.name || "Untitled"}
        </span>
      )}
      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{count}</span>
    </div>
  );
}

// ── Sortable group (a parent product): header + variant table, drag via grip ──
function GroupSection({
  group, collapsed, sensors, onToggleCollapse, onRenameGroup, onDeleteGroup, onAddRow, onAddFromCatalogue, onUpdateRow, onDeleteRow, onReorderRows,
}: {
  group: PreorderGroup;
  collapsed: boolean;
  sensors: ReturnType<typeof useSensors>;
  onToggleCollapse: () => void;
  onRenameGroup: (name: string) => void;
  onDeleteGroup: () => void;
  onAddRow: () => void;
  onAddFromCatalogue: () => void;
  onUpdateRow: (rowId: string, patch: Partial<PreorderRow>) => void;
  onDeleteRow: (rowId: string) => void;
  onReorderRows: (activeId: string, overId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 20, position: "relative" as const } : {}),
  };
  return (
    <section
      ref={setNodeRef}
      style={style}
      className={cn("rounded-xl border border-border bg-surface overflow-hidden", isDragging && "shadow-xl opacity-95")}
    >
      <div className={cn("group/g flex items-center gap-1.5 pl-2 pr-3 py-2 bg-muted/40", !collapsed && "border-b border-border")}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-7 w-5 items-center justify-center rounded cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-foreground shrink-0"
          aria-label="Drag to reorder group"
          title="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted text-muted-foreground shrink-0"
          aria-label={collapsed ? "Expand group" : "Collapse group"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <Input value={group.name} onChange={(e) => onRenameGroup(e.target.value)} className="h-8 max-w-[340px] text-[13.5px] font-semibold bg-background" aria-label="Group name" />
        <span className="rounded-full bg-muted px-2 h-6 inline-flex items-center text-[11px] text-muted-foreground tabular-nums shrink-0">
          {group.rows.length} variant{group.rows.length === 1 ? "" : "s"}
        </span>
        <div className="flex-1" />
        {collapsed && (
          <Button variant="ghost" size="xs" onClick={onToggleCollapse} className="text-muted-foreground">
            Show variants
          </Button>
        )}
        <button
          type="button"
          onClick={onDeleteGroup}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="Delete group"
          title="Delete group"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {!collapsed && group.rows.length > 0 && (
        <VariantTable
          rows={group.rows}
          sensors={sensors}
          onReorderRows={onReorderRows}
          onUpdateRow={onUpdateRow}
          onDeleteRow={onDeleteRow}
        />
      )}

      {!collapsed && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-muted/20">
          <Button variant="ghost" size="xs" onClick={onAddFromCatalogue} className="text-muted-foreground hover:text-foreground">
            <Search className="w-3 h-3" /> Add variants from catalogue
          </Button>
          <span className="text-muted-foreground/40 text-[11px]">·</span>
          <Button variant="ghost" size="xs" onClick={onAddRow} className="text-muted-foreground hover:text-foreground">
            <PencilLine className="w-3 h-3" /> Add a variant manually
          </Button>
          {group.rows.length === 0 && <span className="ml-2 text-[11px] text-muted-foreground">This group is empty.</span>}
        </div>
      )}
    </section>
  );
}

// ── Variant table: memoized so a group being dragged/reordered doesn't force
// every *other* group to re-render its whole rows table on each drag frame. ──
const VariantTable = memo(function VariantTable({
  rows, sensors, onReorderRows, onUpdateRow, onDeleteRow,
}: {
  rows: PreorderRow[];
  sensors: ReturnType<typeof useSensors>;
  onReorderRows: (activeId: string, overId: string) => void;
  onUpdateRow: (rowId: string, patch: Partial<PreorderRow>) => void;
  onDeleteRow: (rowId: string) => void;
}) {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e: DragEndEvent) => {
        const { active, over } = e;
        if (over && active.id !== over.id) onReorderRows(String(active.id), String(over.id));
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] table-fixed min-w-[900px]">
          <colgroup>
            <col className="w-7" />
            <col />
            <col className="w-[170px]" />
            <col className="w-[220px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[76px]" />
          </colgroup>
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-muted/15">
              <th className="py-2" />
              <th className="text-left font-semibold px-3 py-2">Variant</th>
              <th className="text-left font-semibold px-3 py-2">SKU</th>
              <th className="text-left font-semibold px-3 py-2">Size / label</th>
              <th className="text-right font-semibold px-3 py-2 border-l border-l-border/40" title="Recommended retail price, incl. VAT">RRP</th>
              <th className="text-right font-semibold px-3 py-2" title="Partner price, excl. VAT">Partner</th>
              <th className="text-right font-semibold px-3 py-2" title="Discounted partner price — overrides the partner price when set">Discounted</th>
              <th className="py-2" />
            </tr>
          </thead>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <tbody>
              {rows.map((r) => (
                <RowEditor
                  key={r.id}
                  row={r}
                  onChange={(patch) => onUpdateRow(r.id, patch)}
                  onDelete={() => onDeleteRow(r.id)}
                />
              ))}
            </tbody>
          </SortableContext>
        </table>
      </div>
    </DndContext>
  );
});

// ── Price-list selector: pick which Metakocka list feeds a price column ──
// ── Volume discount tiers (per tab) ─────────────────────────────────────────
// A tab's ladder: order enough value INSIDE this tab and every line in it drops by
// the tier's percentage. Tiers never stack — only the highest one reached applies.
function TierEditor({
  tab,
  currency,
  onChange,
  onApplyToAllTabs,
  otherTabCount,
}: {
  tab: PreorderTab;
  currency: string;
  onChange: (tiers: PreorderTier[]) => void;
  onApplyToAllTabs: () => void;
  otherTabCount: number;
}) {
  const tiers = useMemo(() => tab.tiers ?? [], [tab.tiers]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // The ladder as every reader (partner sheet, review, sales order) will see it.
  const ladder = useMemo(() => activeTiers(tiers), [tiers]);

  // Authoring mistakes that silently cost the partner a discount they were promised.
  const warnings = useMemo(() => {
    const w: string[] = [];
    const byAmount = new Map<number, number>();
    for (const t of tiers) byAmount.set(t.minAmount, (byAmount.get(t.minAmount) ?? 0) + 1);
    for (const [amt, n] of byAmount) {
      if (n > 1) w.push(`Two tiers start at ${fmtMoney(amt, currency)} — only the better % will apply.`);
    }
    for (let i = 1; i < ladder.length; i++) {
      if (ladder[i].discountPct <= ladder[i - 1].discountPct) {
        w.push(
          `“${ladder[i].name || "Unnamed"}” costs more to reach than “${ladder[i - 1].name || "Unnamed"}” but doesn’t discount more — nobody gains by reaching it.`,
        );
      }
    }
    if (tiers.some((t) => !t.name.trim())) w.push("Name every tier — the partner sees the name when they reach it.");
    if (tiers.some((t) => t.discountPct <= 0)) w.push("A tier at 0% is ignored.");
    return w;
  }, [tiers, ladder, currency]);

  const update = (id: string, patch: Partial<PreorderTier>) =>
    onChange(tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  function addTier() {
    const last = ladder[ladder.length - 1];
    onChange([
      ...tiers,
      {
        id: uid(),
        name: `Tier ${tiers.length + 1}`,
        minAmount: last ? last.minAmount * 2 : 10000,
        discountPct: last ? Math.min(100, last.discountPct + 5) : 5,
      },
    ]);
    setOpen(true);
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-3 min-w-0 text-left group"
        >
          <span className="w-8 h-8 rounded-lg bg-lime-600/10 text-lime-700 dark:text-lime-300 flex items-center justify-center shrink-0">
            <Percent className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground group-hover:text-lime-700 dark:group-hover:text-lime-300 transition-colors">
              Volume discounts
              <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
            </span>
            <span className="block text-[11px] text-muted-foreground truncate">
              {ladder.length === 0
                ? "No tiers — this tab is always at list price."
                : `${ladder.length} tier${ladder.length === 1 ? "" : "s"} · best case −${ladder[ladder.length - 1].discountPct}% from ${fmtMoney(ladder[ladder.length - 1].minAmount, currency)}`}
            </span>
          </span>
        </button>
        {ladder.length > 0 && (
          <div className="hidden lg:flex flex-wrap items-center gap-1 ml-2">
            {ladder.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full bg-lime-100 dark:bg-lime-900/40 px-2 py-0.5 text-[11px] font-medium text-lime-700 dark:text-lime-300"
                title={`${t.name || "Tier"}: −${t.discountPct}% from ${fmtMoney(t.minAmount, currency)}`}
              >
                {t.name || "Tier"} −{t.discountPct}%
                <span className="text-lime-600/70 dark:text-lime-400/70 tabular-nums">
                  {fmtMoney(t.minAmount, currency)}+
                </span>
              </span>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {warnings.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400" title={warnings.join("\n")}>
            <AlertTriangle className="w-3.5 h-3.5" /> {warnings.length} note{warnings.length === 1 ? "" : "s"}
          </span>
        )}
        <Button variant="outline" size="sm" className="h-8 bg-background" onClick={addTier}>
          <Plus className="w-3.5 h-3.5" /> Add tier
        </Button>
      </div>

      {open && (
        <div className="border-t border-border px-4 py-4 space-y-3">
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
            Reach a spend inside <span className="font-medium text-foreground">{tab.name || "this tab"}</span> and every
            line in it drops by that tier&rsquo;s percentage. Tiers don&rsquo;t stack — only the highest one reached
            applies, and every tab is counted on its own. Thresholds are the totals the partner sees (incl. VAT).
          </p>

          {tiers.length === 0 ? (
            <button
              type="button"
              onClick={addTier}
              className="w-full rounded-lg border border-dashed border-border py-6 flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/30 transition-colors"
            >
              <Percent className="w-5 h-5 opacity-50" />
              <span className="text-[12px] font-medium">Add the first tier</span>
              <span className="text-[11px]">e.g. −5% once the partner spends {fmtMoney(10000, currency)} in this tab</span>
            </button>
          ) : (
            <div className="space-y-1.5">
              <div className="hidden sm:grid grid-cols-[minmax(0,320px)_150px_110px_32px] gap-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1">
                <span>Tier name</span>
                <span>Spend at least</span>
                <span>Discount</span>
                <span />
              </div>
              {tiers.map((t, i) => (
                <div key={t.id} className="grid grid-cols-[minmax(0,320px)_150px_110px_32px] gap-2 items-center">
                  <Input
                    value={t.name}
                    onChange={(e) => update(t.id, { name: e.target.value })}
                    placeholder={`Tier ${i + 1}`}
                    className="h-8 text-[12px] bg-background"
                    aria-label="Tier name"
                  />
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                      {currency}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={t.minAmount || ""}
                      onChange={(e) => update(t.id, { minAmount: Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="0"
                      className="h-8 text-[12px] bg-background pl-9 text-right tabular-nums no-spinner"
                      aria-label="Threshold"
                    />
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={t.discountPct || ""}
                      onChange={(e) =>
                        update(t.id, { discountPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })
                      }
                      placeholder="0"
                      className="h-8 text-[12px] bg-background pr-6 text-right tabular-nums no-spinner"
                      aria-label="Discount percent"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                      %
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange(tiers.filter((x) => x.id !== t.id))}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label="Remove tier"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="space-y-0.5">
              {warnings.map((w) => (
                <li key={w} className="text-[11px] text-amber-600 dark:text-amber-400">
                  {w}
                </li>
              ))}
            </ul>
          )}

          {otherTabCount > 0 && tiers.length > 0 && (
            <div className="flex items-center justify-end pt-1">
              <Button
                variant="ghost"
                size="xs"
                className="h-7 text-muted-foreground shrink-0"
                onClick={() => {
                  onApplyToAllTabs();
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                title={`Copy this ladder onto the other ${otherTabCount} tab${otherTabCount === 1 ? "" : "s"}, replacing theirs`}
              >
                {copied ? <Check className="w-3 h-3 text-lime-600" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied to all tabs" : `Copy to all ${otherTabCount + 1} tabs`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PL_NONE = "__none__";
/** A labelled control in the sheet settings toolbar: 10px caps label over the field. */
function SettingsField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0" title={hint}>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-none">{label}</span>
      {children}
    </label>
  );
}

function PricelistSelect({
  label, value, pricelists, onChange,
}: {
  label: string;
  value: string | null;
  pricelists: MkPricelist[];
  onChange: (v: string | null) => void;
}) {
  // Keep the current value selectable even if it's no longer in the MK list
  // (e.g. a renamed/removed price list) so it isn't silently dropped.
  const known = pricelists.some((p) => p.title === value);
  return (
    <Select
      value={value ?? PL_NONE}
      onValueChange={(v) => onChange(v === PL_NONE ? null : v)}
    >
      <SelectTrigger size="sm" className="h-8 w-[220px] text-[12px] bg-background [&>span]:truncate">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={PL_NONE} className="text-xs text-muted-foreground">
          {label}: auto
        </SelectItem>
        {value && !known && (
          <SelectItem value={value} className="text-xs">
            {value}
          </SelectItem>
        )}
        {pricelists.map((p) => (
          <SelectItem key={p.code} value={p.title} className="text-xs">
            {p.title}
            {p.currency ? <span className="text-muted-foreground"> · {p.currency}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Product picker: search catalogue, add the parent + all its variants as a group ──
type Hit = { code: string; name: string; image?: string | null };

// ── Variant picker for ONE group: lists the variants of the group's own product
// (missing ones get an "Add", present ones a check) and lets you browse any
// other catalogue product down to its single variants. ──
function VariantPickerDialog({
  group, rrpPricelist, partnerPricelist, onClose, onAddRows,
}: {
  group: PreorderGroup;
  rrpPricelist: string | null;
  partnerPricelist: string | null;
  onClose: () => void;
  onAddRows: (rows: RowDraft[]) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  // The product whose variants are listed — the group's own parent by default.
  const [source, setSource] = useState<{ code: string; name: string } | null>(
    group.parentCode ? { code: group.parentCode, name: group.name } : null,
  );
  const [variants, setVariants] = useState<RowDraft[] | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inGroup = useMemo(() => new Set(group.rows.map((r) => r.code).filter(Boolean)), [group.rows]);

  useEffect(() => {
    if (!source) {
      setVariants(null);
      return;
    }
    let cancelled = false;
    setLoadingVariants(true);
    setError(null);
    fetch(`/api/admin/preorder/products/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: source.code, rrpPricelist, partnerPricelist }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.group) setVariants((data.group as GroupDraft).rows);
        else setError(data.error ?? "Product not found in the catalogue.");
      })
      .catch(() => !cancelled && setError("Couldn't load the product."))
      .finally(() => !cancelled && setLoadingVariants(false));
    return () => {
      cancelled = true;
    };
  }, [source, rrpPricelist, partnerPricelist]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/preorder/products/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setResults((data.candidates ?? []).map((c: { code: string; name: string; image?: string | null }) => ({ code: c.code, name: c.name, image: c.image })));
        })
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const missing = (variants ?? []).filter((v) => !inGroup.has(v.code));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-lime-600" /> Add variants to <span className="truncate">{group.name || "this group"}</span>
          </DialogTitle>
        </DialogHeader>

        {/* search: any product, then browse into its variants */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            autoFocus={!source}
            placeholder={source ? "Or find another product…" : "Search by name, SKU or EAN…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        {q.trim().length >= 2 && (
          <div className="max-h-48 overflow-y-auto -mx-1 rounded-lg border border-border/60 bg-muted/10">
            {searching && <ProductRowsSkeleton />}
            {!searching && results.length === 0 && <div className="text-[12px] text-muted-foreground px-3 py-3">No matches.</div>}
            {results.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  setSource({ code: c.code, name: c.name });
                  setQ("");
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40"
              >
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
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">Browse variants <ChevronRight className="w-3 h-3" /></span>
              </button>
            ))}
          </div>
        )}

        {/* the variants of the chosen product */}
        {source ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-foreground truncate">{source.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{source.code}</div>
              </div>
              {variants && missing.length > 0 && (
                <Button size="xs" onClick={() => onAddRows(missing)}>
                  <Plus className="w-3 h-3" /> Add all missing ({missing.length})
                </Button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {loadingVariants && <ProductRowsSkeleton />}
              {error && <div className="text-[12px] text-destructive px-3 py-3">{error}</div>}
              {variants && variants.length === 0 && <div className="text-[12px] text-muted-foreground px-3 py-3">This product has no variants.</div>}
              {variants?.map((v) => {
                const present = inGroup.has(v.code);
                return (
                  <div key={v.code} className={cn("flex items-center gap-2 px-3 py-1.5 border-b border-border/40 last:border-b-0", present && "opacity-60")}>
                    {v.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.image} alt="" className="w-8 h-8 rounded object-cover ring-1 ring-border shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0"><Package className="w-3.5 h-3.5 text-muted-foreground" /></span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-foreground truncate">{v.variantLabel || v.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">{v.code}</div>
                    </div>
                    {v.partnerPrice != null && <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">{v.partnerPrice.toFixed(2)}</span>}
                    {present ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 w-[68px] justify-end"><Check className="w-3 h-3" /> In group</span>
                    ) : (
                      <Button size="xs" variant="outline" onClick={() => onAddRows([v])} className="w-[68px]">
                        <Plus className="w-3 h-3" /> Add
                      </Button>
                    )}
                  </div>
                );
              })}
              {variants && variants.length > 0 && missing.length === 0 && (
                <div className="text-[11px] text-muted-foreground px-3 py-2 bg-muted/20">Every variant of this product is already in the group.</div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            This group is not linked to a catalogue product — search above and browse a product&rsquo;s variants to add them here.
          </p>
        )}
        <div className="flex justify-end pt-1"><Button size="sm" variant="outline" onClick={onClose}>Done</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function ProductPickerDialog({
  rrpPricelist, partnerPricelist, onClose, onAddGroup,
}: {
  rrpPricelist: string | null;
  partnerPricelist: string | null;
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
        body: JSON.stringify({ code: h.code, rrpPricelist, partnerPricelist }),
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
          {loading && <ProductRowsSkeleton />}
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
  rrpPricelist, partnerPricelist, onClose, onAddGroups,
}: {
  rrpPricelist: string | null;
  partnerPricelist: string | null;
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
        body: JSON.stringify({ codes, rrpPricelist, partnerPricelist }),
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

// ── skeleton twins ───────────────────────────────────────────────────────────

/** Twin of the catalogue search results while a lookup is in flight. */
function ProductRowsSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
          <Skeleton className="w-8 h-8 rounded shrink-0" delay={stagger(i, 60)} />
          <div className="min-w-0 flex-1">
            <SkeletonLine lh="h-[18px]" w="w-48" delay={stagger(i, 60, 20)} />
            <SkeletonLine lh="h-[15px]" h="h-2.5" w="w-24" delay={stagger(i, 60, 40)} />
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Structural twin of the loaded builder: two-row sticky header (title input,
 * status, actions; season / deadline / price-list controls), the tab rail and
 * the editor column with its name inputs, tier card, add-actions strip and a
 * couple of collapsed group cards.
 */
function BuilderSkeleton({ campaignId }: { campaignId: string }) {
  return (
    <div className="flex flex-col h-full">
      <CampaignHeader
        campaignId={campaignId}
        active="sheet"
        title={
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-48 md:w-72 rounded-md" />
            <Skeleton className="hidden sm:block h-[20.5px] w-12 rounded-full" delay={40} />
          </div>
        }
        actions={
          <>
            <span className="min-w-[70px]" />
            <Skeleton className="h-8 w-[92px] rounded-md" delay={80} />
          </>
        }
      />
      <div className="shrink-0 border-b border-border bg-muted/30 px-4 md:px-6 py-2.5 flex flex-wrap items-end gap-x-5 gap-y-3">
        <SettingsField label="Season"><Skeleton className="h-8 w-36 rounded-md" delay={100} /></SettingsField>
        <SettingsField label="Deadline"><Skeleton className="h-8 w-44 rounded-md" delay={120} /></SettingsField>
        <div className="hidden md:block w-px h-8 bg-border" aria-hidden />
        <SettingsField label="RRP price list"><Skeleton className="h-8 w-[220px] rounded-md" delay={140} /></SettingsField>
        <SettingsField label="Partner price list"><Skeleton className="h-8 w-[220px] rounded-md" delay={160} /></SettingsField>
        <div className="flex items-center h-8">
          <Button variant="outline" size="sm" className="h-8 bg-background" disabled>
            <RefreshCw className="w-3.5 h-3.5" /> Re-price sheet
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-44 md:w-52 shrink-0 border-r border-border overflow-y-auto p-2 space-y-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-1 rounded-lg pl-1 pr-2 py-1.5">
              <span className="w-[18px] shrink-0" />
              <SkeletonLine lh="h-[19.5px]" w={["w-24", "w-20", "w-28"][i]} delay={stagger(i, 60)} />
            </div>
          ))}
          <div className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground">
            <Plus className="w-3.5 h-3.5" /> Add tab
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface px-4 py-3 flex flex-wrap items-end gap-x-5 gap-y-3">
              <SettingsField label="Tab name"><Skeleton className="h-8 w-56 rounded-md" /></SettingsField>
              <SettingsField label="Discount note"><Skeleton className="h-8 w-80 rounded-md" delay={40} /></SettingsField>
              <div className="flex-1" />
            </div>
            <div className="rounded-xl border border-border bg-surface">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="w-8 h-8 rounded-lg bg-lime-600/10 text-lime-700 dark:text-lime-300 flex items-center justify-center shrink-0">
                  <Percent className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    Volume discounts <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </span>
                  <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-48" delay={60} />
                </span>
                <div className="flex-1" />
                <Button variant="outline" size="sm" className="h-8 bg-background" disabled><Plus className="w-3.5 h-3.5" /> Add tier</Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5">
              <Button size="sm" disabled><Search className="w-3.5 h-3.5" /> Add product</Button>
              <Button variant="outline" size="sm" disabled><Upload className="w-3.5 h-3.5" /> Import SKUs</Button>
              <Button variant="ghost" size="sm" disabled className="text-muted-foreground"><Plus className="w-3.5 h-3.5" /> Blank group</Button>
            </div>
            <div className="space-y-4">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40" />
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                    <Skeleton className="h-7 w-full max-w-[280px] rounded-md" delay={stagger(i, 80, 100)} />
                    <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-16" delay={stagger(i, 80, 120)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
