import { agentActorLabel, agentError, agentJson, agentWriteRoute } from "@/lib/agent-api";
import { updateAgentClients } from "@/lib/portal-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ partnerMkId: string }> };

const isIdList = (v: unknown) => v === undefined || (Array.isArray(v) && v.length <= 500 && v.every((x) => typeof x === "string" && x.trim()));

// POST /api/agent/portal-agents/:partnerMkId/clients
//   { actor, add?: [partnerMkId], remove?: [partnerMkId], note?: string | null }
// Add / remove client partners of an existing portal agent; the other clients are
// kept (updateAgentClients → saveAgent, the Customers section's save). Added clients
// must be in the customer directory. The actor is recorded as "<name> (T4A agent)"
// in the agent's `updatedBy` and each added client's `addedBy`.
// → 200 { agent } | 404 not an agent | 400 unknown customer ids (details.unknown).
export const POST = agentWriteRoute<Ctx>(async (w, { params }) => {
  const partnerMkId = decodeURIComponent((await params).partnerMkId);
  w.target = partnerMkId;
  const { add, remove, note } = w.body;
  const details: string[] = [];
  if (!isIdList(add)) details.push("add must be an array of partnerMkId strings");
  if (!isIdList(remove)) details.push("remove must be an array of partnerMkId strings");
  if (note !== undefined && note !== null && (typeof note !== "string" || note.length > 2000)) details.push("note must be a string of at most 2000 characters, or null");
  if (add === undefined && remove === undefined && note === undefined) details.push("nothing to change: give add, remove or note");
  if (details.length) return agentError("invalid request", 400, details);

  const res = await updateAgentClients(
    partnerMkId,
    { add: add as string[] | undefined, remove: remove as string[] | undefined, note: note as string | null | undefined },
    agentActorLabel(w.actor),
  );
  if (!res.ok) return agentError(res.status === 404 ? "portal agent not found" : res.error, res.status, res.details);
  return agentJson({ agent: res.agent });
});
