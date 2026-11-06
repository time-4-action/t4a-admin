import { agentJson, agentRoute, parsePaging } from "@/lib/agent-api";
import { listAgentBuilderPresets } from "@/lib/agent-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agent/builder-presets?builder=radar-chart|range-bars|layout&limit=&skip=
// Saved Section Builder builds (product radar charts, feel / range bars), newest
// edit first: the verbatim `config` plus parsed per-product `ratings`.
export const GET = agentRoute(async (req) => {
  const sp = new URL(req.url).searchParams;
  return agentJson(await listAgentBuilderPresets({ builder: sp.get("builder") }, parsePaging(sp)));
});
