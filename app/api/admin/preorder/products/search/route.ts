import { NextResponse } from "next/server";
import { searchProducts, getProduct } from "@/lib/product-api";
import type { CatalogueProduct, ProductSearchHit } from "@/types/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A parent-level search result for the builder's picker.
export type ParentHit = {
  code: string; // PARENT code
  name: string; // parent product_name
  image: string | null;
};

// GET /api/admin/preorder/products/search?q=... — search the catalogue and return only
// PARENT products. Child/variant matches are collapsed to their parent, so each parent
// appears once (add it to expand into a group of variants via /products/resolve).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ candidates: [] });

  const res = await searchProducts(q);
  if (!res.ok) {
    return NextResponse.json({ candidates: [], error: res.error }, { status: 200 });
  }
  const hits = (res.data ?? []) as ProductSearchHit[];

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
      byParent.set(p.code, {
        code: p.code,
        name: p.product_name,
        image: p.images?.[0] ?? null,
      });
    }),
  );

  return NextResponse.json({ candidates: Array.from(byParent.values()).slice(0, 15) });
}
