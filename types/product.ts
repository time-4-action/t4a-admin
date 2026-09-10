// types/product.ts
//
// Shapes returned by the synced product catalogue API (https://api.time-4-action.com
// /api/product · /api/product/search · /api/product/:code). Consumed server-side by
// lib/product-api.ts and proxied for the preorder sheet builder. Keep in sync by hand
// with api-docs/docs/api/products.md.

export type ProductPrice = {
  name: string;
  price: number;
};

export type ProductAiCategory = {
  exportId: string;
  categoryId: string;
  categoryName: string;
};

// A full parent (list / single-product endpoints) or child variant. Fields are loose
// because the upstream owns the data and older records may omit some.
export type CatalogueProduct = {
  _id?: string;
  code: string;
  ean_code?: string | null;
  product_name: string;
  description?: string | null;
  token?: string | null;
  published?: boolean;
  active?: boolean;
  stock_amount?: number | null;
  images?: string[];
  pricelist?: ProductPrice[];
  ai_categories?: ProductAiCategory[];
  child_products?: CatalogueProduct[];
};

// The narrower shape returned by /api/product/search (one row per parent OR variant).
export type ProductSearchHit = {
  code: string;
  ean_code?: string | null;
  product_name: string;
  image?: string | null;
  category?: string | null;
};

// The `{ success, data }` envelope every product endpoint wraps its payload in.
export type ProductApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
};
