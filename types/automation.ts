// Shapes returned by the Automation proxy routes (app/api/automation/*), which proxy the
// t4a-mk-automation service (/api/v1/*). Keep in sync by hand with that service's index.js.

export type SyncType = "warehouse" | "products" | "customers";

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

export type RunDetails = WarehouseDetails | ProductDetails | CustomerDetails;

export function parseRunDetails(raw: string | null | undefined): RunDetails | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return d && (d.type === "warehouse" || d.type === "products" || d.type === "customers")
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
};

// Combined payload the admin status route returns: live status + recent run history per type.
export type AutomationStatus = MkStatus & {
  runs: { warehouse: MkRun[]; products: MkRun[]; customers: MkRun[] };
  reachable: boolean;
};
