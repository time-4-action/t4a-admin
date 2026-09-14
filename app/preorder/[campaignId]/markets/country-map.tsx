"use client";

// app/preorder/[campaignId]/markets/country-map.tsx
//
// The interactive territory map: countries painted by market, click / shift-click /
// shift-drag selection, per-country customer bubbles, manual customer pins (grid-
// clustered), market labels, hand-rolled pan & zoom on a <g transform>. Loaded with
// next/dynamic({ ssr: false }) — hundreds of path strings have no business in the HTML.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MARKET_COLORS } from "@/app/preorder/preorder-badges";
import type { MarketColor } from "@/types/preorder";
import {
  MAP_H,
  MAP_W,
  clusterPoints,
  loadFeatures,
  makeProjection,
  projectCountries,
  projectPoint,
  type MapMode,
  type ProjectedCountry,
} from "./map-data";

export type MapMarket = { id: string; name: string; color: MarketColor; countries: string[] };
export type MapCountryStat = { customers: number; unlocked: number; submitted: number; published: number; overrides: number };
export type MapPin = { partnerMkId: string; name: string; lat: number; lng: number; countryIso: string | null };

type Transform = { k: number; x: number; y: number };
const MIN_K = 1;
const MAX_K = 8;

export function CountryMap({
  mode,
  markets,
  stats,
  pins,
  selected,
  hoveredIso,
  onHover,
  onSelect,
  onOpenCountry,
  onOpenPin,
  onMapClick,
  pickMode,
  className,
}: {
  mode: MapMode;
  markets: MapMarket[];
  stats: Record<string, MapCountryStat>;
  pins: MapPin[];
  selected: ReadonlySet<string>;
  hoveredIso: string | null;
  onHover: (iso: string | null) => void;
  /** click / shift-click / marquee. `additive` = extend the current selection. */
  onSelect: (isos: string[], additive: boolean) => void;
  onOpenCountry: (iso: string) => void;
  onOpenPin: (partnerMkId: string) => void;
  /** When `pickMode` is on, a click on the map reports lng/lat instead of selecting. */
  onMapClick?: (lng: number, lat: number) => void;
  pickMode?: boolean;
  className?: string;
}) {
  const [countries, setCountries] = useState<ProjectedCountry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projection = useMemo(() => makeProjection(mode), [mode]);
  const [t, setT] = useState<Transform>({ k: 1, x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean; marquee: boolean } | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  useEffect(() => {
    let alive = true;
    setCountries(null);
    loadFeatures(mode)
      .then((f) => alive && setCountries(projectCountries(f, projection)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "map failed to load"));
    return () => {
      alive = false;
    };
  }, [mode, projection]);

  useEffect(() => setT({ k: 1, x: 0, y: 0 }), [mode]);

  const marketByIso = useMemo(() => {
    const m = new Map<string, MapMarket>();
    for (const mk of markets) for (const iso of mk.countries) m.set(iso, mk);
    return m;
  }, [markets]);

  const byIso = useMemo(() => new Map((countries ?? []).map((c) => [c.iso, c])), [countries]);

  // Market label = mean of its countries' centroids (only countries on this map).
  const marketLabels = useMemo(() => {
    return markets
      .map((m) => {
        const pts = m.countries.map((iso) => byIso.get(iso)?.centroid).filter((c): c is [number, number] => !!c);
        if (!pts.length) return null;
        return { id: m.id, name: m.name, color: m.color, x: pts.reduce((a, p) => a + p[0], 0) / pts.length, y: pts.reduce((a, p) => a + p[1], 0) / pts.length, n: pts.length };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [markets, byIso]);

  const projectedPins = useMemo(
    () =>
      pins
        .map((p) => {
          const pt = projectPoint(projection, p.lng, p.lat);
          return pt ? { ...p, x: pt[0], y: pt[1] } : null;
        })
        .filter((p): p is NonNullable<typeof p> => !!p),
    [pins, projection],
  );
  const kRounded = Math.round(t.k * 4) / 4;
  const clusters = useMemo(() => clusterPoints(projectedPins, kRounded), [projectedPins, kRounded]);

  // ── pan / zoom ──
  const clamp = (n: Transform): Transform => {
    const k = Math.min(MAX_K, Math.max(MIN_K, n.k));
    const maxX = 0;
    const minX = MAP_W - MAP_W * k;
    const maxY = 0;
    const minY = MAP_H - MAP_H * k;
    return { k, x: Math.min(maxX, Math.max(minX, n.x)), y: Math.min(maxY, Math.max(minY, n.y)) };
  };

  const toLocal = useCallback((clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const r = svg.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * MAP_W, ((clientY - r.top) / r.height) * MAP_H];
  }, []);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setT((prev) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
      const scale = k / prev.k;
      return clamp({ k, x: cx - (cx - prev.x) * scale, y: cy - (cy - prev.y) * scale });
    });
  }, []);

  // React attaches onWheel passively; preventDefault() would be a no-op there.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [cx, cy] = toLocal(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, cx, cy);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toLocal, zoomAt]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const [x, y] = toLocal(e.clientX, e.clientY);
    drag.current = { x, y, tx: t.x, ty: t.y, moved: false, marquee: e.shiftKey && !pickMode };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = toLocal(e.clientX, e.clientY);
    if (Math.abs(x - d.x) + Math.abs(y - d.y) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.marquee) setMarquee({ x0: d.x, y0: d.y, x1: x, y1: y });
    else setT((prev) => clamp({ ...prev, x: d.tx + (x - d.x), y: d.ty + (y - d.y) }));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.marquee && d.moved && marquee) {
      const x0 = Math.min(marquee.x0, marquee.x1);
      const x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1);
      const y1 = Math.max(marquee.y0, marquee.y1);
      const hit = (countries ?? [])
        .filter((c) => c.centroid)
        .filter((c) => {
          const sx = c.centroid![0] * t.k + t.x;
          const sy = c.centroid![1] * t.k + t.y;
          return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1;
        })
        .map((c) => c.iso);
      onSelect(hit, true);
      setMarquee(null);
      return;
    }
    setMarquee(null);
    if (d.moved) return;
    // A plain click on empty ocean.
    const target = e.target as Element;
    if (target === svgRef.current || target.getAttribute("data-bg") === "1") {
      if (pickMode && onMapClick) {
        const [x, y] = toLocal(e.clientX, e.clientY);
        const inv = projection.invert?.([(x - t.x) / t.k, (y - t.y) / t.k]);
        if (inv) onMapClick(inv[0], inv[1]);
        return;
      }
      onSelect([], false);
    }
  };

  const countryClick = (iso: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (drag.current?.moved) return;
    if (pickMode && onMapClick) {
      const [x, y] = toLocal(e.clientX, e.clientY);
      const inv = projection.invert?.([(x - t.x) / t.k, (y - t.y) / t.k]);
      if (inv) onMapClick(inv[0], inv[1]);
      return;
    }
    onSelect([iso], e.shiftKey || e.metaKey || e.ctrlKey);
  };

  const fitAll = () => setT({ k: 1, x: 0, y: 0 });

  if (error) {
    return <div className={cn("flex items-center justify-center text-[13px] text-destructive", className)}>Map data failed to load: {error}</div>;
  }

  const strokeW = 0.8 / t.k;
  const bubbleScale = 1 / t.k;

  return (
    <div className={cn("relative select-none", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className={cn("w-full h-full touch-none", pickMode ? "cursor-crosshair" : drag.current?.moved ? "cursor-grabbing" : "cursor-grab")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setMarquee(null);
        }}
        role="img"
        aria-label="Markets map"
      >
        <rect data-bg="1" x={0} y={0} width={MAP_W} height={MAP_H} fill="transparent" />
        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
          {/* countries */}
          {(countries ?? []).map((c) => {
            const m = marketByIso.get(c.iso);
            const isSel = selected.has(c.iso);
            const isHover = hoveredIso === c.iso;
            const fill = m ? MARKET_COLORS[m.color].hex : "var(--map-land)";
            return (
              <path
                key={c.iso}
                d={c.d}
                fill={fill}
                fillOpacity={m ? (isSel || isHover ? 0.7 : 0.42) : isSel || isHover ? 0.55 : 0.28}
                stroke={isSel ? "#65a30d" : "var(--map-border)"}
                strokeWidth={isSel ? 2.2 / t.k : strokeW}
                strokeLinejoin="round"
                className="transition-[fill-opacity] duration-150 cursor-pointer"
                onMouseEnter={() => onHover(c.iso)}
                onMouseLeave={() => onHover(null)}
                onClick={(e) => countryClick(c.iso, e)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onOpenCountry(c.iso);
                }}
              >
                <title>{c.name}{m ? ` · ${m.name}` : ""}{stats[c.iso]?.customers ? ` · ${stats[c.iso].customers} customers` : ""}</title>
              </path>
            );
          })}

          {/* market labels */}
          {marketLabels.map((l) => (
            <g key={l.id} transform={`translate(${l.x} ${l.y}) scale(${bubbleScale})`} className="pointer-events-none">
              <text
                textAnchor="middle"
                y={-14}
                fontSize={11}
                fontWeight={700}
                fill={MARKET_COLORS[l.color].hex}
                stroke="var(--map-halo)"
                strokeWidth={3.5}
                paintOrder="stroke"
                style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
              >
                {l.name}
              </text>
            </g>
          ))}

          {/* customer bubbles per country */}
          {(countries ?? []).map((c) => {
            const s = stats[c.iso];
            if (!s || !c.centroid || s.customers <= 0) return null;
            const r = Math.min(20, 5 + Math.sqrt(s.customers) * 1.9);
            const m = marketByIso.get(c.iso);
            const color = m ? MARKET_COLORS[m.color].hex : "#64748b";
            return (
              <g
                key={`b-${c.iso}`}
                transform={`translate(${c.centroid[0]} ${c.centroid[1]}) scale(${bubbleScale})`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCountry(c.iso);
                }}
                onMouseEnter={() => onHover(c.iso)}
                onMouseLeave={() => onHover(null)}
              >
                <circle r={r + 2} fill="var(--map-halo)" fillOpacity={0.9} />
                <circle r={r} fill={color} fillOpacity={0.92} stroke="#fff" strokeWidth={1.2} />
                <text textAnchor="middle" dy={r > 9 ? 3.5 : 3} fontSize={r > 9 ? 10 : 8} fontWeight={700} fill="#fff">
                  {s.customers}
                </text>
                <title>
                  {c.name}: {s.customers} customers · {s.unlocked} unlocked · {s.submitted} submitted{s.overrides ? ` · ${s.overrides} overrides` : ""}
                </title>
              </g>
            );
          })}

          {/* manual pins, clustered */}
          {clusters.map((cl, i) => (
            <g
              key={`p-${i}`}
              transform={`translate(${cl.x} ${cl.y}) scale(${bubbleScale})`}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (cl.items.length === 1) onOpenPin(cl.items[0].partnerMkId);
                else zoomAt(2, cl.x * t.k + t.x, cl.y * t.k + t.y);
              }}
            >
              {cl.items.length === 1 ? (
                <>
                  <path d="M0 -9 L6 0 L0 9 L-6 0 Z" fill="#65a30d" stroke="#fff" strokeWidth={1.4} />
                  <title>{cl.items[0].name}</title>
                </>
              ) : (
                <>
                  <circle r={9} fill="#65a30d" stroke="#fff" strokeWidth={1.4} />
                  <text textAnchor="middle" dy={3.5} fontSize={9} fontWeight={700} fill="#fff">{cl.items.length}</text>
                  <title>{cl.items.length} pinned customers — click to zoom</title>
                </>
              )}
            </g>
          ))}
        </g>

        {marquee && (
          <rect
            x={Math.min(marquee.x0, marquee.x1)}
            y={Math.min(marquee.y0, marquee.y1)}
            width={Math.abs(marquee.x1 - marquee.x0)}
            height={Math.abs(marquee.y1 - marquee.y0)}
            fill="#65a30d"
            fillOpacity={0.12}
            stroke="#65a30d"
            strokeDasharray="4 3"
            strokeWidth={1.2}
            className="pointer-events-none"
          />
        )}
      </svg>

      {!countries && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading map…
        </div>
      )}

      {/* zoom controls */}
      <div className="absolute right-3 bottom-3 flex flex-col rounded-lg border border-border bg-background/90 backdrop-blur-sm shadow-sm overflow-hidden">
        <button type="button" onClick={() => zoomAt(1.4, MAP_W / 2, MAP_H / 2)} className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground" aria-label="Zoom in"><Plus className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => zoomAt(1 / 1.4, MAP_W / 2, MAP_H / 2)} className="p-1.5 border-t border-border hover:bg-muted text-muted-foreground hover:text-foreground" aria-label="Zoom out"><Minus className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={fitAll} className="p-1.5 border-t border-border hover:bg-muted text-muted-foreground hover:text-foreground" aria-label="Reset view"><Maximize2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}
