import { NextResponse } from "next/server";
import { searchProducts, getProduct, getCatalogueCodes } from "@/lib/product-api";
import { getMkProductIndex, searchMkSalesProducts } from "@/lib/metakocka";
import type { CatalogueProduct, ProductSearchHit } from "@/types/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A parent-level search result for the builder's picker. `source: "metakocka"` marks a
// product that exists only in Metakocka (the catalogue is built from PNV, so it never
// sees it) — it has no variants or image; /products/resolve builds its row from MK.
export type ParentHit = {
  code: string; // PARENT code
  name: string; // parent product_name
  image: string | null;
  source: "catalogue" | "metakocka";
};

const MAX_CANDIDATES = 15;
// MK-only hits get their own budget so a broad query full of catalogue hits still shows them.
const MAX_MK_CANDIDATES = 10;

// GET /api/admin/preorder/products/search?q=... — search the catalogue and return only
// PARENT products. Child/variant matches are collapsed to their parent, so each parent
// appears once (add it to expand into a group of variants via /products/resolve).
// Metakocka-only products are appended after the catalogue hits. Metakocka is the source
// of truth: a catalogue product MK doesn't have (neither it nor any of its variants) is
// not offered at all.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ candidates: [] });

  const [res, mkHits, catalogueCodes, mkIndex] = await Promise.all([
    searchProducts(q),
    searchMkSalesProducts(q, 50),
    getCatalogueCodes(),
    getMkProductIndex(),
  ]);
  const hits = res.ok ? ((res.data ?? []) as ProductSearchHit[]) : [];

  // Resolve the top hits to their parent product (getProduct returns the parent whether
  // the code is a parent or a child SKU), then dedupe by parent code. Bounded so a broad
  // query doesn't fan out to hundreds of upstream calls.
  const seen = new Set<string>();
  const uniqueHitCodes: string[] = [];
  for (const h of hits) {
    if (seen.has(h.code)) continue;
    seen.add(h.code);
    uniqueHitCodes.push(h.code);
    if (uniqueHitCodes.length >= 20) break;
  }

  const byParent = new Map<string, ParentHit>();
  await Promise.all(
    uniqueHitCodes.map(async (code) => {
      const pr = await getProduct(code);
      if (!pr.ok || !pr.data) return;
      const p = pr.data as CatalogueProduct;
      if (byParent.has(p.code)) return;
      const inMk = !mkIndex || [p, ...(p.child_products ?? [])].some((n) => mkIndex.has(n.code));
      if (!inMk) return;
      byParent.set(p.code, {
        code: p.code,
        name: p.product_name,
        image: p.images?.[0] ?? null,
        source: "catalogue",
      });
    }),
  );

  const candidates = Array.from(byParent.values()).slice(0, MAX_CANDIDATES);
  // Only when the catalogue's code set is known — otherwise an MK hit could be a
  // catalogue product (or one of its variants) listed twice.
  if (catalogueCodes) {
    let mkCount = 0;
    for (const p of mkHits) {
      if (mkCount >= MAX_MK_CANDIDATES) break;
      if (catalogueCodes.has(p.code) || byParent.has(p.code)) continue;
      mkCount++;
      candidates.push({ code: p.code, name: p.name, image: null, source: "metakocka" });
    }
  }

  const error = res.ok ? undefined : res.error;
  return NextResponse.json({ candidates, ...(error ? { error } : {}) });
}
