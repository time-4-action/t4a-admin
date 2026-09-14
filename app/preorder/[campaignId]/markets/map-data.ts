"use client";

// app/preorder/[campaignId]/markets/map-data.ts
//
// Geometry for the Markets & Customers map. The GeoJSON files under public/geo are
// produced by scripts/build-geo.ts (world-atlas → ISO-2 ids + a "largest polygon"
// centroid per country) and fetched at mount — never bundled into the JS chunk.
// Path strings are memoised per projection; pan/zoom is a transform on the <g>.

import { geoConicConformal, geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";

export type MapMode = "europe" | "world";

export type CountryFeature = Feature<Geometry, { iso: string; name: string; centroid: [number, number] }>;

export const MAP_W = 1000;
export const MAP_H = 620;

const cache = new Map<MapMode, Promise<CountryFeature[]>>();

export function loadFeatures(mode: MapMode): Promise<CountryFeature[]> {
  let p = cache.get(mode);
  if (!p) {
    const file = mode === "europe" ? "/geo/europe-50m.json" : "/geo/world-110m.json";
    p = fetch(file)
      .then((r) => {
        if (!r.ok) throw new Error(`geo ${r.status}`);
        return r.json() as Promise<FeatureCollection<Geometry, { iso: string; name: string; centroid: [number, number] }>>;
      })
      .then((fc) => fc.features as CountryFeature[]);
    cache.set(mode, p);
  }
  return p;
}

// Europe: conic conformal fitted to a fixed bbox (stable framing regardless of the
// countries in the file). World: Natural Earth fitted to the sphere.
export function makeProjection(mode: MapMode): GeoProjection {
  if (mode === "europe") {
    const bbox: Feature<Geometry> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-24, 34],
            [45, 34],
            [45, 72],
            [-24, 72],
            [-24, 34],
          ],
        ],
      },
    };
    return geoConicConformal().rotate([-10, 0]).parallels([40, 62]).fitExtent(
      [
        [16, 16],
        [MAP_W - 16, MAP_H - 16],
      ],
      bbox,
    );
  }
  return geoNaturalEarth1().fitExtent(
    [
      [8, 8],
      [MAP_W - 8, MAP_H - 8],
    ],
    { type: "Sphere" },
  );
}

export type ProjectedCountry = {
  iso: string;
  name: string;
  d: string;
  centroid: [number, number] | null; // projected (screen units before transform)
};

export function projectCountries(features: CountryFeature[], projection: GeoProjection): ProjectedCountry[] {
  const path = geoPath(projection);
  const out: ProjectedCountry[] = [];
  for (const f of features) {
    const d = path(f);
    if (!d) continue;
    const c = projection(f.properties.centroid);
    out.push({ iso: f.properties.iso, name: f.properties.name, d, centroid: c && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0], c[1]] : null });
  }
  return out;
}

export function projectPoint(projection: GeoProjection, lng: number, lat: number): [number, number] | null {
  const p = projection([lng, lat]);
  return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0], p[1]] : null;
}

// Screen-space grid clustering keyed on the zoom factor (cell ≈ 34 px on screen).
export type Cluster<T> = { x: number; y: number; items: T[] };

export function clusterPoints<T extends { x: number; y: number }>(points: T[], k: number): Cluster<T>[] {
  const cell = 34 / k;
  const buckets = new Map<string, T[]>();
  for (const p of points) {
    const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
    const b = buckets.get(key);
    if (b) b.push(p);
    else buckets.set(key, [p]);
  }
  return Array.from(buckets.values()).map((items) => ({
    x: items.reduce((a, p) => a + p.x, 0) / items.length,
    y: items.reduce((a, p) => a + p.y, 0) / items.length,
    items,
  }));
}
