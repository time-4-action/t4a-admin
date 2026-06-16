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
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
};

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
