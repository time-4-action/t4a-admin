// lib/preorder-refresh.ts — "Refresh products" in the sheet builder (pure).
//
// A migration pass over an existing sheet: brings every catalogue row back to what
// Metakocka says (SKU, name, EAN) and the catalogue shows (images), re-derives the
// automatic variant labels and merges single-product groups of one family (smart
// grouping). Prices, tags, fixed-price flags, restrictions and ids are never touched —
// that is Re-price's job. Uploaded images and labels an admin typed are kept.

import type { PreorderGroup, PreorderRow, PreorderTab } from "@/types/preorder";
import { smartGroup, type SmartGroupDraft } from "@/lib/preorder-smart-group";

// What /api/admin/preorder/products/refresh answers per row code (the row's CURRENT
// code — `code` is Metakocka's, which differs when the row carried a stale SKU).
export type ProductRefreshInfo = {
  code: string;
  name: string;
  ean: string | null;
  image: string | null; // the catalogue's image of this variant (null = none)
  groupImages: string[]; // the catalogue parent's images
};

// Images uploaded through the builder live under this path — never replaced.
export const isUploadedImage = (url: string | null | undefined) => !!url && url.includes("/uploads/media/preorder/");

// A spaced dash is its own word, also when it sticks to the one before ("MONO- red").
const words = (s: string) => s.replace(/\s*([-–—])\s+/g, " $1 ").trim().split(/\s+/).filter(Boolean);
const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

// The automatic label of each row in a group: what its name adds to the prefix all the
// group's names share ("… MONO - red" → "red"); a lone row has none.
export function autoLabels(names: string[]): (string | null)[] {
  if (names.length < 2) return names.map(() => null);
  const split = names.map(words);
  let n = 0;
  while (split.every((w) => n < w.length - 1 && same(w[n], split[0][n]))) n++;
  return names.map((name) => {
    const rest = words(name).slice(n).join(" ").replace(/^[-–—]\s*/, "");
    return rest || null;
  });
}

export type RefreshSummary = {
  skus: number; // rows whose SKU changed
  names: number;
  eans: number;
  images: number; // row + group images replaced
  labels: number;
  merged: number; // groups merged away
  notInMk: string[]; // codes Metakocka doesn't have (rows left as they are)
};

function refreshGroup(g: PreorderGroup, info: Record<string, ProductRefreshInfo>, sum: RefreshSummary): PreorderGroup {
  const oldAuto = autoLabels(g.rows.map((r) => r.name));
  const rows = g.rows.map((r): PreorderRow => {
    if (r.source !== "catalogue") return r;
    const i = info[r.code];
    if (!i) return r;
    const image = isUploadedImage(r.image) ? r.image : (i.image ?? r.image ?? null);
    if (i.code !== r.code) sum.skus++;
    if (i.name !== r.name) sum.names++;
    if ((i.ean ?? null) !== (r.ean ?? null)) sum.eans++;
    if (image !== (r.image ?? null)) sum.images++;
    return { ...r, code: i.code, name: i.name, ean: i.ean, image };
  });
  // A label is automatic when empty, the full (old or new) name, or the old derived one.
  const newAuto = autoLabels(rows.map((r) => r.name));
  const labelled = rows.map((r, idx) => {
    const old = g.rows[idx];
    if (r === old) return r; // not refreshed (manual, or not in Metakocka)
    const l = old.variantLabel?.trim() ?? "";
    const auto = !l || same(l, old.name) || same(l, r.name) || l === oldAuto[idx];
    if (!auto) return r;
    const next = newAuto[idx];
    if ((next ?? null) === (old.variantLabel ?? null)) return r;
    sum.labels++;
    return { ...r, variantLabel: next };
  });
  // A single-product group named after its product follows the product's new name.
  const lone = g.rows.length === 1 ? g.rows[0] : null;
  const name = lone && same(g.name.trim(), lone.name.trim()) ? labelled[0].name : g.name;
  // Group images follow the catalogue unless an admin uploaded one.
  const first = g.rows.find((r) => r.source === "catalogue" && info[r.code]);
  const catImages = first ? info[first.code].groupImages : [];
  const uploaded = (g.images ?? []).some(isUploadedImage);
  let images = g.images;
  if (!uploaded && catImages.length > 0 && catImages.join("\n") !== (g.images ?? []).join("\n")) {
    images = catImages;
    sum.images++;
  }
  return { ...g, name, images, rows: labelled };
}

// Smart grouping over a tab's existing groups: ids of rows and of the first group of
// every merge survive, the merged-away groups disappear.
function regroupTab(tab: PreorderTab, sum: RefreshSummary): PreorderTab {
  const out = smartGroup(tab.groups as unknown as SmartGroupDraft[]) as unknown as (PreorderGroup | SmartGroupDraft)[];
  const groupOfRow = new Map<string, PreorderGroup>();
  const labelOfRow = new Map<string, string | null>();
  for (const g of tab.groups)
    for (const r of g.rows) {
      groupOfRow.set(r.id, g);
      labelOfRow.set(r.id, r.variantLabel ?? null);
    }
  const groups = out.map((d, gi): PreorderGroup => {
    const rows = (d.rows as PreorderRow[]).map((r, ri) => ({ ...r, order: ri }));
    // Merging gives lone rows their family label ("red") — count it with the others.
    sum.labels += rows.filter((r) => (r.variantLabel ?? null) !== labelOfRow.get(r.id)).length;
    const base = "id" in d ? d : groupOfRow.get(rows[0].id)!;
    const images = base.images?.length ? base.images : (d.images ?? []);
    return { ...base, name: d.name, images, rows, order: gi };
  });
  sum.merged += tab.groups.length - groups.length;
  return { ...tab, groups };
}

// `info` is keyed by the rows' current codes; a catalogue row whose code is missing from
// it is left alone (and reported when `notInMk` lists it).
export function refreshTabs(
  tabs: PreorderTab[],
  info: Record<string, ProductRefreshInfo>,
  notInMk: string[] = [],
): { tabs: PreorderTab[]; summary: RefreshSummary } {
  const summary: RefreshSummary = { skus: 0, names: 0, eans: 0, images: 0, labels: 0, merged: 0, notInMk };
  const next = tabs.map((t) => regroupTab({ ...t, groups: t.groups.map((g) => refreshGroup(g, info, summary)) }, summary));
  return { tabs: next, summary };
}
