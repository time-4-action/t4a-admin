"use client";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CampaignHeader } from "@/app/preorder/[campaignId]/campaign-nav";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover as PopoverPrimitive } from "radix-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Info,
  Settings2,
  Rocket,
  Eye,
  EyeOff,
  Upload,
  FileSpreadsheet,
  Download,
  RefreshCw,
  GripVertical,
  Percent,
  Copy,
  Lock,
  LockOpen,
  BadgePercent,
  Tag,
  ImagePlus,
  X,
  ClipboardPaste,
  DatabaseZap,
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
  tagLabel,
  ROW_TAG_MAX,
  type PreorderCampaign,
  type PreorderRow,
  type PreorderTab,
  type PreorderTier,
  type PreorderGroup,
  type CampaignStatus,
} from "@/types/preorder";
import { fmtMoney, FixedPricePill, FIXED_PRICE_HINT, tabFixedCount } from "@/app/preorder/preorder-shared";
import { VatModal } from "./vat-modal";
import type { VatOverride } from "@/lib/pricing";
import type { MkPricelist } from "@/types/documents";
import { smartGroup, withSmartLabels } from "@/lib/preorder-smart-group";
import { refreshTabs, type ProductRefreshInfo, type RefreshSummary } from "@/lib/preorder-refresh";
import { formatSkuEntries, parseSkuEntries, skuKey, type SkuEntry } from "@/lib/sku-entries";
import { ImageManagerDialog } from "./image-modal";
import { TagPill, TAG_COLORS, isHexColor } from "@/app/preorder/tag-pill";

type RowDraft = Omit<PreorderRow, "id" | "order">;
type GroupDraft = {
  name: string;
  parentCode?: string | null;
  description?: string | null;
  images?: string[];
  rows: RowDraft[];
};

// Big imports / sheets go to the product routes in chunks, so every request stays well
// inside the gateway timeout (each code is a catalogue / Metakocka lookup). Only the
// first chunk asks the server to reload Metakocka's product index (`freshMk`).
const IMPORT_CHUNK = 400;
const SHEET_CHUNK = 500;
async function inChunks<T, R>(
  items: T[],
  size: number,
  fn: (chunk: T[], first: boolean) => Promise<R>,
  onProgress?: (done: number) => void,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(await fn(items.slice(i, i + size), i === 0));
    onProgress?.(Math.min(items.length, i + size));
  }
  return out;
}

// Chunks may resolve the same parent product twice (a SKU in each): one group, rows united.
function mergeResolvedGroups(groups: GroupDraft[]): GroupDraft[] {
  const out: GroupDraft[] = [];
  const byParent = new Map<string, GroupDraft>();
  for (const g of groups) {
    const prev = g.parentCode ? byParent.get(g.parentCode) : undefined;
    if (!prev) {
      const copy = { ...g, rows: [...g.rows] };
      if (g.parentCode) byParent.set(g.parentCode, copy);
      out.push(copy);
      continue;
    }
    const have = new Set(prev.rows.map((r) => r.code));
    for (const r of g.rows) {
      if (have.has(r.code)) continue;
      have.add(r.code);
      prev.rows.push(r);
    }
  }
  return out;
}

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

// Spreadsheet order of an import: row code → the position of the line that brought it
// in. New rows / groups are placed by it among what the tab already holds, so the sheet
// reads as close to the imported file as possible.
type ImportOrder = Map<string, number>;
const posIn = (order: ImportOrder | undefined, code: string | null | undefined) =>
  (order && code != null ? order.get(code) : undefined) ?? Infinity;
const groupPos = (order: ImportOrder | undefined, g: { rows: { code: string }[] }) =>
  g.rows.reduce((m, r) => Math.min(m, posIn(order, r.code)), Infinity);

// Where an item at spreadsheet position `p` goes in `list`: right after the last item
// that comes before it in the file, else right before the first that comes after it,
// else at the end (items not in this import keep their place).
function insertAt<T>(list: T[], p: number, pos: (x: T) => number): number {
  if (p === Infinity) return list.length;
  let lastBefore = -1;
  let firstAfter = -1;
  list.forEach((x, i) => {
    const q = pos(x);
    if (q < p) lastBefore = i;
    else if (q !== Infinity && firstAfter === -1) firstAfter = i;
  });
  return lastBefore >= 0 ? lastBefore + 1 : firstAfter >= 0 ? firstAfter : list.length;
}

function insertRowsInOrder(rows: PreorderRow[], fresh: PreorderRow[], order?: ImportOrder): PreorderRow[] {
  const out = [...rows];
  for (const r of fresh) out.splice(insertAt(out, posIn(order, r.code), (x) => posIn(order, x.code)), 0, r);
  return out.map((r, i) => (r.order === i ? r : { ...r, order: i }));
}

function insertGroupsInOrder(groups: PreorderGroup[], fresh: PreorderGroup[], order?: ImportOrder): PreorderGroup[] {
  const out = [...groups];
  for (const g of fresh) out.splice(insertAt(out, groupPos(order, g), (x) => groupPos(order, x)), 0, g);
  return out.map((g, i) => (g.order === i ? g : { ...g, order: i }));
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTabId, setDeleteTabId] = useState<string | null>(null); // confirm before a tab goes
  const [vatOpen, setVatOpen] = useState(false);
  // Campaign-level VAT overrides + the countries its markets mention (the VAT modal
  // lists those first). Saved by the modal itself, never by the autosave.
  const [vatOverrides, setVatOverrides] = useState<VatOverride[]>([]);
  const [marketCountries, setMarketCountries] = useState<string[]>([]);
  const [csvTab, setCsvTab] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pricelists, setPricelists] = useState<MkPricelist[]>([]);
  const [repricing, setRepricing] = useState(false);
  const [repricedAt, setRepricedAt] = useState<number | null>(null);
  // Codes on the sheet that Metakocka doesn't have (found by the last re-price).
  const [notInMk, setNotInMk] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSummary, setRefreshSummary] = useState<RefreshSummary | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);

  // Rows with a price gap: no partner price (everyone orders at it — the sheet falls
  // back to the RRP) / no RRP (the reference column stays empty). Per tab for the summary.
  const unpriced = useMemo(() => {
    const rrp: string[] = [];
    const partner: string[] = [];
    const rrpTabs = new Set<string>();
    const partnerTabs = new Set<string>();
    for (const t of campaign?.tabs ?? [])
      for (const g of t.groups)
        for (const r of g.rows) {
          if (r.rrp == null) {
            rrp.push(r.code);
            rrpTabs.add(t.name || "Untitled");
          }
          if (r.partnerPrice == null && r.discountedPrice == null) {
            partner.push(r.code);
            partnerTabs.add(t.name || "Untitled");
          }
        }
    return { rrp, partner, rrpTabs: Array.from(rrpTabs), partnerTabs: Array.from(partnerTabs) };
  }, [campaign]);

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
        // Sheets built before smart labels carry the full variant name as its label —
        // shorten those once (typed labels are kept) and let the autosave store it.
        const loaded = data.campaign as PreorderCampaign;
        let relabelled = false;
        const tabs = loaded.tabs.map((t) => ({
          ...t,
          groups: t.groups.map((g) => {
            const rows = withSmartLabels(g.rows);
            if (rows === g.rows) return g;
            relabelled = true;
            return { ...g, rows };
          }),
        }));
        setCampaign(relabelled ? { ...loaded, tabs } : loaded);
        if (relabelled) setDirty(true);
        setActiveTabId(data.campaign.tabs[0]?.id ?? null);
        setVatOverrides(data.campaign.vatOverrides ?? []);
        setMarketCountries(((data.campaign.markets ?? []) as { countries?: string[] }[]).flatMap((m) => m.countries ?? []));
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

  // Tag colours belong to the tag text: one colour per label across the whole campaign.
  const tagColors = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of campaign?.tabs ?? [])
      for (const g of t.groups)
        for (const r of g.rows) {
          const k = tagLabel(r.tag)?.toUpperCase();
          if (k && r.tagColor && !m.has(k)) m.set(k, r.tagColor);
        }
    return m;
  }, [campaign]);
  const setTagColor = useCallback(
    (tag: string, color: string | null) => {
      const k = tagLabel(tag)?.toUpperCase();
      if (!k) return;
      mutate((c) => ({
        ...c,
        tabs: c.tabs.map((t) => ({
          ...t,
          groups: t.groups.map((g) => ({
            ...g,
            rows: g.rows.map((r) => (tagLabel(r.tag)?.toUpperCase() === k ? { ...r, tagColor: color } : r)),
          })),
        })),
      }));
    },
    [mutate],
  );
  const tagCtx = useMemo(() => ({ colors: tagColors, setColor: setTagColor }), [tagColors, setTagColor]);

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
  function addGroups(tabId: string, drafts: GroupDraft[], order?: ImportOrder) {
    if (drafts.length === 0) return;
    mutateTab(tabId, (t) => ({ ...t, groups: insertGroupsInOrder(t.groups, drafts.map(materializeGroup), order) }));
  }
  // Import with smart grouping: single-SKU products sharing a base name become one group,
  // and a group whose name is already on the tab takes the rows instead of a duplicate.
  function addGroupsSmart(tabId: string, drafts: GroupDraft[], order?: ImportOrder) {
    if (drafts.length === 0) return;
    mutateTab(tabId, (t) => {
      // Existing groups answer by name AND by their variants' family, so a lone
      // Metakocka-only size ("… 80 % 490") lands in "… 80%" already on the tab.
      const merged = smartGroup(drafts, t.groups);
      let groups = [...t.groups];
      const fresh: PreorderGroup[] = [];
      for (const d of merged) {
        const i = groups.findIndex((g) => g.name.trim().toLowerCase() === d.name.trim().toLowerCase());
        if (i === -1) {
          // A merge appends joined sizes at the end — put the group back in file order.
          const rows = d.rows.map((r, j) => ({ r, j })).sort((x, y) => posIn(order, x.r.code) - posIn(order, y.r.code) || x.j - y.j);
          fresh.push(materializeGroup({ ...d, rows: rows.map((x) => x.r) }));
          continue;
        }
        const g = groups[i];
        const have = new Set(g.rows.map((r) => r.code));
        const rows = d.rows.filter((r) => !r.code || !have.has(r.code)).map((r) => ({ ...r, id: uid(), order: 0 }));
        groups[i] = { ...g, rows: insertRowsInOrder(g.rows, rows, order) };
      }
      groups = insertGroupsInOrder(groups, fresh, order);
      return { ...t, groups };
    });
  }
  // SKU import into a tab. A code already on the tab is not added again: its existing
  // row takes what the import says (tag + fixed price as imported — no tag clears it —
  // and any price the file carries); everything else is added as new rows.
  function importIntoTab(
    tabId: string,
    drafts: GroupDraft[],
    smart: boolean,
    patches: Map<string, Partial<PreorderRow>>,
    order: ImportOrder,
  ) {
    const tab = campaign?.tabs.find((t) => t.id === tabId);
    const existing = new Set(tab?.groups.flatMap((g) => g.rows.map((r) => r.code)).filter(Boolean) ?? []);
    const fresh = drafts
      .map((g) => ({ ...g, rows: g.rows.filter((r) => !r.code || !existing.has(r.code)) }))
      .filter((g) => g.rows.length > 0);
    if (patches.size > 0 && existing.size > 0) {
      mutateTab(tabId, (t) => ({
        ...t,
        groups: t.groups.map((g) =>
          g.rows.some((r) => patches.has(r.code))
            ? { ...g, rows: g.rows.map((r) => (patches.has(r.code) ? { ...r, ...patches.get(r.code) } : r)) }
            : g,
        ),
      }));
    }
    if (smart) addGroupsSmart(tabId, fresh, order);
    else addGroups(tabId, fresh, order);
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
      type Prices = Record<
        string,
        { rrp: number | null; partnerPrice: number | null; taxCode?: string | null; ean?: string | null; name?: string; inMk?: boolean }
      >;
      const parts = await inChunks(Array.from(codes), SHEET_CHUNK, async (chunk) => {
        const res = await fetch(`/api/admin/preorder/products/reprice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codes: chunk,
            rrpPricelist: campaign.rrpPricelist ?? null,
            partnerPricelist: campaign.partnerPricelist ?? null,
          }),
        });
        const data = (await res.json().catch(() => null)) as { prices?: Prices; error?: string } | null;
        if (!res.ok || !data) throw new Error(data?.error ?? `Re-pricing failed (${res.status}).`);
        return data.prices ?? {};
      });
      const prices: Prices = Object.assign({}, ...parts);
      setNotInMk(Object.entries(prices).filter(([, p]) => p.inMk === false).map(([code]) => code));
      mutate((c) => ({
        ...c,
        tabs: c.tabs.map((t) => ({
          ...t,
          groups: t.groups.map((g) => ({
            ...g,
            rows: g.rows.map((row) => {
              if (row.source !== "catalogue") return row;
              const p = prices[row.code];
              if (!p) return row;
              // Metakocka is the source of truth for name + EAN (absent = MK unreadable).
              return {
                ...row,
                rrp: p.rrp,
                partnerPrice: p.partnerPrice,
                taxCode: p.taxCode ?? row.taxCode ?? null,
                ...(p.name ? { name: p.name } : {}),
                ...(p.ean !== undefined ? { ean: p.ean } : {}),
              };
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

  // "Refresh products": a migration of the rows already on the sheet — SKU, name, EAN
  // from Metakocka, images from the catalogue, automatic labels and smart grouping.
  // Prices, tags and every other row setting stay as they are (lib/preorder-refresh.ts).
  const refreshProducts = useCallback(async () => {
    if (!campaign) return;
    const rows: { code: string; ean: string | null }[] = [];
    for (const t of campaign.tabs)
      for (const g of t.groups)
        for (const r of g.rows) if (r.source === "catalogue" && r.code) rows.push({ code: r.code, ean: r.ean ?? null });
    if (rows.length === 0) return;
    setRefreshing(true);
    setError(null);
    try {
      const parts = await inChunks(rows, SHEET_CHUNK, async (chunk, first) => {
        const res = await fetch(`/api/admin/preorder/products/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk, freshMk: first }),
        });
        const data = (await res.json().catch(() => null)) as { info?: Record<string, ProductRefreshInfo>; notInMk?: string[]; error?: string } | null;
        if (!res.ok || !data?.info) throw new Error(data?.error ?? `Refresh failed (${res.status}).`);
        return { info: data.info, notInMk: data.notInMk ?? [] };
      });
      const info: Record<string, ProductRefreshInfo> = Object.assign({}, ...parts.map((p) => p.info));
      const { tabs, summary } = refreshTabs(campaign.tabs, info, parts.flatMap((p) => p.notInMk));
      mutate((c) => ({ ...c, tabs }));
      setNotInMk(summary.notInMk);
      setRefreshSummary(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [campaign, mutate]);

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
    <TagColorsContext.Provider value={tagCtx}>
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
        beforeActions={
            <span
              className={cn("text-[11px] text-muted-foreground inline-flex items-center gap-1 justify-end", !saving && !dirty && !savedAt && "hidden")}
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
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="h-8" title="Season, deadline">
              <Settings2 className="w-3.5 h-3.5" /> Settings
            </Button>
            {campaign.status === "open" ? (
              <Button variant="outline" size="sm" onClick={() => save("draft")} disabled={saving} className="h-8"><EyeOff className="w-3.5 h-3.5" /> Unpublish</Button>
            ) : (
              <Button size="sm" onClick={() => save("open")} disabled={saving} className="h-8"><Rocket className="w-3.5 h-3.5" /> Publish</Button>
            )}
          </>
        }
      />
      {/* Campaign-wide: where the RRP / Partner numbers on EVERY tab come from, and how
          VAT applies. Sits above the tab rail on purpose — not a property of the selected tab. */}
      <div className="shrink-0 border-b border-border bg-muted/30 px-4 md:px-6 py-2.5">
        {/* Text + one control group. The group wraps as a UNIT under the text on
            narrow screens (never one select floating right with the rest below). */}
        <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-center 2xl:gap-4">
          <div className="min-w-0 2xl:flex-1">
            <div className="text-[13px] font-semibold text-foreground">Pricing &amp; VAT</div>
            <div className="text-[11px] text-muted-foreground">
              RRP (incl. VAT) and partner price (excl. VAT) on every tab come from these two Metakocka lists. Companies pay the partner price at 0% VAT; individuals pay the RRP with their country&rsquo;s VAT inside it.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
          <InlineField label="RRP" hint="Recommended retail price list (incl. VAT) — what individuals pay; shown to companies for reference">
            <PricelistSelect
              label="RRP list"
              value={campaign.rrpPricelist ?? null}
              pricelists={pricelists}
              onChange={(v) => mutate((c) => ({ ...c, rrpPricelist: v }))}
              className={inlineSelect}
            />
          </InlineField>
          <InlineField label="Partner" hint="The price list the sheet's partner prices come from (excl. VAT) — what companies pay, zero-rated">
            <PricelistSelect
              label="Partner list"
              value={campaign.partnerPricelist ?? null}
              pricelists={pricelists}
              onChange={(v) => mutate((c) => ({ ...c, partnerPricelist: v }))}
              className={inlineSelect}
            />
          </InlineField>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-background"
            onClick={reprice}
            disabled={repricing}
            title="Re-read both lists from Metakocka and refresh every catalogue row on every tab"
          >
            {repricing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {repricedAt && !repricing ? "Repriced ✓" : "Re-price all tabs"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-background"
            onClick={refreshProducts}
            disabled={refreshing}
            title="Bring every catalogue row back to Metakocka (SKU, name, EAN) and the catalogue (images), re-derive labels and merge product families. Prices, tags and row settings are not touched."
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseZap className="w-3.5 h-3.5" />}
            Refresh products
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-background"
            onClick={() => setVatOpen(true)}
            title="Per-country VAT rates: inherit the global table or override a country for this campaign"
          >
            <Percent className="w-3.5 h-3.5" />
            VAT rates
            {vatOverrides.length > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300 px-1.5 text-[10px] font-semibold tabular-nums">
                {vatOverrides.length} override{vatOverrides.length === 1 ? "" : "s"}
              </span>
            )}
          </Button>
          </div>
        </div>
      </div>
      <VatModal open={vatOpen} onOpenChange={setVatOpen} campaignId={campaignId} overrides={vatOverrides} marketCountries={marketCountries} onSaved={setVatOverrides} />
      {(unpriced.rrp.length > 0 || unpriced.partner.length > 0) && (
        <div className="shrink-0 border-b border-amber-300/60 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/30 px-4 md:px-6 py-2 text-[12px] text-amber-800 dark:text-amber-300 flex flex-wrap items-center gap-x-4 gap-y-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {unpriced.rrp.length > 0 && (
            <span>
              <span className="font-semibold">{unpriced.rrp.length} product{unpriced.rrp.length === 1 ? "" : "s"} without an RRP</span> — no reference retail price shown
              {unpriced.rrpTabs.length > 0 && <span className="text-amber-700/80 dark:text-amber-300/70"> ({unpriced.rrpTabs.join(", ")})</span>}
            </span>
          )}
          {unpriced.partner.length > 0 && (
            <span>
              <span className="font-semibold">{unpriced.partner.length} without a partner price</span> — customers would be charged the RRP instead
              {unpriced.partnerTabs.length > 0 && <span className="text-amber-700/80 dark:text-amber-300/70"> ({unpriced.partnerTabs.join(", ")})</span>}
            </span>
          )}
          <span className="text-amber-700/80 dark:text-amber-300/70">Highlighted cells below · Re-price reads the lists again.</span>
        </div>
      )}

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
              {/* The tab reads like a document: an editable title, a subtitle partners
                  see, then the discount ladder as one line. No card around it. */}
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-1">
                <div className="min-w-0 flex-1 flex flex-col">
                  <div className="-ml-2 max-w-[560px]">
                    <input
                      value={activeTab.name}
                      onChange={(e) => mutateTab(activeTab.id, (t) => ({ ...t, name: e.target.value }))}
                      className="block h-10 w-full rounded-md border border-transparent bg-transparent px-2 font-display text-[22px] font-semibold tracking-tight text-foreground hover:border-border focus:border-ring focus:bg-background focus:outline-none placeholder:text-muted-foreground/50"
                      placeholder="Tab name"
                      aria-label="Tab name"
                    />
                  </div>
                  <div className="-ml-2 mt-0.5 max-w-[640px]">
                    <input
                      value={activeTab.discountNote ?? ""}
                      onChange={(e) => mutateTab(activeTab.id, (t) => ({ ...t, discountNote: e.target.value }))}
                      className="block h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] text-muted-foreground hover:border-border focus:border-ring focus:bg-background focus:text-foreground focus:outline-none placeholder:text-muted-foreground/50"
                      placeholder="Note partners see under this tab — e.g. free shipping over €5,000"
                      aria-label="Note to partners"
                    />
                  </div>
                </div>
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
                <Button variant="ghost" size="sm" onClick={() => setDeleteTabId(activeTab.id)} className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
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
                    // Locked tabs keep their own ladder.
                    tabs: c.tabs.map((t) =>
                      t.id === activeTab.id || t.tiersLocked
                        ? t
                        : { ...t, tiers: (activeTab.tiers ?? []).map((x) => ({ ...x, id: uid() })) },
                    ),
                  }))
                }
                onToggleLock={() => mutateTab(activeTab.id, (t) => ({ ...t, tiersLocked: !t.tiersLocked }))}
                fixedCount={tabFixedCount(activeTab)}
                otherTabs={campaign.tabs.filter((t) => t.id !== activeTab.id).map((t) => ({ name: t.name, locked: !!t.tiersLocked, tiers: (t.tiers ?? []).length }))}
              />

              {/* Products on this tab: the sheet itself starts here. */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                <span className="text-[13px] font-semibold text-foreground mr-1">Products</span>
                <span className="text-[12px] text-muted-foreground tabular-nums mr-2">
                  {activeTab.groups.length} product{activeTab.groups.length === 1 ? "" : "s"} · {activeTab.groups.reduce((n, g) => n + g.rows.length, 0)} variants
                </span>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => addBlankGroup(activeTab.id)} className="h-8 text-muted-foreground">
                  <Plus className="w-3.5 h-3.5" /> Blank group
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCsvTab(activeTab.id)} className="h-8">
                  <Upload className="w-3.5 h-3.5" /> Import SKUs
                </Button>
                <Button size="sm" onClick={() => setPicker({ tabId: activeTab.id })} className="h-8">
                  <Search className="w-3.5 h-3.5" /> Add product
                </Button>
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
                        onSetImages={(images) => mutateGroup(activeTab.id, g.id, (gr) => ({ ...gr, images }))}
                        onDeleteGroup={() => deleteGroup(activeTab.id, g.id)}
                        onAddRow={() => addManualRow(activeTab.id, g.id)}
                        onAddFromCatalogue={() => setPicker({ tabId: activeTab.id, groupId: g.id })}
                        pricing={{ rrp: campaign.rrpPricelist ?? null, partner: campaign.partnerPricelist ?? null, currency: campaign.currency }}
                        onUpdateRow={(rowId, patch) => updateRow(activeTab.id, g.id, rowId, patch)}
                        onDeleteRow={(rowId) => deleteRow(activeTab.id, g.id, rowId)}
                        onReorderRows={(a, o) => reorderRows(activeTab.id, g.id, a, o)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {activeTab.groups.length === 0 && (
                <div className="rounded-xl border border-dashed border-border py-14 text-center">
                  <FileSpreadsheet className="w-6 h-6 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-[13px] font-medium text-foreground">This tab has no products yet</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">Add a product from the catalogue and it arrives with all its variants — remove the ones you don&rsquo;t sell.</p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button size="sm" onClick={() => setPicker({ tabId: activeTab.id })}><Search className="w-3.5 h-3.5" /> Add product</Button>
                    <Button variant="outline" size="sm" onClick={() => setCsvTab(activeTab.id)}><Upload className="w-3.5 h-3.5" /> Import SKUs</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {refreshSummary && (
        <div className="fixed bottom-4 right-4 z-30 max-w-sm rounded-lg border border-lime-500/30 bg-lime-50 dark:bg-lime-950/60 px-3 py-2 text-[12px] text-lime-900 dark:text-lime-100 shadow">
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium">Products refreshed from Metakocka</span>
            <button type="button" onClick={() => setRefreshSummary(null)} className="opacity-60 hover:opacity-100">×</button>
          </div>
          <div className="mt-1 tabular-nums">
            {refreshSummary.skus} SKUs · {refreshSummary.names} names · {refreshSummary.eans} EANs · {refreshSummary.images} images ·{" "}
            {refreshSummary.labels} labels · {refreshSummary.merged} groups merged
          </div>
        </div>
      )}
      {notInMk.length > 0 && (
        <div className="fixed bottom-4 left-4 z-30 max-w-md rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/60 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200 shadow">
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium">
              {notInMk.length} SKU{notInMk.length === 1 ? " is" : "s are"} not in Metakocka — remove {notInMk.length === 1 ? "it" : "them"} from the sheet:
            </span>
            <button type="button" onClick={() => setNotInMk([])} className="text-amber-700/70 hover:text-amber-900 dark:hover:text-amber-100">×</button>
          </div>
          <div className="mt-1 font-mono break-words">{notInMk.join(", ")}</div>
        </div>
      )}

      {error && campaign && (
        <div className="fixed bottom-4 right-4 z-30 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive shadow">{error}</div>
      )}

      {deleteTabId && (() => {
        const t = campaign.tabs.find((x) => x.id === deleteTabId);
        const rows = t ? t.groups.reduce((n, g) => n + g.rows.length, 0) : 0;
        return (
          <Dialog open onOpenChange={(o) => !o && setDeleteTabId(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Delete tab “{t?.name || "Untitled"}”?</DialogTitle>
                <DialogDescription>
                  {rows > 0
                    ? `Its ${t?.groups.length ?? 0} group${(t?.groups.length ?? 0) === 1 ? "" : "s"} and ${rows} product${rows === 1 ? "" : "s"} go with it, and quantities customers already saved for them are dropped.`
                    : "The tab is empty."}{" "}
                  This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setDeleteTabId(null)}>Keep tab</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    deleteTab(deleteTabId);
                    setDeleteTabId(null);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete tab
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {settingsOpen && (
        <Dialog open onOpenChange={(o) => !o && setSettingsOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-lime-600" /> Campaign settings</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-medium text-foreground">Season</label>
                <Input
                  value={campaign.season ?? ""}
                  onChange={(e) => mutate((c) => ({ ...c, season: e.target.value }))}
                  className="mt-1.5 h-9 text-[13px]"
                  placeholder="e.g. 2026"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">A label for your team — shown in the campaign list.</p>
              </div>
              <div>
                <label className="text-[12px] font-medium text-foreground">Deadline</label>
                <div className="mt-1.5">
                  <DatePicker
                    value={campaign.deadline ?? null}
                    withTime
                    placeholder="No deadline"
                    onChange={(iso) => mutate((c) => ({ ...c, deadline: iso }))}
                    triggerClassName="h-9 text-[13px]"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Shown to customers on their preorder page. Display only — it does not lock the sheet.</p>
              </div>
            </div>
            <div className="flex justify-end pt-1"><Button size="sm" onClick={() => setSettingsOpen(false)}>Done</Button></div>
          </DialogContent>
        </Dialog>
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
          tabName={campaign.tabs.find((t) => t.id === csvTab)?.name ?? null}
          currency={campaign.currency}
          rrpPricelist={campaign.rrpPricelist ?? null}
          partnerPricelist={campaign.partnerPricelist ?? null}
          onClose={() => setCsvTab(null)}
          existingCodes={new Set(campaign.tabs.find((t) => t.id === csvTab)?.groups.flatMap((g) => g.rows.map((r) => r.code)) ?? [])}
          onAddGroups={(gs, smart, patches, order) => importIntoTab(csvTab, gs, smart, patches, order)}
        />
      )}
    </div>
    </TagColorsContext.Provider>
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
function PriceInput({ value, onCommit, placeholder = "—", warn }: { value?: number | null; onCommit: (n: number | null) => void; placeholder?: string; warn?: string }) {
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
        warn && value == null && "border-amber-400/70 bg-amber-50/60 dark:bg-amber-950/20 placeholder:text-amber-600/70",
      )}
      title={warn && value == null ? warn : undefined}
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

// A thumbnail that opens the image manager: the row's image, or a group's cover.
// Empty = a dashed "add image" tile, so rows / groups without a picture stand out.
function ImageThumb({
  images, fallback, multiple, title, onChange, size = "sm",
}: {
  images: string[];
  /** Shown faded when there is no image of its own (a variant falls back to the group cover). */
  fallback?: string | null;
  multiple: boolean;
  title: string;
  onChange: (images: string[]) => void;
  size?: "sm" | "md";
}) {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [open, setOpen] = useState(false);
  const box = size === "md" ? "w-9 h-9" : "w-8 h-8";
  const cover = images[0];
  const shown = cover ?? fallback ?? null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          box,
          "relative rounded-md shrink-0 overflow-hidden transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          cover
            ? "ring-1 ring-border hover:ring-2 hover:ring-lime-500"
            : shown
              ? "border border-dashed border-border hover:ring-2 hover:ring-lime-500"
              : "flex items-center justify-center border border-dashed border-border bg-muted/40 text-muted-foreground hover:border-lime-500 hover:text-lime-600 hover:bg-lime-500/10",
        )}
        title={cover ? (multiple ? "Group images" : "Change image") : shown ? "Using the group cover — click to give this variant its own image" : "Add an image"}
        aria-label={cover ? (multiple ? "Group images" : "Change image") : "Add an image"}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className={cn("w-full h-full object-cover", !cover && "opacity-50")} />
        ) : (
          <ImagePlus className="w-3.5 h-3.5" />
        )}
        {multiple && images.length > 1 && (
          <span className="absolute bottom-0 right-0 rounded-tl bg-black/65 text-white text-[9px] font-semibold leading-none px-1 py-0.5 tabular-nums">
            {images.length}
          </span>
        )}
      </button>
      {open && (
        <ImageManagerDialog
          open={open}
          onOpenChange={setOpen}
          title={title}
          images={images}
          multiple={multiple}
          campaignId={campaignId ?? "misc"}
          onChange={onChange}
        />
      )}
    </>
  );
}

// The row's tag pill. Click it (or the tag button that shows on row hover) to open a
// small editor: type any label or pick a suggestion, pick a colour; Save / Enter
// applies, Remove clears. A colour is the tag's, not the row's — changing it recolours
// every row carrying that tag, and a row given an existing tag takes its colour.
const TAG_SUGGESTIONS = ["NEW", "PRE", "SALE", "LIMITED", "BESTSELLER", "LAST PIECES"];

type TagColorsCtx = { colors: Map<string, string>; setColor: (tag: string, color: string | null) => void };
const TagColorsContext = createContext<TagColorsCtx>({ colors: new Map(), setColor: () => {} });

function TagEditor({
  tag, color, onChange,
}: {
  tag: string | null;
  color: string | null;
  onChange: (patch: { tag: string | null; tagColor: string | null }) => void;
}) {
  const { colors, setColor } = useContext(TagColorsContext);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const label = tagLabel(tag);
  const typed = text.trim().slice(0, ROW_TAG_MAX);
  const typedKey = tagLabel(typed)?.toUpperCase() ?? "";

  function apply(value: string, chosen: string | null) {
    const t = value.trim().slice(0, ROW_TAG_MAX);
    if (!t) {
      if (tag !== null) onChange({ tag: null, tagColor: null });
      setOpen(false);
      return;
    }
    // Keep the stored legacy value when its displayed label was left untouched.
    const next = t.toUpperCase() === label?.toUpperCase() ? tag! : t;
    const known = colors.get(tagLabel(next)!.toUpperCase()) ?? null;
    if (chosen !== known) setColor(next, chosen); // recolours every row with this tag
    if (next !== tag || chosen !== color) onChange({ tag: next, tagColor: chosen });
    setOpen(false);
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setText(label ?? "");
          setPick(color);
        }
        setOpen(o);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        {label ? (
          <button type="button" className="shrink-0 rounded-md hover:ring-2 hover:ring-lime-500/60 hover:ring-offset-1" title="Edit tag">
            <TagPill tag={tag} color={color} size="md" />
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted",
              open ? "opacity-100 text-foreground bg-muted" : "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
            )}
            aria-label="Add tag"
            title="Add a tag (e.g. NEW, SALE)"
          >
            <Tag className="w-3 h-3" />
          </button>
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 w-80 rounded-xl border border-border bg-popover p-3.5 shadow-lg outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector("input")?.select();
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply(text, pick);
            }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-2 min-h-7">
              <label htmlFor="row-tag-input" className="text-[12px] font-medium text-foreground">Tag</label>
              {typed && <TagPill tag={typed} color={pick} size="lg" />}
            </div>
            <Input
              id="row-tag-input"
              value={text}
              maxLength={ROW_TAG_MAX}
              placeholder="e.g. NEW, SALE, Last pieces"
              onChange={(e) => {
                setText(e.target.value);
                // An existing tag brings its colour along.
                const k = tagLabel(e.target.value.trim())?.toUpperCase();
                if (k && colors.has(k)) setPick(colors.get(k)!);
              }}
              className="h-9 text-[13px]"
            />
            <div className="flex flex-wrap gap-1.5">
              {TAG_SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => {
                    setText(sug);
                    setPick(colors.get(sug) ?? pick);
                  }}
                  className={cn(
                    "h-6 rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                    typedKey === sug
                      ? "border-lime-500 bg-lime-500/10 text-lime-700 dark:text-lime-300"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                  )}
                >
                  {sug}
                </button>
              ))}
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1.5">Colour</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPick(null)}
                  title="Default"
                  aria-label="Default colour"
                  className={cn(
                    "size-6 rounded-full bg-lime-100 border border-lime-300 dark:bg-lime-900/60 ring-offset-2 ring-offset-popover transition-shadow",
                    pick == null ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border",
                  )}
                />
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPick(c)}
                    title={c}
                    aria-label={`Colour ${c}`}
                    style={{ backgroundColor: c }}
                    className={cn(
                      "size-6 rounded-full ring-offset-2 ring-offset-popover transition-shadow",
                      pick?.toLowerCase() === c ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border",
                    )}
                  />
                ))}
                <label
                  title="Custom colour"
                  className={cn(
                    "relative size-6 rounded-full overflow-hidden cursor-pointer ring-offset-2 ring-offset-popover",
                    "bg-[conic-gradient(#ef4444,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#ef4444)]",
                    pick && !TAG_COLORS.includes(pick.toLowerCase()) ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border",
                  )}
                >
                  <input
                    type="color"
                    value={isHexColor(pick) ? pick : "#65a30d"}
                    onChange={(e) => setPick(e.target.value.toLowerCase())}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    aria-label="Custom colour"
                  />
                </label>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Applies to every row tagged {typed ? <span className="font-semibold uppercase">{tagLabel(typed)}</span> : "with this tag"}.
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              {label ? (
                <button type="button" onClick={() => apply("", null)} className="text-[12px] text-muted-foreground hover:text-destructive">
                  Remove tag
                </button>
              ) : (
                <span />
              )}
              <Button type="submit" size="sm" className="h-7 text-[12px]">Save</Button>
            </div>
          </form>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

const RowEditor = memo(function RowEditor({
  row, cover, onChange, onDelete,
}: {
  row: PreorderRow;
  cover: string | null;
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
          <ImageThumb
            images={row.image ? [row.image] : []}
            fallback={cover}
            multiple={false}
            title={`Image · ${row.name || row.code || "variant"}`}
            onChange={(imgs) => onChange({ image: imgs[0] ?? null })}
          />
          <input className={cn(inp, "font-medium")} value={row.name} placeholder="Variant name" onChange={(e) => onChange({ name: e.target.value })} />
          <TagEditor tag={row.tag ?? null} color={row.tagColor ?? null} onChange={(patch) => onChange(patch)} />
          {row.fixedPrice && (
            <button type="button" onClick={() => onChange({ fixedPrice: false })} title="Fixed price: no volume discount on this variant — click to allow discounts again" className="shrink-0">
              <FixedPricePill />
            </button>
          )}
        </div>
      </td>
      <td className={cell}><input className={cn(inp, "font-mono text-[11.5px] text-muted-foreground focus:text-foreground")} value={row.code} placeholder="SKU" onChange={(e) => onChange({ code: e.target.value })} /></td>
      <td className={cell}><input className={cn(inp, "font-mono text-[11.5px] text-muted-foreground focus:text-foreground")} value={row.ean ?? ""} placeholder="—" inputMode="numeric" onChange={(e) => onChange({ ean: e.target.value.trim() || null })} /></td>
      <td className={cell}><input className={inp} value={row.variantLabel ?? row.size ?? ""} placeholder="size / label" onChange={(e) => onChange({ variantLabel: e.target.value || null })} /></td>
      <td className={cn(cell, "border-l border-l-border/40")}><PriceInput value={row.rrp} onCommit={(n) => onChange({ rrp: n })} warn="No RRP — hidden from individuals until priced" /></td>
      <td className={cell}><PriceInput value={row.partnerPrice} onCommit={(n) => onChange({ partnerPrice: n })} warn="No partner price — companies would pay the RRP" /></td>
      <td className={cell}><PriceInput value={row.discountedPrice} onCommit={(n) => onChange({ discountedPrice: n })} /></td>
      {/* actions */}
      <td className={cn(cell, "pr-2 whitespace-nowrap")}>
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={() => onChange({ fixedPrice: !row.fixedPrice })}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              row.fixedPrice
                ? "text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/70"
                : "text-muted-foreground/40 hover:text-foreground hover:bg-muted opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
            )}
            aria-pressed={!!row.fixedPrice}
            aria-label={row.fixedPrice ? "Fixed price — excluded from volume discounts" : "Gets volume discounts"}
            title={
              row.fixedPrice
                ? "Fixed price: volume discounts never apply to this variant (it still counts towards the thresholds). Click to allow discounts."
                : "Gets volume discounts — click to make it a fixed price (never discounted)"
            }
          >
            {row.fixedPrice ? <Lock className="w-3.5 h-3.5" /> : <BadgePercent className="w-3.5 h-3.5" />}
          </button>
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
  group, collapsed, sensors, onToggleCollapse, onRenameGroup, onSetImages, onDeleteGroup, onAddRow, onAddFromCatalogue, onUpdateRow, onDeleteRow, onReorderRows, pricing,
}: {
  group: PreorderGroup;
  collapsed: boolean;
  sensors: ReturnType<typeof useSensors>;
  onToggleCollapse: () => void;
  onRenameGroup: (name: string) => void;
  onSetImages: (images: string[]) => void;
  onDeleteGroup: () => void;
  onAddRow: () => void;
  onAddFromCatalogue: () => void;
  onUpdateRow: (rowId: string, patch: Partial<PreorderRow>) => void;
  onDeleteRow: (rowId: string) => void;
  onReorderRows: (activeId: string, overId: string) => void;
  pricing: PricingLabels;
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
      <div className={cn("group/g flex items-center gap-1.5 pl-2 pr-3 py-2", !collapsed && "border-b border-border")}>
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
        {/* Same column + size as the variant thumbnails below (grip w-5 + gap = the row's handle cell). */}
        <ImageThumb
          images={group.images ?? []}
          multiple
          title={`Images · ${group.name || "group"}`}
          onChange={onSetImages}
        />
        <input
          value={group.name}
          onChange={(e) => onRenameGroup(e.target.value)}
          className="ml-0.5 h-8 w-full max-w-[360px] rounded-md border border-transparent bg-transparent px-2 text-[14px] font-semibold text-foreground hover:border-border focus:border-ring focus:bg-background focus:outline-none placeholder:text-muted-foreground/50"
          placeholder="Group name"
          aria-label="Group name"
        />
        <span className="text-[12px] text-muted-foreground tabular-nums shrink-0">
          {group.rows.length} variant{group.rows.length === 1 ? "" : "s"}
        </span>
        {group.rows.length > 0 && (() => {
          const fixed = group.rows.filter((r) => r.fixedPrice).length;
          const all = fixed === group.rows.length;
          return (
            <button
              type="button"
              onClick={() => group.rows.forEach((r) => onUpdateRow(r.id, { fixedPrice: !all }))}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] shrink-0 transition-colors",
                fixed > 0
                  ? "text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover/g:opacity-100 focus-visible:opacity-100",
              )}
              title={
                all
                  ? "Every variant is a fixed price (no volume discount) — click to allow discounts on all of them"
                  : `${FIXED_PRICE_HINT.replace("this product", "these variants")} Click to make every variant of this group a fixed price.`
              }
            >
              {fixed > 0 ? <Lock className="w-3 h-3" /> : <BadgePercent className="w-3 h-3" />}
              {all ? "Fixed price" : fixed > 0 ? `Fixed price · ${fixed}/${group.rows.length}` : "Make fixed price"}
            </button>
          );
        })()}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-7 items-center gap-1 rounded-md px-2 hover:bg-muted text-[12px] text-muted-foreground hover:text-foreground shrink-0"
          aria-label={collapsed ? "Expand group" : "Collapse group"}
          title={collapsed ? "Show variants" : "Hide variants"}
        >
          {collapsed ? <><ChevronRight className="w-3.5 h-3.5" /> Show variants</> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
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
          cover={group.images?.[0] ?? null}
          pricing={pricing}
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
type PricingLabels = { rrp: string | null; partner: string | null; currency: string };

const VariantTable = memo(function VariantTable({
  rows, cover, pricing, sensors, onReorderRows, onUpdateRow, onDeleteRow,
}: {
  rows: PreorderRow[];
  cover: string | null;
  pricing: PricingLabels;
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
            <col className="w-[32%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[14%]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col className="w-[104px]" />
          </colgroup>
          <thead>
            <tr className="text-[11px] text-muted-foreground border-b border-border/60 bg-muted/20">
              <th className="py-2" />
              <th className="text-left font-medium px-3 py-2">Variant</th>
              <th className="text-left font-medium px-3 py-2">SKU</th>
              <th className="text-left font-medium px-3 py-2">EAN</th>
              <th className="text-left font-medium px-3 py-2">Size / label</th>
              <th className="text-right font-medium px-3 py-2 border-l border-l-border/40 whitespace-nowrap min-w-[112px] align-bottom" title={pricing.rrp ? `From the “${pricing.rrp}” price list — what individuals pay` : "Recommended retail price — what individuals pay"}>
                <div>RRP</div>
                <div className="text-[10px] font-normal text-muted-foreground/70">{pricing.currency} · incl. VAT</div>
              </th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap min-w-[112px] align-bottom" title={pricing.partner ? `From the “${pricing.partner}” price list — what companies pay` : "Partner price — what companies pay"}>
                <div>Partner</div>
                <div className="text-[10px] font-normal text-muted-foreground/70">{pricing.currency} · excl. VAT</div>
              </th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap min-w-[112px] align-bottom" title="Optional discounted partner price (a price, not a percentage) — replaces the partner price for companies when set">
                <div>Discounted</div>
                <div className="text-[10px] font-normal text-muted-foreground/70">{pricing.currency} · excl. VAT · optional</div>
              </th>
              <th className="py-2" />
            </tr>
          </thead>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <tbody>
              {rows.map((r) => (
                <RowEditor
                  key={r.id}
                  row={r}
                  cover={cover}
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
// ── Volume discount tiers (per tab ladder, order-wide threshold) ─────────────
// A tab's ladder: once the WHOLE order (every tab together) reaches a threshold,
// every line in this tab drops by the tier's percentage. Tiers never stack — only
// the highest one reached applies.
function TierEditor({
  fixedCount,
  tab,
  currency,
  onChange,
  onApplyToAllTabs,
  onToggleLock,
  otherTabs,
  otherTabCount,
}: {
  tab: PreorderTab;
  currency: string;
  onChange: (tiers: PreorderTier[]) => void;
  onApplyToAllTabs: () => void;
  onToggleLock: () => void;
  otherTabs: { name: string; locked: boolean; tiers: number }[];
  otherTabCount: number;
  fixedCount: number;
}) {
  const tiers = useMemo(() => tab.tiers ?? [], [tab.tiers]);
  const [copied, setCopied] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const copyTargets = otherTabs.filter((t) => !t.locked);
  const overwritten = copyTargets.filter((t) => t.tiers > 0);

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

  // Which tier row is in edit mode (inline inputs); every other row is read-only.
  const [editing, setEditing] = useState<string | null>(null);

  function addTier() {
    const last = ladder[ladder.length - 1];
    const id = uid();
    onChange([
      ...tiers,
      {
        id,
        name: `Tier ${tiers.length + 1}`,
        minAmount: last ? last.minAmount * 2 : 10000,
        discountPct: last ? Math.min(100, last.discountPct + 5) : 5,
      },
    ]);
    setEditing(id);
  }

  const best = ladder[ladder.length - 1];

  return (
    <section className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* header: title · info · summary · add */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 h-11">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <Percent className="w-3.5 h-3.5 text-lime-700 dark:text-lime-400" /> Volume discounts
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground/60 hover:text-foreground" aria-label="How volume discounts work">
              <Info className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            Once the whole order (every tab together) reaches a threshold, every line in <span className="font-medium">{tab.name || "this tab"}</span> drops by that tier&rsquo;s
            percentage — except fixed-price variants, which are never discounted but still count towards the thresholds. Only the highest tier reached applies; each tab has its own ladder, but the same order total unlocks them all. Thresholds are compared with the order subtotal on partner prices excl. VAT.
          </TooltipContent>
        </Tooltip>
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {ladder.length === 0 ? "None — list price" : `${ladder.length} tier${ladder.length === 1 ? "" : "s"} · up to −${best.discountPct}% from ${fmtMoney(best.minAmount, currency)}`}
        </span>
        <div className="flex-1" />
        {otherTabCount > 0 && (
          <Button
            variant="ghost"
            size="xs"
            className={cn("h-7", tab.tiersLocked ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}
            onClick={onToggleLock}
            title={tab.tiersLocked ? "Locked: “Copy to all tabs” from another tab leaves this ladder alone. Click to unlock." : "Lock this ladder so “Copy to all tabs” from another tab cannot overwrite it"}
          >
            {tab.tiersLocked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
            {tab.tiersLocked ? "Locked" : "Lock"}
          </Button>
        )}
        {otherTabCount > 0 && tiers.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            className="h-7 text-muted-foreground"
            onClick={() => (copyTargets.length === 0 ? undefined : setConfirmCopy(true))}
            disabled={copyTargets.length === 0}
            title={copyTargets.length === 0 ? "Every other tab is locked" : `Copy this ladder onto the other ${copyTargets.length} tab${copyTargets.length === 1 ? "" : "s"}, replacing theirs`}
          >
            {copied ? <Check className="w-3 h-3 text-lime-600" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy to all tabs"}
          </Button>
        )}
        <Dialog open={confirmCopy} onOpenChange={setConfirmCopy}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Copy this ladder to all tabs?</DialogTitle>
              <DialogDescription>
                The volume discounts of <span className="font-medium text-foreground">{tab.name || "this tab"}</span> ({ladder.length} tier{ladder.length === 1 ? "" : "s"}) will replace the ladder on{" "}
                {copyTargets.length} other tab{copyTargets.length === 1 ? "" : "s"}
                {overwritten.length > 0 ? ` — ${overwritten.map((t) => t.name).join(", ")} already ${overwritten.length === 1 ? "has" : "have"} a ladder that will be overwritten.` : "."}
                {otherTabs.some((t) => t.locked) && ` Locked tabs are left alone: ${otherTabs.filter((t) => t.locked).map((t) => t.name).join(", ")}.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmCopy(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => {
                  onApplyToAllTabs();
                  setConfirmCopy(false);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <Copy className="w-3.5 h-3.5" /> Copy to {copyTargets.length} tab{copyTargets.length === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="outline" className="h-8 bg-background" onClick={addTier}>
          <Plus className="w-3.5 h-3.5" /> Add tier
        </Button>
      </div>

      {/* rows */}
      <div className="border-t border-border/60 divide-y divide-border/50">
        {tiers.length === 0 && (
          <div className="px-4 py-2.5 text-[12px] text-muted-foreground">No tiers — partners pay list price on this tab.</div>
        )}
        {[...tiers].sort((a, b) => a.minAmount - b.minAmount).map((t, i) => {
          const isEditing = editing === t.id;
          return (
            <div
              key={t.id}
              className={cn(
                "group/tier grid items-center gap-3 px-4 min-h-10",
                "grid-cols-[20px_minmax(0,1fr)_150px_96px_64px]",
                isEditing && "bg-lime-50/40 dark:bg-lime-950/10",
              )}
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-lime-500/12 text-[10px] font-semibold text-lime-700 dark:text-lime-400 tabular-nums">
                {i + 1}
              </span>
              {isEditing ? (
                <>
                  <input
                    autoFocus
                    value={t.name}
                    onChange={(e) => update(t.id, { name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") setEditing(null);
                    }}
                    placeholder={`Tier ${i + 1}`}
                    className="h-8 min-w-0 rounded-md border border-border bg-background px-2 text-[12.5px] focus:border-ring focus:outline-none"
                    aria-label="Tier name"
                  />
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">from</span>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={t.minAmount || ""}
                      onChange={(e) => update(t.id, { minAmount: Math.max(0, Number(e.target.value) || 0) })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") setEditing(null);
                      }}
                      placeholder="0"
                      className="h-8 w-full rounded-md border border-border bg-background pl-10 pr-2 text-right text-[12.5px] tabular-nums no-spinner focus:border-ring focus:outline-none"
                      aria-label="Order threshold"
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={t.discountPct || ""}
                      onChange={(e) => update(t.id, { discountPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") setEditing(null);
                      }}
                      placeholder="0"
                      className="h-8 w-full rounded-md border border-border bg-background pl-2 pr-6 text-right text-[12.5px] tabular-nums no-spinner focus:border-ring focus:outline-none"
                      aria-label="Discount percent"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">%</span>
                  </div>
                </>
              ) : (
                <>
                  <span className={cn("text-[13px] truncate", t.name.trim() ? "text-foreground font-medium" : "text-muted-foreground italic")}>
                    {t.name.trim() || "Unnamed tier"}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground tabular-nums">
                    from <span className="text-foreground">{fmtMoney(t.minAmount, currency)}</span>
                  </span>
                  <span className="text-[13px] font-semibold text-lime-700 dark:text-lime-400 tabular-nums text-right pr-1">−{t.discountPct}%</span>
                </>
              )}
              <div className="flex items-center justify-end gap-0.5">
                {isEditing ? (
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-lime-700 dark:text-lime-400 hover:bg-lime-500/12"
                    aria-label="Done"
                    title="Done"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(t.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted opacity-0 group-hover/tier:opacity-100 focus-visible:opacity-100 transition-opacity"
                    aria-label="Edit tier"
                    title="Edit"
                  >
                    <PencilLine className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onChange(tiers.filter((x) => x.id !== t.id));
                    if (editing === t.id) setEditing(null);
                  }}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-opacity",
                    !isEditing && "opacity-0 group-hover/tier:opacity-100 focus-visible:opacity-100",
                  )}
                  aria-label="Remove tier"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {fixedCount > 0 && ladder.length > 0 && (
          <div className="flex items-start gap-1.5 px-4 py-2 text-[11px] text-muted-foreground bg-muted/20">
            <Lock className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              {fixedCount} fixed-price variant{fixedCount === 1 ? "" : "s"} on this tab {fixedCount === 1 ? "is" : "are"} never discounted — {fixedCount === 1 ? "it counts" : "they count"} towards
              the thresholds, and customers see a &ldquo;Fixed price&rdquo; badge on {fixedCount === 1 ? "it" : "them"}.
            </span>
          </div>
        )}
        {warnings.length > 0 && (
          <ul className="px-4 py-2 space-y-0.5 bg-amber-50/60 dark:bg-amber-950/20">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const PL_NONE = "__none__";
/** A labelled control in the sheet settings toolbar: 10px caps label over the field. */
// A compact labelled control: the label sits INSIDE the field on the left as a
// muted prefix, the control fills the rest — one consistent 36px pill per setting,
// so a row of them reads as one toolbar instead of a form.
function InlineField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div
      className="inline-flex items-stretch h-9 rounded-lg border border-border bg-background overflow-hidden focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30 transition-shadow"
      title={hint}
    >
      <span className="flex items-center px-2.5 text-[11px] font-medium text-muted-foreground bg-muted/50 border-r border-border whitespace-nowrap select-none">
        {label}
      </span>
      {children}
    </div>
  );
}
const inlineInput = "h-full min-w-0 bg-transparent px-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60";
const inlineSelect = "h-full w-[230px] rounded-none border-0 bg-transparent px-2.5 text-[12.5px] shadow-none focus-visible:ring-0 hover:bg-muted/40 dark:bg-transparent dark:hover:bg-muted/40";

function PricelistSelect({
  label, value, pricelists, onChange, className,
}: {
  label: string;
  value: string | null;
  pricelists: MkPricelist[];
  onChange: (v: string | null) => void;
  className?: string;
}) {
  // Keep the current value selectable even if it's no longer in the MK list
  // (e.g. a renamed/removed price list) so it isn't silently dropped.
  const known = pricelists.some((p) => p.title === value);
  return (
    <Select
      value={value ?? PL_NONE}
      onValueChange={(v) => onChange(v === PL_NONE ? null : v)}
    >
      <SelectTrigger size="sm" className={cn("h-8 w-[220px] text-[12px] bg-background [&>span]:truncate", className)}>
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
type Hit = { code: string; name: string; image?: string | null; source?: "catalogue" | "metakocka" };

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
          setResults((data.candidates ?? []) as Hit[]);
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
                  <div className="text-[10px] text-muted-foreground font-mono truncate">{c.code}{c.source === "metakocka" && <MkOnlyBadge />}</div>
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

// A search hit that exists only in Metakocka (not in the PNV-built catalogue): no
// variants or image — it comes in as a single row priced from MK.
function MkOnlyBadge() {
  return (
    <span className="ml-1.5 font-sans rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1 py-px text-[9px] font-medium align-middle">
      Metakocka only
    </span>
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
          setResults((data.candidates ?? []) as Hit[]);
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
                <div className="text-[10px] text-muted-foreground font-mono truncate">{c.code}{c.source === "metakocka" && <MkOnlyBadge />}</div>
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

// ── SKU import: a spreadsheet or pasted codes → resolved → added grouped by parent ──
//
// Two ways in, one text box: a dropped / chosen file (.xlsx parsed server-side by
// lib/sku-xlsx.ts, CSV / text read in the browser) lands its codes in the box next
// to anything pasted, so what is about to be imported is always visible. Each line
// is a code with an optional tag and prices (lib/sku-entries.ts). After a run the
// codes that resolved leave the box and the ones that did not stay, ready to be
// corrected and sent again.

// Put each requested tag and price on the rows it produced: a variant code or EAN sets
// that variant; a parent code sets every variant it brought in. The tag's campaign
// colour (if it already has one) comes along. An imported price replaces the resolved
// one (partner price = net, RRP = gross); a new partner price drops any discounted price.
//
// Also returns, per imported code, the patch for a row that is ALREADY on the tab
// (re-import): the tag and fixed-price flag exactly as the import gives them — no tag
// in the import clears the old one, so what the dialog listed is what the row shows —
// and a price only when the import carries one.
function applyImportEntries(
  groups: GroupDraft[],
  entries: SkuEntry[],
  colors: Map<string, string>,
): { groups: GroupDraft[]; patches: Map<string, Partial<PreorderRow>> } {
  const byKey = new Map<string, SkuEntry>();
  for (const e of entries) {
    const k = skuKey(e.code);
    if (k) byKey.set(k, e);
  }
  const patches = new Map<string, Partial<PreorderRow>>();
  const out = groups.map((g) => {
    const parent = byKey.get(skuKey(g.parentCode) ?? "");
    return {
      ...g,
      rows: g.rows.map((r) => {
        const own = byKey.get(skuKey(r.code) ?? "") ?? byKey.get(skuKey(r.ean) ?? "");
        const tag = own?.tag ?? parent?.tag ?? null;
        const partnerPrice = own?.partnerPrice ?? parent?.partnerPrice ?? null;
        const rrp = own?.rrp ?? parent?.rrp ?? null;
        const fixedPrice = !!(own?.fixedPrice || parent?.fixedPrice);
        let next = r;
        if (tag) next = { ...next, tag, tagColor: colors.get(tagLabel(tag)?.toUpperCase() ?? "") ?? null };
        if (partnerPrice != null) next = { ...next, partnerPrice, discountedPrice: null };
        if (rrp != null) next = { ...next, rrp };
        if (fixedPrice) next = { ...next, fixedPrice: true };
        if (next.code) {
          const patch: Partial<PreorderRow> = { tag: next.tag ?? null, tagColor: next.tag ? (next.tagColor ?? null) : null, fixedPrice };
          if (partnerPrice != null) Object.assign(patch, { partnerPrice, discountedPrice: null });
          if (rrp != null) patch.rrp = rrp;
          patches.set(next.code, patch);
        }
        return next;
      }),
    };
  });
  return { groups: out, patches };
}

// The resolve API answers in no particular order. Put the groups and their variants
// back in the order of the imported lines: a row sits at the line of its own code /
// EAN, else of its parent code (a parent line brings all its variants); a group at its
// first row. Returns the per-code positions for placing rows among existing ones.
function sortByImport(groups: GroupDraft[], entries: SkuEntry[]): { groups: GroupDraft[]; order: ImportOrder } {
  const line = new Map<string, number>();
  entries.forEach((e, i) => {
    const k = skuKey(e.code);
    if (k && !line.has(k)) line.set(k, i);
  });
  const at = (v: string | null | undefined) => line.get(skuKey(v) ?? "") ?? Infinity;
  const order: ImportOrder = new Map();
  const sorted = groups
    .map((g) => {
      const parent = at(g.parentCode);
      const rows = g.rows
        .map((r, j) => ({ r, p: Math.min(at(r.code), at(r.ean)), j }))
        .map((x) => ({ ...x, p: x.p === Infinity ? parent : x.p }))
        .sort((a, b) => a.p - b.p || a.j - b.j);
      // Fractions keep a parent line's variants in their catalogue order.
      rows.forEach((x) => x.r.code && order.set(x.r.code, x.p + x.j / 1000));
      return { g: { ...g, rows: rows.map((x) => x.r) }, p: rows.length ? rows[0].p : Infinity };
    })
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.g);
  return { groups: sorted, order };
}

const SKU_FILE_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv,text/plain";

function CsvImportDialog({
  tabName, currency, rrpPricelist, partnerPricelist, existingCodes, onClose, onAddGroups,
}: {
  existingCodes: Set<string>;
  tabName: string | null;
  currency: string;
  rrpPricelist: string | null;
  partnerPricelist: string | null;
  onClose: () => void;
  onAddGroups: (gs: GroupDraft[], smart: boolean, patches: Map<string, Partial<PreorderRow>>, order: ImportOrder) => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [showFormat, setShowFormat] = useState(false);
  const [smart, setSmart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<{ name: string; codes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ variants: number; products: number; updated: number; notFound: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { colors } = useContext(TagColorsContext);
  const entries = useMemo(() => parseSkuEntries(text), [text]);
  const codes = useMemo(() => entries.map((e) => e.code), [entries]);
  const tagged = entries.filter((e) => e.tag).length;
  const priced = entries.filter((e) => e.partnerPrice != null || e.rrp != null).length;
  const fixedEntries = entries.filter((e) => e.fixedPrice).length;
  const notFound = useMemo(() => new Set(result?.notFound ?? []), [result]);

  async function loadFile(f: File) {
    setReading(true);
    setError(null);
    setResult(null);
    try {
      let list: SkuEntry[];
      if (/\.xlsx$/i.test(f.name)) {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch(`/api/admin/preorder/products/import`, { method: "POST", body: fd });
        const data = (await r.json().catch(() => null)) as { entries?: SkuEntry[]; error?: string } | null;
        if (!r.ok || !data?.entries) throw new Error(data?.error ?? `Could not read ${f.name} (${r.status}).`);
        list = data.entries;
      } else if (/\.(csv|txt)$/i.test(f.name) || f.type.startsWith("text/")) {
        list = parseSkuEntries(await f.text());
      } else {
        throw new Error(`${f.name} is not a spreadsheet — use .xlsx or .csv.`);
      }
      if (list.length === 0) throw new Error(`No codes found in ${f.name}. Check the header: SKU / EAN (and optionally Tag).`);
      setFile({ name: f.name, codes: list.length });
      setText((prev) => (prev.trim() ? prev.replace(/\s+$/, "") + "\n" : "") + formatSkuEntries(list));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void loadFile(f);
  }

  function removeEntry(code: string) {
    setText(formatSkuEntries(entries.filter((e) => e.code !== code)));
  }

  function clearAll() {
    setText("");
    setFile(null);
    setResult(null);
    setError(null);
  }

  async function run() {
    if (codes.length === 0) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    setResult(null);
    try {
      const parts = await inChunks(
        codes,
        IMPORT_CHUNK,
        async (chunk, first) => {
          const r = await fetch(`/api/admin/preorder/products/resolve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codes: chunk, rrpPricelist, partnerPricelist, freshMk: first }),
          });
          const data = (await r.json().catch(() => null)) as { groups?: GroupDraft[]; notFound?: string[]; error?: string } | null;
          if (!r.ok || !data) throw new Error(data?.error ?? `The catalogue lookup failed (${r.status}). Try again.`);
          return data;
        },
        setProgress,
      );
      const data = { groups: mergeResolvedGroups(parts.flatMap((p) => p.groups ?? [])), notFound: parts.flatMap((p) => p.notFound ?? []) };
      const applied = applyImportEntries(data.groups, entries, colors);
      const { groups, order } = sortByImport(applied.groups, entries);
      const patches = applied.patches;
      const missingCodes = data.notFound ?? [];
      if (groups.length > 0) onAddGroups(groups, smart, patches, order);
      // Codes already on the tab update their row instead of being added again.
      const isExisting = (code: string) => !!code && existingCodes.has(code);
      const fresh = groups.map((g) => ({ ...g, rows: g.rows.filter((r) => !isExisting(r.code)) })).filter((g) => g.rows.length > 0);
      const updated = new Set(groups.flatMap((g) => g.rows.map((r) => r.code)).filter(isExisting)).size;
      const products = smart ? smartGroup(fresh).length : fresh.length;
      setResult({ variants: fresh.reduce((n, g) => n + g.rows.length, 0), products, updated, notFound: missingCodes });
      // What resolved is in the sheet now; what did not stays in the list to be fixed.
      const missing = new Set(missingCodes);
      setText(formatSkuEntries(entries.filter((e) => missing.has(e.code))));
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const added = result !== null && (result.variants > 0 || result.updated > 0);
  const isEan = (c: string) => /^\d{8,14}$/.test(c);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 text-left">
          <DialogTitle className="text-[15px]">Import products</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            Add to {tabName ? <span className="font-medium text-foreground">{tabName}</span> : "this tab"} by SKU or EAN — each code lands under its
            parent product, optionally with a tag and prices.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-5 space-y-4 max-h-[68vh] overflow-y-auto">
          {/* Outcome of the last run */}
          {result && (
            <div
              className={cn(
                "rounded-lg px-3.5 py-2.5 text-[12px] flex gap-2",
                added ? "bg-lime-500/10 text-lime-800 dark:text-lime-300" : "bg-muted text-muted-foreground",
              )}
            >
              <Check className="size-3.5 shrink-0 mt-0.5" />
              <span>
                {added ? (
                  <>
                    {result.variants > 0 && (
                      <>
                        Added <span className="font-semibold">{result.variants} variant{result.variants === 1 ? "" : "s"}</span> in {result.products} product
                        {result.products === 1 ? "" : "s"}.{" "}
                      </>
                    )}
                    {result.updated > 0 && (
                      <>
                        Updated <span className="font-semibold">{result.updated}</span> already on this tab (tag, fixed price
                        {" "}and any imported prices).
                      </>
                    )}
                  </>
                ) : (
                  "Nothing was added."
                )}
                {result.notFound.length > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {" "}
                    {result.notFound.length} code{result.notFound.length === 1 ? " wasn't" : "s weren't"} found — fix or remove {result.notFound.length === 1 ? "it" : "them"} below.
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Source: file or paste */}
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-[12px]">
            {([
              ["file", "Upload file", FileSpreadsheet],
              ["paste", "Paste codes", ClipboardPaste],
            ] as const).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 px-3 rounded-md font-medium transition-colors",
                  mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>

          {mode === "file" ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => !reading && fileRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!reading) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex items-center gap-4 rounded-xl border-2 border-dashed px-5 py-5 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                dragging ? "border-lime-500 bg-lime-500/10" : "border-border hover:border-lime-500/60 hover:bg-lime-500/5",
              )}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-lime-500/10 text-lime-700 dark:text-lime-400">
                {reading ? <Loader2 className="size-5 animate-spin" /> : file ? <Check className="size-5" /> : <Upload className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground truncate">
                  {reading
                    ? "Reading the file…"
                    : dragging
                      ? "Drop to read the codes"
                      : file
                        ? `${file.name} · ${file.codes} code${file.codes === 1 ? "" : "s"}`
                        : "Drop a spreadsheet, or click to choose"}
                </p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {file ? "Drop another file to add more." : ".xlsx or .csv with a SKU / EAN column and optional Tag, Partner price, RRP and Fixed price columns"}
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={SKU_FILE_ACCEPT}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && void loadFile(e.target.files[0])}
              />
            </div>
          ) : (
            <textarea
              autoFocus
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (result) setResult(null);
              }}
              rows={6}
              spellCheck={false}
              placeholder={"P07260003140, NEW, 82.50, RRP 129.90\n4262434064904\tSALE\t82,50\nP07260003145"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[12px] font-mono leading-relaxed resize-y focus:outline-none focus:ring-[3px] focus:ring-lime-500/25 focus:border-lime-500/60"
            />
          )}

          {/* Format help + template, one quiet line */}
          <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            <button
              type="button"
              onClick={() => setShowFormat((v) => !v)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              aria-expanded={showFormat}
            >
              <Info className="size-3.5" /> How to format
              <ChevronDown className={cn("size-3.5 transition-transform", showFormat && "rotate-180")} />
            </button>
            <a href="/api/admin/preorder/products/template" download className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <Download className="size-3.5" /> Template (.xlsx)
            </a>
          </div>
          {showFormat && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5 text-[12px]">
              <div className="rounded-md border border-border bg-background overflow-hidden text-[11.5px]">
                <div className="grid grid-cols-[1.5fr_0.9fr_1fr_0.8fr] bg-muted/50 border-b border-border font-semibold text-foreground">
                  <span className="px-3 py-1.5 border-r border-border">SKU / EAN</span>
                  <span className="px-3 py-1.5 border-r border-border">Tag</span>
                  <span className="px-3 py-1.5 border-r border-border">Partner price</span>
                  <span className="px-3 py-1.5">RRP</span>
                </div>
                {[
                  ["P07260003140", "NEW", "82.50", "129.90"],
                  ["4262434064904", "SALE", "82.50", ""],
                  ["P07260003145", "", "", ""],
                ].map(([c, t, pp, rrp]) => (
                  <div key={c} className="grid grid-cols-[1.5fr_0.9fr_1fr_0.8fr] border-b last:border-b-0 border-border/60 font-mono text-muted-foreground">
                    <span className="px-3 py-1 border-r border-border/60 truncate">{c}</span>
                    <span className="px-3 py-1 border-r border-border/60">{t ? <TagPill tag={t} color={colors.get(t) ?? null} /> : <span className="opacity-50">—</span>}</span>
                    <span className="px-3 py-1 border-r border-border/60 tabular-nums">{pp || <span className="opacity-50">—</span>}</span>
                    <span className="px-3 py-1 tabular-nums">{rrp || <span className="opacity-50">—</span>}</span>
                  </div>
                ))}
              </div>
              <ul className="space-y-1 text-muted-foreground leading-relaxed list-disc pl-4">
                <li>
                  <span className="text-foreground font-medium">Spreadsheet:</span> keep the header row — columns are found by name (SKU / EAN, Tag, Partner price, RRP), in any order. Tag and prices are optional.
                </li>
                <li>
                  <span className="text-foreground font-medium">Paste:</span> one code per line; tag and prices go after a tab, semicolon or comma. The first amount is the partner price, the second the RRP — or label it: <span className="font-mono">RRP 129.90</span>. Separate with tabs or semicolons to use decimal commas.
                </li>
                <li>
                  <span className="text-foreground font-medium">Fixed price:</span> an <span className="font-mono">x</span> in the Fixed price column (or{" "}
                  <span className="font-mono">FIXED</span> on a pasted line) means volume discounts never apply to that variant.
                </li>
                <li>
                  <span className="text-foreground font-medium">Prices:</span> partner price is net (excl. VAT), RRP gross (incl. VAT). They replace the price-list prices; leave empty to keep those. Re-price overwrites them later.
                </li>
                <li>A parent product&rsquo;s code imports all its variants and applies its tag and prices to each one.</li>
                <li>
                  <span className="text-foreground font-medium">Already on this tab?</span> The code isn&rsquo;t added twice — its row is updated: the tag
                  and fixed price become what you import (no tag removes the old one); prices change only where you give one.
                </li>
              </ul>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-300/60 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-[12px] text-rose-700 dark:text-rose-300 flex gap-2">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* What will be imported */}
          {entries.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b border-border text-[12px]">
                <span className="font-medium text-foreground tabular-nums">
                  {entries.length} code{entries.length === 1 ? "" : "s"}
                  {tagged > 0 && <span className="font-normal text-muted-foreground"> · {tagged} tagged</span>}
                  {priced > 0 && <span className="font-normal text-muted-foreground"> · {priced} priced</span>}
                  {fixedEntries > 0 && <span className="font-normal text-muted-foreground"> · {fixedEntries} fixed price</span>}
                  {notFound.size > 0 && <span className="font-normal text-amber-700 dark:text-amber-300"> · {notFound.size} not found</span>}
                </span>
                <div className="flex items-center gap-3">
                  {mode === "file" && (
                    <button type="button" onClick={() => setMode("paste")} className="text-muted-foreground hover:text-foreground">
                      Edit as text
                    </button>
                  )}
                  <button type="button" onClick={clearAll} className="text-muted-foreground hover:text-foreground">
                    Clear
                  </button>
                </div>
              </div>
              <ul className="max-h-56 overflow-y-auto divide-y divide-border/50">
                {entries.map((e) => {
                  const missing = notFound.has(e.code);
                  return (
                    <li key={e.code} className={cn("group/e flex items-center gap-2.5 px-3 h-9 text-[12px]", missing && "bg-amber-50/70 dark:bg-amber-950/20")}>
                      <span
                        className={cn(
                          "w-9 shrink-0 text-center rounded text-[9px] font-semibold uppercase tracking-wide py-0.5",
                          isEan(e.code) ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {isEan(e.code) ? "EAN" : "SKU"}
                      </span>
                      <span className="font-mono text-foreground truncate">{e.code}</span>
                      {missing && <span className="text-[11px] text-amber-700 dark:text-amber-300 shrink-0">not found</span>}
                      <span className="flex-1" />
                      {e.tag && <TagPill tag={e.tag} color={colors.get(tagLabel(e.tag)?.toUpperCase() ?? "") ?? null} />}
                      {e.fixedPrice && <FixedPricePill />}
                      {(e.partnerPrice != null || e.rrp != null) && (
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {e.partnerPrice != null && <span className="text-foreground font-medium">{fmtMoney(e.partnerPrice, currency)}</span>}
                          {e.partnerPrice != null && e.rrp != null && " · "}
                          {e.rrp != null && <>RRP {fmtMoney(e.rrp, currency)}</>}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeEntry(e.code)}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/e:opacity-100 focus-visible:opacity-100"
                        aria-label={`Remove ${e.code}`}
                        title="Remove"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3.5 border-t border-border bg-muted/20 sm:justify-between sm:items-center">
          {/* Smart grouping — one line; the detail lives in the tooltip */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={smart}
              onClick={() => setSmart((v) => !v)}
              className="inline-flex items-center gap-2 text-[12px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-full"
            >
              <span className={cn("relative h-[18px] w-8 shrink-0 rounded-full transition-colors", smart ? "bg-lime-500" : "bg-muted-foreground/25")}>
                <span
                  className={cn(
                    "absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200",
                    smart ? "translate-x-[14px]" : "translate-x-0",
                  )}
                />
              </span>
              Smart grouping
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="What is smart grouping?">
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-72 text-[12px] leading-relaxed">
                Products that arrive one per SKU but differ only in size (QTS-Wave 71, QTS-Wave 76) go into one group with the size as the variant.
                A group with that name already on the tab takes them in instead of a duplicate.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={onClose} disabled={busy} className="h-8 text-[12px]">
              {added && codes.length === 0 ? "Done" : "Cancel"}
            </Button>
            <Button size="sm" onClick={run} disabled={busy || reading || codes.length === 0} className="h-8 text-[12px] min-w-32">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {busy ? (codes.length > IMPORT_CHUNK ? `Looking up… ${progress}/${codes.length}` : "Looking up…") : codes.length === 0 ? "Add products" : `Add ${codes.length} product${codes.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </DialogFooter>
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
            <Button variant="outline" size="sm" className="h-8" disabled><Settings2 className="w-3.5 h-3.5" /> Settings</Button>
            <Skeleton className="h-8 w-[92px] rounded-md" delay={80} />
          </>
        }
      />

      <div className="shrink-0 border-b border-border bg-muted/30 px-4 md:px-6 py-2.5">
        <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-center 2xl:gap-4">
          <div className="min-w-0 2xl:flex-1">
            <div className="text-[13px] font-semibold text-foreground">Pricing &amp; VAT</div>
            <div className="text-[11px] text-muted-foreground">Every RRP and partner price on every tab is read from these two Metakocka lists.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <InlineField label="RRP"><Skeleton className="h-full w-[230px] rounded-none" delay={100} /></InlineField>
            <InlineField label="Partner"><Skeleton className="h-full w-[230px] rounded-none" delay={120} /></InlineField>
            <Button variant="outline" size="sm" className="h-9 bg-background" disabled><RefreshCw className="w-3.5 h-3.5" /> Re-price all tabs</Button>
            <Button variant="outline" size="sm" className="h-9 bg-background" disabled><Percent className="w-3.5 h-3.5" /> VAT rates</Button>
          </div>
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
            <div className="px-1">
              <SkeletonLine lh="h-10" h="h-6" w="w-48" />
              <SkeletonLine lh="h-8" h="h-3.5" w="w-80" delay={40} />
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
