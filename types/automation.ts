// Shapes returned by the Automation proxy routes (app/api/automation/*), which proxy the
// t4a-mk-automation service (/api/v1/*). Keep in sync by hand with that service's index.js.

export type SyncType = "warehouse" | "products" | "customers" | "pricelists";

export type MkRun = {
  id: number;
  type: SyncType | string;
  trigger: "manual" | "schedule" | string;
  status: "running" | "ok" | "error" | string;
  item_count: number | null;
  error: string | null;
  details: string | null; // JSON string — see WarehouseDetails / ProductDetails
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
};

// Parsed `details` payloads (stored as JSON text by the service).
export type WarehouseError = {
  product_code: string | null;
  warehouse_id: string | null;
  message: string;
};

export type WarehouseDetails = {
  type: "warehouse";
  warehouses: { source: string; target: string; count: number | null }[];
  // Per-product failures reported by Metakocka's sync_stock (optional: older runs
  // predate error capture). The source only lists T4A now — ProMode/Germany is retired.
  errorCount?: number;
  errors?: WarehouseError[];
};

export type ProductError = {
  system: string | null;
  product_code: string | null;
  action: string | null;
  message: string;
};

export type ProductDetails = {
  type: "products";
  buckets: { key: string; count: number }[];
  errorCount: number;
  errors: ProductError[];
};

export type CustomerError = {
  system: string | null;
  partner: string | null;
  tax_id_number: string | null;
  action: string | null;
  message: string;
};

// One customer's change record: what happened and where (which fields / addresses / contacts).
export type CustomerChange = {
  action: "create" | "update";
  partner: string | null;
  tax_id_number: string | null;
  via: "tax" | "name" | null; // how it was matched (null for a create)
  fields: string[]; // top-level fields overwritten
  billing: "updated" | "added" | null; // billing (Račun) address touched
  addressesAdded: number;
  addressesUpdated: number;
  contactsAdded: number;
};

export type CustomerDetails = {
  type: "customers";
  // Scheduled/manual real runs write; a dry run only computes the plan (nothing is written).
  dryRun?: boolean;
  counts: {
    source: number | null;
    target: number | null;
    matched: number | null;
    created: number | null;
    updated: number | null;
    skipped: number | null;
  };
  buckets: { key: string; count: number }[];
  // Per-customer "what updated where" breakdown (capped; full list is in the saved JSON file).
  changeCount?: number;
  changes?: CustomerChange[];
  errorCount: number;
  errors: CustomerError[];
};

// ── pricelists ───────────────────────────────────────────────────────────────
// Prices are synced only for source→target price-list pairs a human has mapped. A price
// list's count_code does NOT identify the same list across the two companies (live data:
// T4A 7 = "PP GOLD 2026" vs CREAGLOBE 7 = "PP BRONZE 2026"), so nothing is ever guessed.

export type PricelistError = {
  system: string | null;
  scope: "mapping" | "product" | string;
  product_code: string | null;
  list: string | null;
  action: string | null;
  message: string;
  // The exact price_def payload Metakocka refused (truncated). A rejection here is almost
  // always about the SHAPE of the entry rather than the price itself.
  payload?: string;
};

// What happened to one product on one target list.
export type PricelistChange = {
  productCode: string;
  productName: string | null;
  list: string;
  // "blocked" = the move exceeded the mapping's maxChangePct rail and was NOT written.
  action: "add" | "update" | "blocked";
  summary: string;
};

// A non-fatal, actionable note about a list. Today the only producer is the missing-tax
// case: Metakocka requires a tax code on every price line, and neither company had one.
export type PricelistWarning = {
  scope: "list" | string;
  list: string | null;
  message: string;
};

// One mapped list pair's outcome for a run.
export type PricelistListReport = {
  mappingId: number | null;
  source: { code: string; salesPurchase: string; title: string | null };
  target: { code: string; salesPurchase: string; title: string | null };
  added: number;
  updated: number;
  unchanged: number;
  blocked: number;
  extra: number;
  skippedMissingProduct: number;
  // Set when the pair could not be synced at all.
  skipped: "source-list-not-found" | "target-list-not-seen" | null;
};

export type PricelistDetails = {
  type: "pricelists";
  dryRun?: boolean;
  // True when no mapping is configured yet — the run is a deliberate no-op, not a success.
  noMappings?: boolean;
  counts: {
    mappings: number | null;
    products: number | null;
    added: number | null;
    updated: number | null;
    unchanged: number | null;
    blocked: number | null;
    extra: number | null;
    skippedMissingProduct: number | null;
  };
  perList: PricelistListReport[];
  buckets: { key: string; count: number }[];
  changeCount?: number;
  changes?: PricelistChange[];
  warnings?: PricelistWarning[];
  errorCount: number;
  errors: PricelistError[];
};

// ── price-list discovery (GET /api/automation/pricelists) ────────────────────
// Metakocka has no "list price lists" endpoint, so the service derives them by scanning
// the catalogue. A list carrying no products is therefore invisible.

export type MkPricelistInfo = {
  key: string;
  code: string | null;
  salesPurchase: string;
  title: string | null;
  currency: string | null;
  validFrom: string | null;
  validTo: string | null;
  buyer: string | null;
  productCount: number;
  priceDefCount: number;
  fields: string[];
};

export type PricelistMapping = {
  id?: number;
  sourceCode: string;
  sourceSalesPurchase: string;
  sourceTitle: string | null;
  targetCode: string;
  targetSalesPurchase: string;
  targetTitle: string | null;
  enabled: boolean;
  // Write to a target list the scan could not see (it is empty, or it does not exist).
  allowUnseenTarget?: boolean;
  // Safety rail: refuse any single price move larger than this percentage.
  maxChangePct?: number | null;
  updatedAt?: string;
};

export type PricelistSuggestion = {
  sourceCode: string;
  sourceSalesPurchase: string;
  sourceTitle: string | null;
  sourceProductCount: number;
  targetCode: string | null;
  targetSalesPurchase: string | null;
  targetTitle: string | null;
  targetProductCount: number | null;
  confidence: "title-exact" | "none";
};

export type PricelistDiscovery = {
  source: { company: string; productCount: number; lists: MkPricelistInfo[] };
  target: { company: string; productCount: number; lists: MkPricelistInfo[] };
  suggestions: PricelistSuggestion[];
  mappings: PricelistMapping[];
  scannedAt: string;
  cached: boolean;
};

export type RunDetails = WarehouseDetails | ProductDetails | CustomerDetails | PricelistDetails;

export function parseRunDetails(raw: string | null | undefined): RunDetails | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return d &&
      (d.type === "warehouse" ||
        d.type === "products" ||
        d.type === "customers" ||
        d.type === "pricelists")
      ? (d as RunDetails)
      : null;
  } catch {
    return null;
  }
}

export type MkSyncState = {
  schedule: string;
  nextRun: string | null;
  isRunning: boolean;
  lastRun: MkRun | null;
};

export type MkStatus = {
  warehouse: MkSyncState;
  products: MkSyncState;
  customers: MkSyncState;
  // Carries mappingCount on top of the shared state: with nothing mapped the sync is a
  // deliberate no-op, and the UI must say so rather than show a meaningless green run.
  pricelists: MkSyncState & { mappingCount?: number };
};

// Combined payload the admin status route returns: live status + recent run history per type.
export type AutomationStatus = MkStatus & {
  runs: { warehouse: MkRun[]; products: MkRun[]; customers: MkRun[]; pricelists: MkRun[] };
  reachable: boolean;
};
