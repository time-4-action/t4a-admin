import { NextResponse } from "next/server";
import { getProduct } from "@/lib/product-api";
import type { CatalogueProduct } from "@/types/product";
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

function pickPrice(list: CatalogueProduct["pricelist"], re: RegExp): number | null {
  if (!list || list.length === 0) return null;
  const hit = list.find((x) => re.test(x.name));
  return (hit ?? list[0]).price ?? null;
}

// Map one catalogue node (parent or child) to a preorder row, inheriting the parent's
// price/image when the child omits them.
function nodeToRow(node: CatalogueProduct, parent: CatalogueProduct): RowDraft {
  const list = node.pricelist?.length ? node.pricelist : parent.pricelist;
  return {
    source: "catalogue",
    code: node.code,
    ean: node.ean_code ?? null,
    name: node.product_name || parent.product_name,
    variantLabel: node.code !== parent.code ? node.product_name || null : null,
    size: null,
    tag: node.published === false ? "pre-order only" : null,
    rrp: pickPrice(list, /rrp|retail|msrp/i),
    partnerPrice: pickPrice(list, /partner/i),
    discountedPrice: null,
    image: node.images?.[0] ?? parent.images?.[0] ?? null,
  };
}

// Expand a resolved parent into a group. `onlyChildCodes`, when given, keeps just those
// specific variant codes (used by CSV import of individual SKUs).
function expand(parent: CatalogueProduct, onlyChildCodes?: Set<string>): ProductGroupDraft {
  const children = parent.child_products ?? [];
  let rows: RowDraft[];
  if (children.length === 0) {
    rows = [nodeToRow(parent, parent)];
  } else if (onlyChildCodes && onlyChildCodes.size > 0) {
    rows = children
      .filter((c) => onlyChildCodes.has(c.code))
      .map((c) => nodeToRow(c, parent));
    if (rows.length === 0) rows = children.map((c) => nodeToRow(c, parent));
  } else {
    rows = children.map((c) => nodeToRow(c, parent));
  }
  return {
    name: parent.product_name,
    parentCode: parent.code,
    description: parent.description ?? null,
    images: (parent.images ?? []).filter(Boolean).slice(0, 8),
    rows,
  };
}

// POST body: { code } → single group, OR { codes: string[] } → one group per parent,
// keeping only the requested variant SKUs when a child code was supplied.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    codes?: string[];
  };

  // ── Single parent ──
  if (body.code) {
    const res = await getProduct(body.code.trim());
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ group: expand(res.data as CatalogueProduct) });
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
    codes.map(async (code) => {
      const res = await getProduct(code);
      if (!res.ok || !res.data) {
        notFound.push(code);
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
    expand(parent, wanted),
  );
  return NextResponse.json({ groups, notFound });
}
