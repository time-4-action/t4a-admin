// Shapes returned by the Partners proxy routes (app/api/partners/*), which in
// turn proxy the partner-portal admin surface (/api/admin/partners/*). Keep in
// sync by hand with src/controllers/adminPartnersController.js in the portal.

export type PartnerRollup = {
  shopifyConnections: {
    total: number;
    active: number;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
  };
  exports: { configs: number; downloads30d: number };
  feeds: {
    total: number;
    active: number;
    lastImportAt: string | null;
    lastResult: string | null;
  };
  lastActiveAt: string | null;
  loginCount: number;
  topEvents: { eventType: string; count: number }[];
};

export type PartnerListItem = PartnerRollup & {
  sub: string;
  name: string;
  email: string;
  picture?: string;
};

export type PartnerConnection = {
  _id: string;
  shopDomain: string;
  shopName?: string | null;
  shopCurrency?: string | null;
  status: string;
  installedAt?: string;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  ownerEmail?: string | null;
  config?: {
    syncStock?: boolean;
    syncPrices?: boolean;
    syncDescriptions?: boolean;
    syncImages?: boolean;
    syncNewProducts?: boolean;
    ownership?: string;
  };
};

export type PartnerSyncJob = {
  _id: string;
  shopDomain: string;
  type?: string;
  trigger?: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  counts?: Record<string, number>;
};

export type PartnerFeed = {
  _id: string;
  feedId: string;
  brand: string;
  status: string;
  health?: {
    lastImportAt?: string | null;
    lastResult?: string | null;
    counts?: Record<string, number>;
  };
};

export type PartnerExportConfig = {
  _id: string;
  name: string;
  description?: string;
  isActive?: boolean;
  preset?: string | null;
  createdAt?: string;
};

export type PartnerDownload = {
  _id: string;
  resourceId: string;
  metadata?: { format?: string };
  timestamp: string;
};

export type PartnerDetail = {
  ownerSub: string;
  email?: string | null;
  lastActiveAt?: string | null;
  loginCount: number;
  connections: PartnerConnection[];
  syncJobs: PartnerSyncJob[];
  feeds: PartnerFeed[];
  exportConfigs: PartnerExportConfig[];
  recentDownloads: PartnerDownload[];
  mostInteractedWith: {
    events: { eventType: string; count: number }[];
    topExports: { exportConfigId: string; name: string | null; downloads: number }[];
  };
};

export type PartnerActivityEvent = {
  _id: string;
  eventType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  timestamp: string;
};

// ── Catalogue Sync (scheduler status) ────────────────────────────────────────
// Mirrors src/controllers/adminSystemController.js in the portal. Keep in sync by hand.

export type PnvSyncStats = {
  totalProcessed?: number;
  created?: number;
  updated?: number;
  deactivated?: number;
  aiRuns?: { exportId: string; categorized?: number; error?: string }[];
};

export type PnvSyncRun = {
  _id: string;
  trigger: "schedule" | "manual" | string;
  result: "ok" | "error" | string;
  error?: string | null;
  stats?: PnvSyncStats | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
};

export type PnvSyncStatus = {
  enabled: boolean;
  schedule: string | null;
  isRunning: boolean;
  runningBy?: string | null;
  nextRunAt: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastResult: string | null;
  lastError: string | null;
  lastStats: PnvSyncStats | null;
  runs: PnvSyncRun[];
};

export type OwnSourceFeedStatus = {
  feedId: string;
  brand: string;
  ownerEmail: string | null;
  status: string | null;
  scheduleEnabled: boolean;
  frequency: string | null;
  nextRunAt: string | null;
  isRunning: boolean;
  health: {
    lastImportAt: string | null;
    lastResult: string | null;
    lastError: { code?: string; message?: string } | string | null;
    counts: Record<string, number> | null;
  };
};

export type OwnSourceRun = {
  _id: string;
  feedId: string;
  ownerSub?: string;
  trigger?: string;
  result?: string;
  counts?: Record<string, number> | null;
  error?: unknown;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type ShopifyCleanupStatus = {
  intervalMs: number;
  pendingTtlMs: number;
  lastSweepAt: string | null;
  lastRemoved: number | null;
};

export type SyncStatus = {
  pnv: PnvSyncStatus;
  ownSources: { enabled: boolean; feeds: OwnSourceFeedStatus[]; runs: OwnSourceRun[] };
  shopifyCleanup: ShopifyCleanupStatus;
};

// Human labels for the activity event enum (matches activity.service.js).
export const EVENT_LABELS: Record<string, string> = {
  login: "Signed in",
  export_download: "Downloaded export",
  shopify_connect: "Connected Shopify",
  shopify_sync_now: "Ran Shopify sync",
  feed_add: "Added feed",
  feed_test: "Tested feed",
  feed_import: "Imported feed",
  product_view: "Viewed product",
  config_change: "Changed config",
};
