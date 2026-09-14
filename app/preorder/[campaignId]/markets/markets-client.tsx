"use client";

// app/preorder/[campaignId]/markets/markets-client.tsx
//
// Markets & Customers: one campaign's geographic configuration. Three views over the
// same data — the interactive map (select countries → create / extend a market; click
// bubbles for a country's customers), the Markets table, and the searchable Customers
// table — with a contextual right drawer for editing a market, a customer or a
// country. Everything is Mongo-backed; Metakocka is only hit by the explicit sync.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Globe2, Map as MapIcon, List, Users, Plus, X, Layers, Loader2, RefreshCw, AlertTriangle, Search, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CampaignNav } from "@/app/preorder/[campaignId]/campaign-nav";
import { CampaignStatusBadge, MARKET_COLORS } from "@/app/preorder/preorder-badges";
import { EUROPE_ISO, flagEmoji } from "@/lib/countries-client";
import type { MkPricelist } from "@/types/documents";
import type { PreorderCampaignAdmin, PreorderMarket } from "@/types/preorder";
import { loadFeatures, type MapMode } from "./map-data";
import type { MapCountryStat, MapPin } from "./country-map";
import { MarketDrawer, type MarketDraft } from "./market-drawer";
import { CustomerDrawer } from "./customer-drawer";
import { CountryDrawer } from "./country-drawer";
import { CustomersTable, MarketLegend, MarketsTable } from "./tables";

const CountryMap = dynamic(() => import("./country-map").then((m) => m.CountryMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-[12px] text-muted-foreground gap-2">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading map…
    </div>
  ),
});

type View = "map" | "markets" | "customers";
type DrawerState =
  | { type: "market"; id: string | null; seed: string[] }
  | { type: "customer"; partnerMkId: string }
  | { type: "country"; iso: string }
  | null;

type Geo = {
  byCountry: Record<string, MapCountryStat & { marketId: string | null }>;
  unresolved: number;
  manualPins: MapPin[];
  sync: { running: boolean; startedAt: string | null; finishedAt: string | null; ok: boolean | null; count: number; error: string | null };
  totalCustomers: number;
};

export default function MarketsClient({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [campaign, setCampaign] = useState<PreorderCampaignAdmin | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [pricelists, setPricelists] = useState<MkPricelist[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [view, setView] = useState<View>((params.get("view") as View) || "map");
  const [mode, setMode] = useState<MapMode>("europe");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>(params.get("customer") ? { type: "customer", partnerMkId: params.get("customer")! } : null);
  const [pickingPin, setPickingPin] = useState(false);
  const [pickedPin, setPickedPin] = useState<{ lat: number; lng: number } | null>(null);
  const [customersReload, setCustomersReload] = useState(0);
  const [customerSearch, setCustomerSearch] = useState("");
  const [searchHits, setSearchHits] = useState<{ partnerMkId: string; name: string; city: string | null; countryIso: string | null }[]>([]);
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
      Promise.all([loadFeatures("world"), loadFeatures("europe")]).catch(() => [[], []]),
    ])
      .then(([c, g, pl, inv, feats]) => {
        if (!mounted.current) return;
        setCampaign(c);
        setGeo(g);
        setPricelists(pl?.pricelists ?? []);
        if (inv?.path) setInviteUrl(`${window.location.origin}${inv.path}`);
        const names: Record<string, string> = {};
        for (const list of feats) for (const f of list) names[f.properties.iso] = f.properties.name;
        setCountryNames(names);
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

  // URL ↔ view / customer deep link.
  const switchView = (v: View) => {
    setView(v);
    const sp = new URLSearchParams(params.toString());
    sp.set("view", v);
    router.replace(`?${sp.toString()}`, { scroll: false });
  };

  // ── selection ──
  const onSelect = useCallback((isos: string[], additive: boolean) => {
    setSelected((prev) => {
      if (!additive) return new Set(isos);
      const next = new Set(prev);
      for (const iso of isos) {
        if (isos.length === 1 && next.has(iso)) next.delete(iso);
        else next.add(iso);
      }
      return next;
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(new Set());
        setPickingPin(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const markets: PreorderMarket[] = campaign?.markets ?? [];
  const stats = useMemo(() => geo?.byCountry ?? {}, [geo]);
  const selectedList = useMemo(() => Array.from(selected), [selected]);
  const marketsOfSelection = useMemo(() => {
    const ids = new Set<string>();
    for (const iso of selectedList) {
      const m = markets.find((x) => x.countries.includes(iso));
      if (m) ids.add(m.id);
    }
    return ids;
  }, [selectedList, markets]);

  // ── mutations ──
  const saveMarket = async (draft: MarketDraft): Promise<string | null> => {
    const url = draft.id ? `/api/admin/preorder/campaigns/${campaignId}/markets/${draft.id}` : `/api/admin/preorder/campaigns/${campaignId}/markets`;
    const r = await fetch(url, {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: draft.name, color: draft.color, countries: draft.countries, config: draft.config }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const conflicts = (j?.conflicts as { iso: string; markets: string[] }[] | undefined)?.map((c) => `${c.iso} (${c.markets.join(", ")})`).join(", ");
      return conflicts ? `${j.error} ${conflicts}` : j?.error ?? "Save failed";
    }
    await refreshAll();
    setSelected(new Set());
    toast(draft.id ? "Market saved" : "Market created");
    return null;
  };
  const deleteMarket = async (id: string): Promise<string | null> => {
    const r = await fetch(`/api/admin/preorder/campaigns/${campaignId}/markets/${id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return j?.error ?? "Delete failed";
    await refreshAll();
    toast(j.affectedPartners?.length ? `Market deleted · ${j.affectedPartners.length} customer assignment${j.affectedPartners.length === 1 ? "" : "s"} reset` : "Market deleted");
    return null;
  };
  const assignSelected = async (marketId: string | null, isos = selectedList) => {
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
    setSelected(new Set());
    const name = marketId ? markets.find((m) => m.id === marketId)?.name : null;
    toast(name ? `${isos.length} countr${isos.length === 1 ? "y" : "ies"} added to ${name}` : `${isos.length} countr${isos.length === 1 ? "y" : "ies"} removed from their market`);
  };
  const startSync = async () => {
    const r = await fetch(`/api/admin/preorder/customers/sync`, { method: "POST" });
    if (r.status === 409) toast("A sync is already running");
    setGeo(await loadGeo());
  };

  // Customer search box on the map view (directory lookup).
  useEffect(() => {
    const q = customerSearch.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/preorder/customers?q=${encodeURIComponent(q)}&pageSize=8`)
        .then((r) => r.json())
        .then((j) => setSearchHits((j.items ?? []).map((c: { partnerMkId: string; name: string; city: string | null; countryIso: string | null }) => ({ partnerMkId: c.partnerMkId, name: c.name, city: c.city, countryIso: c.countryIso }))))
        .catch(() => setSearchHits([]));
    }, 220);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const syncInfo = geo
    ? geo.sync.running
      ? "Syncing partners from Metakocka…"
      : geo.sync.finishedAt
        ? `${geo.totalCustomers} in directory · synced ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(geo.sync.finishedAt))}${geo.sync.ok === false ? " · failed" : ""}`
        : `${geo.totalCustomers} in directory · never synced`
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

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 md:px-6 h-14">
          <Link href="/preorder" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground truncate leading-tight">{campaign.title}</h1>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <CampaignStatusBadge status={campaign.status} />
              <span className="inline-flex items-center gap-1"><Globe2 className="w-3 h-3" /> {markets.length} market{markets.length === 1 ? "" : "s"}</span>
              <span>· {campaign.customerRules.length} customer override{campaign.customerRules.length === 1 ? "" : "s"}</span>
              {geo.unresolved > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="w-3 h-3" /> {geo.unresolved} unresolved countr{geo.unresolved === 1 ? "y" : "ies"}</span>
              )}
            </div>
          </div>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {(
              [
                ["map", MapIcon, "Map"],
                ["markets", Layers, "Markets"],
                ["customers", Users, "Customers"],
              ] as const
            ).map(([v, Icon, label]) => (
              <button key={v} onClick={() => switchView(v)} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-[12px]", view === v ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          <Button size="sm" className="h-8" onClick={() => openMarket(null, selectedList)}><Plus className="w-3.5 h-3.5" /> New market</Button>
        </div>
        <div className="px-4 md:px-6 pb-2 flex items-center gap-2">
          <CampaignNav campaignId={campaignId} active="markets" compact />
          <div className="sm:hidden ml-auto flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {(["map", "markets", "customers"] as View[]).map((v) => (
              <button key={v} onClick={() => switchView(v)} className={cn("rounded-md px-2 py-1 text-[11px] capitalize", view === v ? "bg-muted text-foreground font-medium" : "text-muted-foreground")}>{v}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        {flash && <div className="mb-3 rounded-lg border border-lime-300/60 bg-lime-50 dark:bg-lime-950/30 px-3 py-2 text-[12px] text-lime-800 dark:text-lime-200">{flash}</div>}

        {view === "map" && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-surface overflow-hidden relative">
              {/* toolbar */}
              <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background/90 backdrop-blur-sm p-0.5 shadow-sm">
                  {(["europe", "world"] as MapMode[]).map((m) => (
                    <button key={m} onClick={() => setMode(m)} className={cn("rounded-md px-2 py-1 text-[11px] capitalize", mode === m ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>{m}</button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Find a customer…" className="h-8 w-56 pl-8 text-[12px] bg-background/90 backdrop-blur-sm shadow-sm" />
                  {searchHits.length > 0 && (
                    <div className="absolute left-0 top-full mt-1 w-72 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
                      {searchHits.map((h) => (
                        <button key={h.partnerMkId} type="button" onClick={() => { openCustomer(h.partnerMkId); setCustomerSearch(""); setSearchHits([]); }} className="w-full text-left px-3 py-1.5 hover:bg-muted text-[12px]">
                          <div className="font-medium text-foreground truncate">{h.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{[h.city, h.countryIso ? `${flagEmoji(h.countryIso)} ${countryNames[h.countryIso] ?? h.countryIso}` : null].filter(Boolean).join(" · ")}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {pickingPin && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-lime-600 text-white px-2.5 py-1 text-[11px] font-medium shadow-sm">
                    Click the map to place the pin <button type="button" onClick={() => setPickingPin(false)} aria-label="Cancel"><X className="w-3 h-3" /></button>
                  </span>
                )}
              </div>

              {/* selection toolbar */}
              {selectedList.length > 0 && !pickingPin && (
                <div className="absolute left-1/2 -translate-x-1/2 top-3 z-10 flex items-center gap-2 rounded-xl border border-lime-300/70 bg-background/95 backdrop-blur-sm shadow-lg px-3 py-1.5">
                  <span className="text-[12px] font-medium text-foreground tabular-nums">
                    {selectedList.length} selected
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground hidden md:inline">{selectedList.slice(0, 6).map((i) => flagEmoji(i)).join(" ")}{selectedList.length > 6 ? " …" : ""}</span>
                  </span>
                  <span className="w-px h-5 bg-border" />
                  <Button size="xs" onClick={() => openMarket(null, selectedList)}><Plus className="w-3 h-3" /> Create market</Button>
                  {markets.length > 0 && (
                    <div className="relative group">
                      <Button size="xs" variant="outline"><Layers className="w-3 h-3" /> Add to market</Button>
                      <div className="absolute left-0 top-full mt-1 hidden group-hover:block group-focus-within:block min-w-[180px] rounded-lg border border-border bg-background shadow-lg p-1 z-20">
                        {markets.map((m) => (
                          <button key={m.id} type="button" onClick={() => assignSelected(m.id)} className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-muted text-left">
                            <span className="size-2 rounded-full" style={{ background: MARKET_COLORS[m.color].hex }} /> {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {marketsOfSelection.size > 0 && (
                    <Button size="xs" variant="ghost" onClick={() => assignSelected(null)}>Remove from market</Button>
                  )}
                  <button type="button" onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground" aria-label="Clear selection"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}

              <div className="aspect-[1000/620] w-full">
                <CountryMap
                  mode={mode}
                  markets={markets}
                  stats={stats}
                  pins={geo.manualPins}
                  selected={selected}
                  hoveredIso={hovered}
                  onHover={setHovered}
                  onSelect={onSelect}
                  onOpenCountry={openCountry}
                  onOpenPin={openCustomer}
                  pickMode={pickingPin}
                  onMapClick={(lng, lat) => setPickedPin({ lat, lng })}
                  className="w-full h-full"
                />
              </div>

              {/* hover readout */}
              <div className="absolute left-3 bottom-3 z-10 flex flex-col gap-2 items-start">
                {hovered && (
                  <div className="rounded-lg border border-border bg-background/90 backdrop-blur-sm shadow-sm px-2.5 py-1.5 text-[12px]">
                    <span className="font-medium text-foreground">{flagEmoji(hovered)} {countryNames[hovered] ?? hovered}</span>
                    {(() => {
                      const m = markets.find((x) => x.countries.includes(hovered));
                      const s = stats[hovered];
                      return (
                        <span className="text-muted-foreground">
                          {m ? ` · ${m.name}` : " · no market"}
                          {s ? ` · ${s.customers} customers${s.unlocked ? `, ${s.unlocked} unlocked` : ""}` : ""}
                        </span>
                      );
                    })()}
                  </div>
                )}
                <MarketLegend markets={markets} stats={stats} onOpen={(id) => openMarket(id)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Click a country to select it, shift-click or shift-drag to add more, double-click or click a bubble to see its customers. Bubbles count every partner in the directory ({geo.totalCustomers}); countries outside Europe are on the World view.
              {geo.totalCustomers === 0 && (
                <button type="button" onClick={startSync} className="ml-1 inline-flex items-center gap-1 font-medium text-lime-700 dark:text-lime-400 hover:underline"><RefreshCw className="w-3 h-3" /> Sync the directory from Metakocka</button>
              )}
            </p>
          </div>
        )}

        {view === "markets" && <MarketsTable markets={markets} stats={stats} countryNames={countryNames} onEdit={(id) => openMarket(id)} onCreate={() => openMarket(null, [])} />}

        {view === "customers" && (
          <CustomersTable campaignId={campaignId} markets={markets} countryNames={countryNames} syncing={syncing} syncInfo={syncInfo} onSync={startSync} onOpen={openCustomer} reloadKey={customersReload} />
        )}
      </div>

      {/* drawers */}
      <MarketDrawer
        open={drawer?.type === "market"}
        onOpenChange={(o) => !o && setDrawer(null)}
        campaign={campaign}
        market={drawerMarket}
        seedCountries={drawer?.type === "market" ? drawer.seed : []}
        countryNames={countryNames}
        pricelists={pricelists}
        customerCount={drawerCustomerCount}
        onSave={saveMarket}
        onDelete={deleteMarket}
        onAddSelected={() => {
          if (drawer?.type === "market") setDrawer({ ...drawer, seed: Array.from(new Set([...(drawerMarket?.countries ?? drawer.seed), ...selectedList])) });
        }}
        selectedCount={selectedList.filter((iso) => !(drawerMarket?.countries ?? []).includes(iso)).length}
      />
      <CustomerDrawer
        open={drawer?.type === "customer"}
        onOpenChange={(o) => !o && setDrawer(null)}
        campaignId={campaignId}
        campaign={campaign}
        partnerMkId={drawer?.type === "customer" ? drawer.partnerMkId : null}
        countryNames={countryNames}
        pricelists={pricelists}
        inviteUrl={inviteUrl}
        pickingPin={pickingPin}
        onPickPin={(on) => {
          setPickingPin(on);
          if (on) switchView("map");
        }}
        pickedPin={pickedPin}
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
          if (drawer?.type === "country") await assignSelected(marketId, [drawer.iso]);
        }}
        onOpenCustomer={openCustomer}
      />
    </div>
  );
}

// Structural twin for the initial load.
function MarketsSkeleton({ campaignId }: { campaignId: string }) {
  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 md:px-6 h-14">
          <Link href="/preorder" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="min-w-0">
            <SkeletonLine lh="h-[19px]" h="h-3.5" w="w-48" />
            <div className="flex items-center gap-2 h-[19.5px]">
              <Skeleton className="h-[19.5px] w-12 rounded-full" delay={40} />
              <Skeleton className="h-2.5 w-32" delay={60} />
            </div>
          </div>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <span className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] bg-muted text-foreground font-medium"><MapIcon className="w-3.5 h-3.5" /> Map</span>
            <span className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground"><Layers className="w-3.5 h-3.5" /> Markets</span>
            <span className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground"><Users className="w-3.5 h-3.5" /> Customers</span>
          </div>
          <Button size="sm" className="h-8" disabled><Plus className="w-3.5 h-3.5" /> New market</Button>
        </div>
        <div className="px-4 md:px-6 pb-2">
          <CampaignNav campaignId={campaignId} active="markets" compact />
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="aspect-[1000/620] w-full flex items-center justify-center">
            <Skeleton className="w-[92%] h-[86%] rounded-2xl" />
          </div>
        </div>
        <SkeletonLine lh="h-[18px]" w="w-2/3" className="mt-3" delay={120} />
        <p className="sr-only"><List className="w-3 h-3" /></p>
      </div>
    </div>
  );
}
