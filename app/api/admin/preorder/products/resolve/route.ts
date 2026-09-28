import { NextResponse } from "next/server";
import { getProduct, catalogueCodeForEan } from "@/lib/product-api";
import {
  getMkBarcodes,
  getMkProductPrices,
  getMkSalesProduct,
  pickMkListGrossPrice,
  pickMkListNetPrice,
  productTaxCode,
} from "@/lib/metakocka";
import type { CatalogueProduct } from "@/types/product";
import { withSmartLabels } from "@/lib/preorder-smart-group";
import type { MkProductPrice } from "@/types/documents";
import type { PreorderRow } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RowDraft = Omit<PreorderRow, "id" | "order">;

// A parent product expands into a group: named after the parent, filled with its child
// variants (or the product itself if it has no variants). Admins then delete unwanted rows.
export type ProductGroupDraft = {
  name: string;
  parentCode: string;
  description: string | null;
  images: string[];
  rows: RowDraft[];
};

// Which Metakocka price lists (by title/name) feed the two price columns. When a
// campaign specifies them explicitly we match on ProductPrice.name; otherwise we
// fall back to the built-in name heuristic.
export type PriceListSelection = {
  rrpPricelist?: string | null;
  partnerPricelist?: string | null;
};

// Resolve one price column: prefer an exact (case-insensitive) match on the chosen
// pricelist name; else the regex heuristic; else the first entry.
function pickPrice(
  list: CatalogueProduct["pricelist"],
  chosenName: string | null | undefined,
  re: RegExp,
): number | null {
  if (!list || list.length === 0) return null;
  if (chosenName) {
    const want = chosenName.trim().toLowerCase();
    const exact = list.find((x) => x.name?.trim().toLowerCase() === want);
    // With an explicit list selected, a miss means "no price in this list" — don't
    // silently fall back to an unrelated entry.
    return exact ? exact.price ?? null : null;
  }
  const hit = list.find((x) => re.test(x.name));
  return (hit ?? list[0]).price ?? null;
}

// Map one catalogue node (parent or child) to a preorder row, inheriting the parent's
// price/image when the child omits them.
function nodeToRow(
  node: CatalogueProduct,
  parent: CatalogueProduct,
  sel: PriceListSelection,
): RowDraft {
  const list = node.pricelist?.length ? node.pricelist : parent.pricelist;
  return {
    source: "catalogue",
    code: node.code,
    ean: node.ean_code ?? null,
    name: node.product_name || parent.product_name,
    variantLabel: node.code !== parent.code ? node.product_name || null : null,
    size: null,
    tag: node.published === false ? "pre-order only" : null,
    rrp: pickPrice(list, sel.rrpPricelist, /rrp|retail|msrp/i),
    partnerPrice: pickPrice(list, sel.partnerPricelist, /partner/i),
    discountedPrice: null,
    image: node.images?.[0] ?? parent.images?.[0] ?? null,
    taxCode: null,
  };
}

// Expand a resolved parent into a group. `onlyChildCodes`, when given, keeps just those
// specific variant codes (used by CSV import of individual SKUs).
function expand(
  parent: CatalogueProduct,
  sel: PriceListSelection,
  onlyChildCodes?: Set<string>,
): ProductGroupDraft {
  const children = parent.child_products ?? [];
  let rows: RowDraft[];
  if (children.length === 0) {
    rows = [nodeToRow(parent, parent, sel)];
  } else if (onlyChildCodes && onlyChildCodes.size > 0) {
    rows = children
      .filter((c) => onlyChildCodes.has(c.code))
      .map((c) => nodeToRow(c, parent, sel));
    if (rows.length === 0) rows = children.map((c) => nodeToRow(c, parent, sel));
  } else {
    rows = children.map((c) => nodeToRow(c, parent, sel));
  }
  // Variant labels = what differs between the variants ("80", "90"), not the full name.
  if (children.length > 0) rows = withSmartLabels(rows);
  return {
    name: parent.product_name,
    parentCode: parent.code,
    description: parent.description ?? null,
    images: (parent.images ?? []).filter(Boolean).slice(0, 8),
    rows,
  };
}

// A product that exists only in Metakocka (the catalogue is built from PNV and never
// sees it): one group holding one row, no image or description. Prices are filled by
// applyMkPrices like any other row.
async function mkOnlyGroup(code: string): Promise<ProductGroupDraft | null> {
  const p = await getMkSalesProduct(code);
  if (!p) return null;
  return {
    name: p.name,
    parentCode: p.code,
    description: null,
    images: [],
    rows: [
      {
        source: "catalogue",
        code: p.code,
        ean: p.barcode,
        name: p.name,
        variantLabel: null,
        size: null,
        tag: null,
        rrp: null,
        partnerPrice: null,
        discountedPrice: null,
        image: null,
        taxCode: null,
      },
    ],
  };
}

// Many MK-only products (old models) carry no sales price list at all. They come in at
// 0 rather than unpriced, so they stay orderable; the admin edits the price in the sheet.
// Run after applyMkPrices.
function zeroFillPrices(groups: ProductGroupDraft[]): void {
  for (const g of groups)
    for (const r of g.rows) {
      r.rrp ??= 0;
      r.partnerPrice ??= 0;
    }
}

// The MK list whose title matches the name heuristic — the MK counterpart of pickPrice
// for a column with no list chosen (an MK-only row has no catalogue prices to fall back on).
function heuristicMkTitle(entries: MkProductPrice[], re: RegExp): string | null {
  return entries.find((e) => re.test(e.title))?.title ?? null;
}

// Override the RRP / partner price columns straight from Metakocka for the selected
// lists (authoritative — the catalogue can't carry tier discounts): RRP is the GROSS
// retail price (VAT included, reference only), the partner price is NET (VAT excluded
// — what everyone orders at; individuals get VAT added on top). Catalogue-derived
// prices remain as the fallback when no list is selected or a product isn't priced in
// the chosen list. Mutates rows in place.
async function applyMkPrices(groups: ProductGroupDraft[], sel: PriceListSelection): Promise<void> {
  const codes = groups
    .flatMap((g) => g.rows)
    .filter((r) => r.source === "catalogue" && r.code)
    .map((r) => r.code);
  if (codes.length === 0) return;
  const [mk, barcodes] = await Promise.all([getMkProductPrices(codes), getMkBarcodes(codes)]);
  for (const g of groups)
    for (const r of g.rows) {
      if (r.source !== "catalogue") continue;
      // The catalogue misses many EANs — Metakocka's barcode fills the gap.
      if (!r.ean && barcodes[r.code]) r.ean = barcodes[r.code];
      const entries = mk[r.code];
      if (!entries) continue;
      // Always capture the MK tax code (needed to push a submission without re-reading).
      r.taxCode = productTaxCode(entries);
      const rrpTitle = sel.rrpPricelist || (r.rrp == null ? heuristicMkTitle(entries, /rrp|retail|msrp/i) : null);
      if (rrpTitle) {
        const p = pickMkListGrossPrice(entries, rrpTitle, { untaxedIsNet: false });
        if (p != null) r.rrp = p;
      }
      const partnerTitle =
        sel.partnerPricelist || (r.partnerPrice == null ? heuristicMkTitle(entries, /partner/i) : null);
      if (partnerTitle) {
        const p = pickMkListNetPrice(entries, partnerTitle);
        if (p != null) r.partnerPrice = p;
      }
    }
}

// Look a SKU or EAN up in the catalogue. /api/product/:code knows codes only, so a miss
// retries through the catalogue's EAN index. `code` is the matched parent / variant code
// (the EAN's own code, never the EAN), so a variant EAN keeps just that variant.
async function lookupCatalogue(input: string) {
  const res = await getProduct(input);
  if (res.ok && res.data) return { res, code: input };
  const code = await catalogueCodeForEan(input);
  if (!code) return { res, code: input };
  const byEan = await getProduct(code);
  return { res: byEan.ok && byEan.data ? byEan : res, code };
}

// POST body: { code } → single group, OR { codes: string[] } → one group per parent,
// keeping only the requested variant SKUs when a child code was supplied.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    codes?: string[];
    rrpPricelist?: string | null;
    partnerPricelist?: string | null;
  };
  const sel: PriceListSelection = {
    rrpPricelist: body.rrpPricelist ?? null,
    partnerPricelist: body.partnerPricelist ?? null,
  };

  // ── Single parent ──
  if (body.code) {
    const code = body.code.trim();
    const { res } = await lookupCatalogue(code);
    if (res.ok && res.data) {
      const group = expand(res.data as CatalogueProduct, sel);
      await applyMkPrices([group], sel);
      return NextResponse.json({ group });
    }
    // Not in the catalogue (or the catalogue is down) → maybe a Metakocka-only product.
    const group = await mkOnlyGroup(code);
    if (!group) {
      return res.ok
        ? NextResponse.json({ error: "Product not found." }, { status: 404 })
        : NextResponse.json({ error: res.error }, { status: res.status });
    }
    await applyMkPrices([group], sel);
    zeroFillPrices([group]);
    return NextResponse.json({ group });
  }

  // ── Batch CSV import ──
  const codes = (body.codes ?? [])
    .map((c) => String(c).trim())
    .filter(Boolean)
    .slice(0, 500);
  if (codes.length === 0) return NextResponse.json({ groups: [], notFound: [] });

  // Group requested codes by the parent they resolve to, tracking which specific child
  // SKUs were asked for so we can keep only those.
  const byParent = new Map<string, { parent: CatalogueProduct; wanted: Set<string> }>();
  const notFound: string[] = [];

  await Promise.all(
    codes.map(async (input) => {
      const { res, code } = await lookupCatalogue(input);
      if (!res.ok || !res.data) {
        notFound.push(input);
        return;
      }
      const parent = res.data as CatalogueProduct;
      const entry = byParent.get(parent.code) ?? { parent, wanted: new Set<string>() };
      // If the searched code is a child SKU (not the parent), remember it.
      if (code !== parent.code) entry.wanted.add(code);
      byParent.set(parent.code, entry);
    }),
  );

  const groups = Array.from(byParent.values()).map(({ parent, wanted }) =>
    expand(parent, sel, wanted),
  );
  // Codes the catalogue doesn't know may be Metakocka-only products (by code or barcode) —
  // one group each.
  const mkGroups: ProductGroupDraft[] = [];
  const stillMissing: string[] = [];
  for (const code of notFound) {
    const g = await mkOnlyGroup(code);
    if (!g) stillMissing.push(code);
    else if (!mkGroups.some((x) => x.parentCode === g.parentCode)) mkGroups.push(g);
  }
  groups.push(...mkGroups);
  await applyMkPrices(groups, sel);
  zeroFillPrices(mkGroups);
  return NextResponse.json({ groups, notFound: stillMissing });
}
