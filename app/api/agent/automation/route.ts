import { agentError, agentJson, agentRoute, scrubSecrets } from "@/lib/agent-api";
import { callMkAutomation } from "@/lib/mk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// GET /api/agent/automation — mk-automation's /api/v1/status and its last 20 runs
// (/api/v1/runs?limit=20), passed through. Upstream failure → 502 {error}.
export const GET = agentRoute(async () => {
  let status, runs;
  try {
    [status, runs] = await Promise.all([callMkAutomation("/api/v1/status"), callMkAutomation("/api/v1/runs?limit=20")]);
  } catch (err) {
    // callMkAutomation throws only when MK_API_BASE / MK_API_TOKEN are not set.
    return agentError(`mk-automation unavailable: ${errText(err)}`, 502);
  }
  if (!status.ok) return agentError(`mk-automation status failed: ${status.error}`, 502);
  if (!runs.ok) return agentError(`mk-automation runs failed: ${runs.error}`, 502);
  return agentJson({ status: scrubSecrets(status.data), runs: scrubSecrets(runs.data) });
});
