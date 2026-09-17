import { NextResponse } from "next/server";
import { getProduct } from "@/lib/product-api";
import { getMkProductPrices, pickMkListGrossPrice, pickMkListNetPrice, productTaxCode } from "@/lib/metakocka";
import type { CatalogueProduct, ProductPrice } from "@/types/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-apply the campaign's chosen price lists to a set of catalogue rows (by SKU).
// Used when the admin changes the RRP / partner price-list selection after products
// were already added. Prices for a selected list come straight from Metakocka (with
// tier discounts applied). A column with no list selected falls back to the catalogue
// name heuristic so it isn't wiped.

type RepricePrices = { rrp: number | null; partnerPrice: number | null; taxCode: string | null };

// Catalogue-name heuristic fallback (used only for a column with no MK list chosen).
function heuristicPrice(
  parent: CatalogueProduct,
  code: string,
  re: RegExp,
): number | null {
  const node =
    parent.code === code
      ? parent
      : (parent.child_products ?? []).find((c) => c.code === code) ?? parent;
  const list: ProductPrice[] | undefined = node.pricelist?.length ? node.pricelist : parent.pricelist;
  if (!list || list.length === 0) return null;
  const hit = list.find((x) => re.test(x.name));
  return (hit ?? list[0]).price ?? null;
}

// POST { codes: string[], rrpPricelist?, partnerPricelist? } → { prices: { [code]: { rrp, partnerPrice } } }
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    codes?: string[];
    rrpPricelist?: string | null;
    partnerPricelist?: string | null;
  };
  const codes = (body.codes ?? [])
    .map((c) => String(c).trim())
    .filter(Boolean)
    .slice(0, 1000);
  const rrpTitle = body.rrpPricelist ?? null;
  const partnerTitle = body.partnerPricelist ?? null;
  if (codes.length === 0) return NextResponse.json({ prices: {} });

  // MK is authoritative for whichever columns have a list selected.
  const mk = rrpTitle || partnerTitle ? await getMkProductPrices(codes) : {};

  // The catalogue heuristic is only needed for a column with no list selected.
  const needCatalogue = !rrpTitle || !partnerTitle;
  const catalogueByCode: Record<string, CatalogueProduct | null> = {};
  if (needCatalogue) {
    await Promise.all(
      codes.map(async (code) => {
        const res = await getProduct(code);
        catalogueByCode[code] = res.ok && res.data ? (res.data as CatalogueProduct) : null;
      }),
    );
  }

  const prices: Record<string, RepricePrices> = {};
  for (const code of codes) {
    const parent = catalogueByCode[code];
    const rrp = rrpTitle
      ? pickMkListGrossPrice(mk[code], rrpTitle, { untaxedIsNet: false })
      : parent
        ? heuristicPrice(parent, code, /rrp|retail|msrp/i)
        : null;
    // Partner price is NET (excl. VAT); RRP is gross (consumer price incl. VAT).
    const partnerPrice = partnerTitle
      ? pickMkListNetPrice(mk[code], partnerTitle)
      : parent
        ? heuristicPrice(parent, code, /partner/i)
        : null;
    // The MK tax code rides along so submissions can be pushed without re-reading prices.
    prices[code] = { rrp, partnerPrice, taxCode: mk[code]?.length ? productTaxCode(mk[code]) : null };
  }
  return NextResponse.json({ prices });
}
