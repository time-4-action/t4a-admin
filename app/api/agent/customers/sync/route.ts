import { agentError, agentJson, agentWriteRoute } from "@/lib/agent-api";
import { getSyncState, startMkCustomerSync } from "@/lib/mk-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/agent/customers/sync { actor }
// Start the full Metakocka → customer directory pull (startMkCustomerSync, the
// Markets & Customers page's "Sync"). Runs in the background; the progress is the
// `syncState` of GET /api/agent/customers.
// → 202 { started: true, sync } | 409 { error, sync } when one is already running.
export const POST = agentWriteRoute(async (w) => {
  w.target = "mk-customer-directory";
  const started = await startMkCustomerSync();
  const sync = await getSyncState();
  return started ? agentJson({ started, sync }, 202) : agentJson({ error: "a customer sync is already running", sync }, 409);
});
