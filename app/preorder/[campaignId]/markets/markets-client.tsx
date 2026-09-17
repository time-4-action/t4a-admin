"use client";

// app/preorder/[campaignId]/markets/markets-client.tsx
//
// Markets & Customers: one campaign's commercial geography, as lists. A summary strip
// (customers by kind, markets, unlocked, unresolved), then two views over the same
// data — **Customers** (searchable, filterable directory joined with this campaign's
// access / preorder / override state) and **Markets** (the markets panel next to a
// Countries table where countries are assigned to markets, singly or in bulk). A
// contextual right drawer edits a market, a customer or a country. Everything is
// Mongo-backed; Metakocka is only hit by the explicit sync.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Globe2, Users, Plus, Layers, Loader2, RefreshCw, AlertTriangle, Building2, User, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CampaignHeader } from "@/app/preorder/[campaignId]/campaign-nav";
import { CampaignStatusBadge } from "@/app/preorder/preorder-badges";
import type { MkPricelist } from "@/types/documents";
import type { PreorderCampaignAdmin, PreorderMarket } from "@/types/preorder";
import type { CountryGeo } from "@/lib/preorder-customers";
import { MarketModal, type MarketDraft } from "./market-modal";
import { CustomerModal } from "./customer-modal";
import { CountryDrawer } from "./country-drawer";
import { CountriesTable, CustomersTable, MarketsPanel, type CustomerFilters } from "./tables";

type View = "customers" | "markets" | "countries";
type DrawerState =
  | { type: "market"; id: string | null; seed: string[] }
  | { type: "customer"; partnerMkId: string }
  | { type: "country"; iso: string }
  | null;

type Geo = {
  byCountry: Record<string, CountryGeo>;
  unresolved: number;
  kinds: { business: number; person: number };
  countries: Record<string, string>;
  sync: { running: boolean; startedAt: string | null; finishedAt: string | null; ok: boolean | null; count: number; error: string | null };
  totalCustomers: number;
};

const num = new Intl.NumberFormat("en-GB");

export default function MarketsClient({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [campaign, setCampaign] = useState<PreorderCampaignAdmin | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [pricelists, setPricelists] = useState<MkPricelist[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [view, setView] = useState<View>(params.get("view") === "markets" ? "markets" : params.get("view") === "countries" ? "countries" : "customers");
  const [drawer, setDrawer] = useState<DrawerState>(params.get("customer") ? { type: "customer", partnerMkId: params.get("customer")! } : null);
  const [customersReload, setCustomersReload] = useState(0);
  const [preset, setPreset] = useState<{ key: number; filters: Partial<CustomerFilters> }>({ key: 0, filters: {} });
  const mounted = useRef(true);

  const loadCampaign = useCallback(async () => {
    const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || !j.campaign) throw new Error(j?.error ?? "Campaign not found");
    return j.campaign as PreorderCampaignAdmin;
  }, [campaignId]);
  const loadGeo = useCallback(async () => {
    const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}/customers/geo`, { cache: "no-store" });
    return (await r.json()) as Geo;
  }, [campaignId]);

  useEffect(() => {
    mounted.current = true;
    Promise.all([
      loadCampaign(),
      loadGeo(),
      fetch("/api/admin/preorder/pricelists").then((r) => r.json()).catch(() => ({ pricelists: [] })),
      fetch(`/api/admin/preorder/campaigns/${campaignId}/invite`).then((r) => r.json()).catch(() => null),
    ])
      .then(([c, g, pl, inv]) => {
        if (!mounted.current) return;
        setCampaign(c);
        setGeo(g);
        setPricelists(pl?.pricelists ?? []);
        if (inv?.path) setInviteUrl(`${window.location.origin}${inv.path}`);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
    return () => {
      mounted.current = false;
    };
  }, [campaignId, loadCampaign, loadGeo]);

  // Poll the directory sync while it runs.
  const syncing = !!geo?.sync.running;
  useEffect(() => {
    if (!syncing) return;
    const id = setInterval(() => {
      loadGeo()
        .then((g) => {
          if (!mounted.current) return;
          setGeo(g);
          if (!g.sync.running) setCustomersReload((n) => n + 1);
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(id);
  }, [syncing, loadGeo]);

  const refreshAll = useCallback(async () => {
    const [c, g] = await Promise.all([loadCampaign(), loadGeo()]);
    if (!mounted.current) return;
    setCampaign(c);
    setGeo(g);
    setCustomersReload((n) => n + 1);
  }, [loadCampaign, loadGeo]);

  const toast = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3500);
  };

  // URL ↔ view.
  const switchView = (v: View) => {
    setView(v);
    const sp = new URLSearchParams(params.toString());
    sp.set("view", v);
    router.replace(`?${sp.toString()}`, { scroll: false });
  };
  // Jump to the Customers view with a filter applied (stat tiles, "Show customers").
  const showCustomers = (filters: Partial<CustomerFilters>) => {
    setPreset((p) => ({ key: p.key + 1, filters }));
    switchView("customers");
  };

  const markets: PreorderMarket[] = campaign?.markets ?? [];
  const stats = useMemo(() => geo?.byCountry ?? {}, [geo]);
  const countryNames = geo?.countries ?? {};

  // ── mutations ──
  const saveMarket = async (draft: MarketDraft): Promise<string | null> => {
    const url = draft.id ? `/api/admin/preorder/campaigns/${campaignId}/markets/${draft.id}` : `/api/admin/preorder/campaigns/${campaignId}/markets`;
    const r = await fetch(url, {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: draft.name, color: draft.color, countries: draft.countries, kinds: draft.kinds, config: draft.config }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const conflicts = (j?.conflicts as { iso: string; markets: string[] }[] | undefined)?.map((c) => `${c.iso} (${c.markets.join(", ")})`).join(", ");
      return conflicts ? `${j.error} ${conflicts}` : j?.error ?? "Save failed";
    }
    // Hand-picked customers live on customer rules (marketId). Reconcile the
    // draft's list against the rules: pin the added ones, unpin the removed.
    const marketId: string | null = draft.id ?? (j?.market?.id as string | undefined) ?? null;
    if (marketId && campaign) {
      const rules = campaign.customerRules;
      const before = new Set(rules.filter((r) => r.marketId === marketId).map((r) => r.partnerMkId));
      const after = new Map(draft.customers.map((c) => [c.partnerMkId, c.partnerName]));
      const writes: Promise<unknown>[] = [];
      const put = (pid: string, body: Record<string, unknown>) =>
        fetch(`/api/admin/preorder/campaigns/${campaignId}/customers/${encodeURIComponent(pid)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      for (const [pid, name] of after) {
        if (before.has(pid)) continue;
        const existing = rules.find((r) => r.partnerMkId === pid);
        writes.push(put(pid, { ...(existing ?? { config: {} }), partnerName: existing?.partnerName || name, marketId }));
      }
      for (const pid of before) {
        if (after.has(pid)) continue;
        const existing = rules.find((r) => r.partnerMkId === pid);
        if (!existing) continue;
        const bare = !existing.countryIso && !existing.note && Object.keys(existing.config ?? {}).length === 0;
        writes.push(
          bare
            ? fetch(`/api/admin/preorder/campaigns/${campaignId}/customers/${encodeURIComponent(pid)}`, { method: "DELETE" })
            : put(pid, { ...existing, marketId: null }),
        );
      }
      const results = await Promise.all(writes);
      if (results.some((res) => res instanceof Response && !res.ok)) toast("Market saved, but some customer assignments failed");
    }
    await refreshAll();
    toast(draft.id ? "Market saved" : "Market created");
    return null;
  };
  const reorderMarkets = async (ids: string[]) => {
    // Optimistic: show the new order at once, the server confirms on refresh.
    setCampaign((c) => (c ? { ...c, markets: ids.map((id) => c.markets.find((m) => m.id === id)!).filter(Boolean) } : c));
    const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}/markets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: ids }),
    });
    if (!r.ok) {
      const jj = await r.json().catch(() => ({}));
      toast(jj?.error ?? "Could not reorder markets");
      return;
    }
    await refreshAll();
  };
  const deleteMarket = async (id: string): Promise<string | null> => {
    const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}/markets/${id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return j?.error ?? "Delete failed";
    await refreshAll();
    toast(j.affectedPartners?.length ? `Market deleted · ${j.affectedPartners.length} customer assignment${j.affectedPartners.length === 1 ? "" : "s"} reset` : "Market deleted");
    return null;
  };
  const assignCountries = async (marketId: string | null, isos: string[]) => {
    if (isos.length === 0) return;
    const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}/markets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assign: { marketId, countries: isos } }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      toast(j?.error ?? "Could not assign countries");
      return;
    }
    await refreshAll();
    const name = marketId ? markets.find((m) => m.id === marketId)?.name : null;
    toast(name ? `${isos.length} countr${isos.length === 1 ? "y" : "ies"} added to ${name}` : `${isos.length} countr${isos.length === 1 ? "y" : "ies"} removed from their market`);
  };
  const startSync = async () => {
    const r = await fetch(`/api/admin/preorder/customers/sync`, { method: "POST" });
    if (r.status === 409) toast("A sync is already running");
    setGeo(await loadGeo());
  };

  const syncInfo = geo
    ? geo.sync.running
      ? "Syncing partners from Metakocka…"
      : geo.sync.finishedAt
        ? `${num.format(geo.totalCustomers)} in directory · synced ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(geo.sync.finishedAt))}${geo.sync.ok === false ? " · failed" : ""}`
        : `${num.format(geo.totalCustomers)} in directory · never synced`
    : null;

  if (loading) return <MarketsSkeleton campaignId={campaignId} />;
  if (error || !campaign || !geo) {
    return (
      <div className="p-8">
        <Link href="/preorder" className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back to campaigns</Link>
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error ?? "Not found"}</div>
      </div>
    );
  }

  const openMarket = (id: string | null, seed: string[] = []) => setDrawer({ type: "market", id, seed });
  const openCustomer = (partnerMkId: string) => setDrawer({ type: "customer", partnerMkId });
  const openCountry = (iso: string) => setDrawer({ type: "country", iso });
  const drawerMarket = drawer?.type === "market" && drawer.id ? markets.find((m) => m.id === drawer.id) ?? null : null;
  const drawerCustomerCount = drawerMarket ? drawerMarket.countries.reduce((n, iso) => n + (stats[iso]?.customers ?? 0), 0) : 0;

  const assignedCountries = new Set(markets.flatMap((m) => m.countries));
  const countriesWithCustomers = Object.entries(stats).filter(([, s]) => s.customers > 0);
  const unassignedWithCustomers = countriesWithCustomers.filter(([iso]) => !assignedCountries.has(iso)).length;
  const unlocked = Object.values(stats).reduce((n, s) => n + s.unlocked, 0);
  const submitted = Object.values(stats).reduce((n, s) => n + s.submitted, 0);

  return (
    <div className="flex flex-col h-full">
      <CampaignHeader
        campaignId={campaignId}
        active="markets"
        title={campaign.title}
        meta={
          <>
            <CampaignStatusBadge status={campaign.status} />
            <span className="inline-flex items-center gap-1"><Globe2 className="w-3 h-3" /> {markets.length} market{markets.length === 1 ? "" : "s"}</span>
            <span>· {campaign.customerRules.length} customer override{campaign.customerRules.length === 1 ? "" : "s"}</span>
          </>
        }
        actions={
          <>
            <Button size="sm" variant="outline" className="h-8" onClick={startSync} disabled={syncing} title={syncInfo ?? undefined}>
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} <span className="hidden md:inline">Sync from Metakocka</span>
            </Button>
            <Button size="sm" className="h-8" onClick={() => openMarket(null)}><Plus className="w-3.5 h-3.5" /> New market</Button>
          </>
        }
        navExtra={
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {(
              [
                ["customers", Users, "Customers"],
                ["markets", Layers, "Markets"],
                ["countries", Globe2, "Countries"],
              ] as const
            ).map(([v, Icon, label]) => (
              <button key={v} onClick={() => switchView(v)} className={cn("flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px]", view === v ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4">
        {flash && <div className="rounded-lg border border-lime-300/60 bg-lime-50 dark:bg-lime-950/30 px-3 py-2 text-[12px] text-lime-800 dark:text-lime-200">{flash}</div>}

        {/* summary strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            icon={Users}
            label="Customers in directory"
            value={num.format(geo.totalCustomers)}
            onClick={() => showCustomers({})}
            sub={
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <button type="button" onClick={(e) => { e.stopPropagation(); showCustomers({ kind: "business" }); }} className="inline-flex items-center gap-1 hover:text-foreground"><Building2 className="w-3 h-3" /> {num.format(geo.kinds.business)} companies</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); showCustomers({ kind: "person" }); }} className="inline-flex items-center gap-1 hover:text-foreground"><User className="w-3 h-3" /> {num.format(geo.kinds.person)} individuals</button>
              </span>
            }
          />
          <StatTile
            icon={Layers}
            label="Markets"
            value={String(markets.length)}
            onClick={() => switchView("markets")}
            sub={`${assignedCountries.size} countr${assignedCountries.size === 1 ? "y" : "ies"} assigned · ${unassignedWithCustomers} with customers unassigned`}
          />
          <StatTile
            icon={LockOpen}
            label="Unlocked this campaign"
            value={num.format(unlocked)}
            onClick={() => showCustomers({ access: "unlocked" })}
            sub={`${num.format(submitted)} submitted a preorder · ${campaign.customerRules.length} with overrides`}
          />
          <StatTile
            icon={AlertTriangle}
            label="Country unresolved"
            value={num.format(geo.unresolved)}
            tone={geo.unresolved > 0 ? "warn" : "default"}
            onClick={() => showCustomers({ country: "none" })}
            sub={geo.unresolved > 0 ? "No usable country in Metakocka — they get campaign defaults" : "Every customer has a country"}
          />
        </div>

        {view === "customers" && (
          <CustomersTable
            campaignId={campaignId}
            markets={markets}
            countryNames={countryNames}
            stats={stats}
            kinds={geo.kinds}
            syncing={syncing}
            syncInfo={syncInfo}
            onSync={startSync}
            onOpen={openCustomer}
            reloadKey={customersReload}
            preset={preset.filters}
            presetKey={preset.key}
          />
        )}

        {view === "markets" && (
            <MarketsPanel
              markets={markets}
              stats={stats}
              pinned={(campaign?.customerRules ?? []).reduce<Record<string, number>>((acc, r) => {
                if (r.marketId) acc[r.marketId] = (acc[r.marketId] ?? 0) + 1;
                return acc;
              }, {})}
              onEdit={(id) => openMarket(id)}
              onCreate={() => openMarket(null)}
              onShowCustomers={(id) => showCustomers({ market: id })}
              onReorder={reorderMarkets}
            />
        )}

        {view === "countries" && (
          <CountriesTable stats={stats} markets={markets} countryNames={countryNames} onAssign={assignCountries} onOpenCountry={openCountry} />
        )}
      </div>

      {/* drawers */}
      <MarketModal
        open={drawer?.type === "market"}
        onOpenChange={(o) => !o && setDrawer(null)}
        campaign={campaign}
        market={drawerMarket}
        seedCountries={drawer?.type === "market" ? drawer.seed : []}
        countryNames={countryNames}
        stats={stats}
        pricelists={pricelists}
        customerCount={drawerCustomerCount}
        onSave={saveMarket}
        onDelete={deleteMarket}
      />
      <CustomerModal
        open={drawer?.type === "customer"}
        onOpenChange={(o) => !o && setDrawer(null)}
        campaignId={campaignId}
        campaign={campaign}
        partnerMkId={drawer?.type === "customer" ? drawer.partnerMkId : null}
        countryNames={countryNames}
        pricelists={pricelists}
        inviteUrl={inviteUrl}
        onSaved={() => void refreshAll()}
      />
      <CountryDrawer
        open={drawer?.type === "country"}
        onOpenChange={(o) => !o && setDrawer(null)}
        campaignId={campaignId}
        iso={drawer?.type === "country" ? drawer.iso : null}
        name={drawer?.type === "country" ? countryNames[drawer.iso] ?? drawer.iso : ""}
        markets={markets}
        stat={drawer?.type === "country" ? stats[drawer.iso] : undefined}
        onAssign={async (marketId) => {
          if (drawer?.type === "country") await assignCountries(marketId, [drawer.iso]);
        }}
        onOpenCustomer={openCustomer}
      />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "default" | "warn";
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors",
        tone === "warn" ? "border-amber-300/70 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/20" : "border-border bg-surface",
        onClick && "cursor-pointer hover:border-foreground/30",
      )}
    >
      <div className={cn("flex items-center gap-1.5 text-[11px]", tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="mt-1 text-[20px] font-semibold leading-none tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-muted-foreground leading-snug">{sub}</div>}
    </div>
  );
}

// Structural twin for the initial load.
function MarketsSkeleton({ campaignId }: { campaignId: string }) {
  return (
    <div className="flex flex-col h-full">
      <CampaignHeader
        campaignId={campaignId}
        active="markets"
        title={<SkeletonLine lh="h-[19px]" h="h-3.5" w="w-48" />}
        meta={<><Skeleton className="h-[16.5px] w-12 rounded-full" delay={40} /><Skeleton className="h-2.5 w-32" delay={60} /></>}
        actions={
          <>
            <Button size="sm" variant="outline" className="h-8" disabled><RefreshCw className="w-3.5 h-3.5" /> <span className="hidden md:inline">Sync from Metakocka</span></Button>
            <Button size="sm" className="h-8" disabled><Plus className="w-3.5 h-3.5" /> New market</Button>
          </>
        }
        navExtra={
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <span className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] bg-muted text-foreground font-medium"><Users className="w-3.5 h-3.5" /> Customers</span>
            <span className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] text-muted-foreground"><Layers className="w-3.5 h-3.5" /> Markets & countries</span>
          </div>
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[Users, Layers, LockOpen, AlertTriangle].map((Icon, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="w-3.5 h-3.5" /> <Skeleton className="h-2.5 w-24" delay={i * 40} /></div>
              <Skeleton className="h-5 w-14 mt-1" delay={i * 40 + 20} />
              <Skeleton className="h-2.5 w-40 mt-2" delay={i * 40 + 40} />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground">Customers</span>
            <Skeleton className="h-8 w-64 rounded-md ml-1" delay={60} />
            <Skeleton className="h-8 w-64 rounded-lg" delay={80} />
          </div>
          <div className="px-4 py-2 border-b border-border/60 bg-muted/20 flex items-center gap-2">
            {["w-44", "w-40", "w-36", "w-44", "w-40"].map((w, i) => <Skeleton key={i} className={cn("h-8 rounded-md", w)} delay={100 + i * 20} />)}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-5 py-2.5 border-b border-border/60 flex items-center gap-3">
              <Skeleton className="size-7 rounded-lg" delay={i * 50} />
              <div className="flex-1">
                <SkeletonLine lh="h-[19.5px]" h="h-3.5" w="w-40" delay={i * 50 + 10} />
                <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-48" delay={i * 50 + 20} />
              </div>
              <Skeleton className="h-[18px] w-24 rounded-full" delay={i * 50 + 30} />
              <Skeleton className="h-3 w-20" delay={i * 50 + 40} />
              <Skeleton className="h-[20.5px] w-20 rounded-full" delay={i * 50 + 50} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
