import { agentJson, agentRoute } from "@/lib/agent-api";
import { bridgeCatalog, handleBridge } from "@/lib/agent-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agent/admin — every admin page API the agent may call, with the doc
// comment of each handler (what it does, what body it takes).
export const GET = agentRoute(async () => agentJson(bridgeCatalog()));

// POST /api/agent/admin { actor: {sub, name, email?}, method, path, query?, body? }
//   Run one admin page API as that staff member (lib/agent-bridge.ts). GET calls take
//   the read or write token, changes only the write token.
//   → the route's own JSON answer and status.
export async function POST(req: Request) {
  try {
    return await handleBridge(req);
  } catch (err) {
    console.error("POST /api/agent/admin failed:", err);
    return agentJson({ error: "internal error" }, 500);
  }
}
