import { agentError, agentJson, agentRoute, pageOf, parsePaging, scrubSecrets } from "@/lib/agent-api";
import { callPartnerPortal } from "@/lib/partner-api";
import { loadPartnerList } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// GET /api/agent/partners?limit=&skip= — partner-portal partners (Auth0 export-role
// users joined with their portal activity rollup, like the Partners page) plus the
// portal's catalogue-sync status (`sync`; null + `syncError` when it failed).
export const GET = agentRoute(async (req) => {
  let list, sync;
  try {
    [list, sync] = await Promise.all([loadPartnerList(), callPartnerPortal("/api/admin/system/sync")]);
  } catch (err) {
    // Auth0 unreachable, or PARTNER_API_BASE / PARTNER_API_TOKEN not set.
    return agentError(`partners unavailable: ${errText(err)}`, 502);
  }
  const page = pageOf(list.partners, parsePaging(new URL(req.url).searchParams));
  return agentJson({
    total: page.total,
    items: scrubSecrets(page.items),
    portalReachable: list.portalReachable,
    sync: sync.ok ? scrubSecrets(sync.data) : null,
    syncError: sync.ok ? null : sync.error,
  });
});
