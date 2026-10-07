import { NextResponse } from "next/server";
import { getProduct } from "@/lib/product-api";
import { getMkProductIndex, getMkSalesProduct, invalidateMkProductCaches } from "@/lib/metakocka";
import type { ProductRefreshInfo } from "@/lib/preorder-refresh";
import type { CatalogueProduct } from "@/types/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONCURRENCY = 16;
// The builder sends big sheets in chunks; this is only a sanity bound.
const MAX_ROWS = 20_000;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// POST { rows: [{ code, ean }] } → { info: { [currentCode]: ProductRefreshInfo }, notInMk }
// The "Refresh products" migration (lib/preorder-refresh.ts applies it client-side).
// Metakocka is the source of truth: a row's code is looked up in MK, and when MK
// doesn't have it (a stale catalogue SKU) by the row's EAN. MK gives code, name and
// EAN; the catalogue only the images. No prices are read.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { rows?: { code?: string; ean?: string | null }[]; freshMk?: boolean };
  const rows = (body.rows ?? [])
    .map((r) => ({ code: String(r.code ?? "").trim(), ean: r.ean ? String(r.ean).trim() : null }))
    .filter((r) => r.code)
    .slice(0, MAX_ROWS);
  if (rows.length === 0) return NextResponse.json({ info: {}, notInMk: [] });

  // The builder sends a big sheet in chunks; only the first drops the MK index cache.
  if (body.freshMk !== false) invalidateMkProductCaches();
  const index = await getMkProductIndex();
  // Without MK nothing can be verified — refuse rather than guess.
  if (!index) return NextResponse.json({ error: "Metakocka is unavailable — try again." }, { status: 503 });

  const info: Record<string, ProductRefreshInfo> = {};
  const notInMk: string[] = [];
  const catalogue = new Map<string, CatalogueProduct | null>();

  await mapLimit(rows, CONCURRENCY, async ({ code, ean }) => {
    if (info[code] || notInMk.includes(code)) return;
    const mk = index.get(code) ?? (ean ? await getMkSalesProduct(ean) : null);
    if (!mk) {
      notInMk.push(code);
      return;
    }
    if (!catalogue.has(mk.code)) {
      const res = await getProduct(mk.code);
      catalogue.set(mk.code, res.ok && res.data ? (res.data as CatalogueProduct) : null);
    }
    const parent = catalogue.get(mk.code) ?? null;
    const node = parent
      ? parent.code === mk.code
        ? parent
        : (parent.child_products ?? []).find((c) => c.code === mk.code) ?? null
      : null;
    info[code] = {
      code: mk.code,
      name: mk.name,
      ean: mk.barcode ?? null,
      image: node?.images?.[0] ?? null,
      groupImages: (parent?.images ?? []).filter(Boolean).slice(0, 8),
    };
  });

  return NextResponse.json({ info, notInMk });
}
