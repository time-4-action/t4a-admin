import { agentError, agentJson, agentWriteRoute, type AgentActor } from "@/lib/agent-api";
import { getAgentSubmission } from "@/lib/agent-preorders";
import { patchSubmission, publishSubmission, registerSubmissionOrder } from "@/lib/preorder-admin";
import { connectDB, PreorderSubmission, toObjectId } from "@/lib/preorder";
import type { SubmitActor } from "@/lib/preorder-mk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// The actions the admin UI offers on one preorder (submission page), by name.
const SUBMISSION_ACTIONS = [
  "create-mk-order", // register — or retry a failed registration of — the MK sales order
  "publish-result", // show the MK order to the customer
  "unpublish-result", // hide it again
  "unlock", // back to draft so the customer can edit (also approves an unlock request)
  "dismiss-unlock-request", // clear the customer's unlock request without unlocking
] as const;
type Action = (typeof SUBMISSION_ACTIONS)[number];

const LOCKED = ["submitted", "confirmed"];

function submitActor(a: AgentActor): SubmitActor {
  return { source: "t4a-agent", sub: a.sub, name: a.name, email: a.email };
}

// POST /api/agent/preorders/submissions/:id/action
//   { actor, action, note?, reprice? }
// Runs the same lib function as the admin UI (lib/preorder-admin.ts). The actor is
// recorded as "<name> (T4A agent)" in the submission's own audit fields (MK order
// createdBy, resultPublishedBy, detached-order history detachedBy).
//   • create-mk-order { reprice?: boolean } — 409 unless submitted and without an
//     order; 409 while a registration is in flight; 502 when Metakocka fails.
//   • publish-result / unpublish-result — 409 without a registered order; 502 when
//     the live order cannot be read.
//   • unlock { note? } — only a submitted / confirmed preorder (409 otherwise). An
//     attached MK order is detached (moved to history, NOT deleted in Metakocka),
//     `note` is stored as the detach reason. 409 while a registration is in flight.
//   • dismiss-unlock-request — 409 when there is no open request.
// → 200 with the submission in the shape of GET /api/agent/preorders/submissions/:id.
export const POST = agentWriteRoute<Ctx>(async (w, { params }) => {
  const { id } = await params;
  w.target = id;
  const { action, note, reprice } = w.body;
  const details: string[] = [];
  if (typeof action !== "string" || !(SUBMISSION_ACTIONS as readonly string[]).includes(action)) {
    details.push(`action must be one of ${SUBMISSION_ACTIONS.join(", ")}`);
  }
  if (note !== undefined && note !== null) {
    if (action !== "unlock") details.push("note is only accepted with action unlock");
    else if (typeof note !== "string" || note.length > 500) details.push("note must be a string of at most 500 characters");
  }
  if (reprice !== undefined && (action !== "create-mk-order" || typeof reprice !== "boolean")) {
    details.push("reprice (boolean) is only accepted with action create-mk-order");
  }
  if (details.length) return agentError("invalid request", 400, details);

  if (!toObjectId(id)) return agentError("submission not found", 404);
  await connectDB();
  const doc = await PreorderSubmission.findById(id).exec();
  if (!doc) return agentError("submission not found", 404);
  const actor = submitActor(w.actor);

  switch (action as Action) {
    case "create-mk-order": {
      const out = await registerSubmissionOrder(id, { reprice: reprice === true }, actor);
      if (out.kind === "not-found") return agentError("submission not found", 404);
      if (out.kind === "refused") return agentError(out.error, out.status);
      if (out.result.state === "pending") return agentError("The Metakocka order is still being registered — check again in a moment.", 409);
      if (out.result.state !== "created") return agentError(`Metakocka order registration failed: ${out.result.error ?? "unknown error"}`, 502);
      break;
    }
    case "publish-result":
    case "unpublish-result": {
      const res = await publishSubmission(id, action === "publish-result", actor);
      if (!res.ok) return agentError(res.error, res.status === 404 ? 404 : res.status >= 500 ? 502 : res.status);
      break;
    }
    case "unlock": {
      if (!LOCKED.includes(doc.status)) return agentError(`Only a submitted or confirmed preorder can be unlocked (it is ${doc.status}).`, 409);
      const reason = typeof note === "string" && note.trim() ? note.trim() : "unlocked for customer";
      const res = await patchSubmission(id, { status: "draft", detachOrder: { deleteInMk: false, reason } }, actor);
      if (!res.ok) return agentError(String(res.body.message ?? res.body.error), res.status);
      break;
    }
    case "dismiss-unlock-request": {
      if (!doc.unlockRequestedAt) return agentError("There is no open unlock request on this preorder.", 409);
      const res = await patchSubmission(id, { dismissUnlockRequest: true }, actor);
      if (!res.ok) return agentError(String(res.body.message ?? res.body.error), res.status);
      break;
    }
  }

  const data = await getAgentSubmission(id);
  return data ? agentJson(data) : agentError("submission not found", 404);
});
