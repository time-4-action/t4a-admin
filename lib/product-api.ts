import "server-only";

// Server-side client for the synced product catalogue API (products.md). Authenticates
// with the optional `x-api-key` (WEBHOOK_API_KEY) which unlocks the FULL catalogue —
// unpublished/inactive parents and variants — needed so the preorder sheet builder can
// add pre-order-only items. Without a key it silently falls back to the published view.
// The key never reaches the browser. Mirrors lib/mk-api.ts.

import type {
  CatalogueProduct,
  ProductApiEnvelope,
  ProductSearchHit,
} from "@/types/product";

const TIMEOUT_MS = 15_000;

function getBase(): string {
  return (process.env.PRODUCT_API_BASE || "https://api.time-4-action.com").replace(
    /\/$/,
    "",
  );
}

// Optional — absent/empty simply yields the published-only catalogue.
function getKey(): string | undefined {
  return process.env.PRODUCT_API_KEY || undefined;
}

export type ProductApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

async function callProductApi<T>(path: string): Promise<ProductApiResult<T>> {
  const url = `${getBase()}${path.startsWith("/") ? "" : "/"}${path}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const key = getKey();
    const res = await fetch(url, {
      headers: key ? { "x-api-key": key } : {},
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let body: ProductApiEnvelope<T> | undefined;
    if (text) {
      try {
        body = JSON.parse(text) as ProductApiEnvelope<T>;
      } catch {
        body = undefined;
      }
    }
    if (!res.ok || !body?.success) {
      const err = body?.message ? String(body.message) : `product api ${res.status}`;
      return { ok: false, status: res.status, error: err };
    }
    return { ok: true, status: res.status, data: (body.data ?? []) as T };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `product api unreachable: ${msg}` };
  } finally {
    clearTimeout(t);
  }
}

// Search by name / code / EAN (min 2 chars enforced upstream). Returns the narrow
// search-hit shape (parents and variants flattened).
export function searchProducts(q: string) {
  return callProductApi<ProductSearchHit[]>(
    `/api/product/search?q=${encodeURIComponent(q)}`,
  );
}

// Single product by code or token, with its child_products[] and pricelist[].
export function getProduct(code: string) {
  return callProductApi<CatalogueProduct>(
    `/api/product/${encodeURIComponent(code)}`,
  );
}

// The full catalogue (parents with nested variants). Used sparingly.
export function listProducts() {
  return callProductApi<CatalogueProduct[]>(`/api/product`);
}
