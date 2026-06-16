// Shapes returned by the Automation proxy routes (app/api/automation/*), which proxy the
// t4a-mk-automation service (/api/v1/*). Keep in sync by hand with that service's index.js.

export type SyncType = "warehouse" | "products";

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
export type WarehouseDetails = {
  type: "warehouse";
  warehouses: { source: string; target: string; count: number | null }[];
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

export type RunDetails = WarehouseDetails | ProductDetails;

export function parseRunDetails(raw: string | null | undefined): RunDetails | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return d && (d.type === "warehouse" || d.type === "products") ? (d as RunDetails) : null;
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
};

// Combined payload the admin status route returns: live status + recent run history per type.
export type AutomationStatus = MkStatus & {
  runs: { warehouse: MkRun[]; products: MkRun[] };
  reachable: boolean;
};
