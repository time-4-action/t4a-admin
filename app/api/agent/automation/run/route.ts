import { agentError, agentJson, agentWriteRoute, scrubSecrets } from "@/lib/agent-api";
import { isMkRunType, MK_RUN_PATHS, runMkAutomation } from "@/lib/mk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/agent/automation/run
//   { actor, type: "warehouse" | "products" | "customers" | "pricelists", dryRun?: boolean }
// Start an mk-automation sync now — the Automation page's "Run now" (runMkAutomation).
// `dryRun` previews without writing (customers + pricelists only, as in the UI).
// → mk-automation's JSON with its status: 202 started; 409 already running;
//   502 when the service fails or is unreachable / not configured.
export const POST = agentWriteRoute(async (w) => {
  const { type, dryRun } = w.body;
  const details: string[] = [];
  if (!isMkRunType(type)) details.push(`type must be one of ${Object.keys(MK_RUN_PATHS).join(", ")}`);
  if (dryRun !== undefined && typeof dryRun !== "boolean") details.push("dryRun must be a boolean");
  if (dryRun === true && type !== "customers" && type !== "pricelists") details.push("dryRun is only supported for customers and pricelists");
  if (details.length || !isMkRunType(type)) return agentError("invalid request", 400, details);
  w.target = type;

  let result;
  try {
    result = await runMkAutomation(type, { dryRun: dryRun === true });
  } catch (err) {
    // callMkAutomation throws only when MK_API_BASE / MK_API_TOKEN are not set.
    return agentError(`mk-automation unavailable: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
  if (!result.ok) {
    if (result.status === 409) return agentError(result.error || "sync already running", 409);
    return agentError(`mk-automation run failed: ${result.error}`, 502);
  }
  return agentJson(scrubSecrets(result.data ?? {}), result.status);
});
