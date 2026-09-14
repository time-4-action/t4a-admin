// scripts/build-geo.ts
//
// One-off preprocessing of the world-atlas TopoJSON into the two GeoJSON files the
// Preorder markets map fetches at runtime (public/geo/*.json). Run with
// `npm run geo:build` whenever world-atlas is upgraded; the output is committed.
//
//   public/geo/europe-50m.json — 50 m detail, Europe only (110 m loses Luxembourg,
//                                Malta, Liechtenstein — unclickable on the default view)
//   public/geo/world-110m.json — 110 m detail, every country (the "World" toggle)
//
// Each feature gets `id` = ISO 3166-1 alpha-2 and `properties.{iso, name, centroid}`
// where `centroid` is the centroid of the feature's LARGEST polygon (the plain
// multipolygon centroid of France, Norway or the US lands in the sea).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { feature } from "topojson-client";
import { geoArea, geoCentroid } from "d3-geo";
import countries from "i18n-iso-countries";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import type { Topology, GeometryCollection } from "topojson-specification";
import { EUROPE_ISO } from "../lib/countries-client";

type Props = { name?: string };

// world-atlas uses -99 for territories without a numeric ISO code.
const MANUAL_IDS: Record<string, string> = { Kosovo: "XK" };

function largestPolygonCentroid(geom: Geometry): [number, number] {
  if (geom.type === "Polygon") return geoCentroid(geom as Polygon) as [number, number];
  if (geom.type === "MultiPolygon") {
    let best: Polygon | null = null;
    let bestArea = -1;
    for (const coords of (geom as MultiPolygon).coordinates) {
      const poly: Polygon = { type: "Polygon", coordinates: coords };
      const a = geoArea(poly);
      if (a > bestArea) {
        bestArea = a;
        best = poly;
      }
    }
    return geoCentroid(best ?? geom) as [number, number];
  }
  return geoCentroid(geom) as [number, number];
}

// Round coordinates to 3 decimals (~100 m) — plenty for a country map, halves the file.
function roundGeometry(geom: Geometry): Geometry {
  const r = (n: number) => Number(n.toFixed(3));
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: geom.coordinates.map((ring) => ring.map(([x, y]) => [r(x), r(y)])) };
  }
  if (geom.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geom.coordinates.map((poly) => poly.map((ring) => ring.map(([x, y]) => [r(x), r(y)]))),
    };
  }
  return geom;
}

function convert(file: string, keep: ((iso: string) => boolean) | null): FeatureCollection {
  const topo = JSON.parse(readFileSync(require.resolve(`world-atlas/${file}`), "utf8")) as Topology;
  const fc = feature(topo, topo.objects.countries as GeometryCollection<Props>) as FeatureCollection<Geometry, Props>;
  const out: Feature[] = [];
  for (const f of fc.features) {
    const numeric = String(f.id ?? "");
    const name = f.properties?.name ?? "";
    let iso = numeric && numeric !== "-99" ? countries.numericToAlpha2(numeric.padStart(3, "0")) : undefined;
    if (!iso) iso = MANUAL_IDS[name];
    if (!iso) continue; // e.g. Northern Cyprus, Somaliland — no ISO code, dropped
    if (keep && !keep(iso)) continue;
    const [lng, lat] = largestPolygonCentroid(f.geometry);
    out.push({
      type: "Feature",
      id: iso,
      geometry: roundGeometry(f.geometry),
      properties: { iso, name, centroid: [Number(lng.toFixed(3)), Number(lat.toFixed(3))] },
    });
  }
  out.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { type: "FeatureCollection", features: out };
}

const outDir = resolve(__dirname, "../public/geo");
mkdirSync(outDir, { recursive: true });
const europe = new Set(EUROPE_ISO);
const eu = convert("countries-50m.json", (iso) => europe.has(iso));
const world = convert("countries-110m.json", null);
writeFileSync(resolve(outDir, "europe-50m.json"), JSON.stringify(eu));
writeFileSync(resolve(outDir, "world-110m.json"), JSON.stringify(world));
console.log(`europe-50m: ${eu.features.length} features, world-110m: ${world.features.length} features`);
