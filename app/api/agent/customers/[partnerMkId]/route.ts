import { agentActorLabel, agentError, agentJson, agentWriteRoute } from "@/lib/agent-api";
import { toMkCustomerView, updateMkCustomerManual } from "@/lib/mk-customers";
import { normalizeIso } from "@/lib/countries-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ partnerMkId: string }> };

// POST /api/agent/customers/:partnerMkId { actor, countryIso: "SI" | null }
// Set (or clear with null) the staff-chosen country of a directory customer
// (`countryIsoManual`, updateMkCustomerManual — the customer drawer's country
// picker). It wins over the country read from Metakocka for markets / VAT. The UI
// stores no acting user for this field, so the actor is in the audit log line.
// → 200 { customer } (the directory record) | 404 not in the directory.
export const POST = agentWriteRoute<Ctx>(async (w, { params }) => {
  const partnerMkId = decodeURIComponent((await params).partnerMkId);
  w.target = partnerMkId;
  if (!("countryIso" in w.body)) return agentError("invalid request", 400, ["countryIso is required (ISO-3166 alpha-2, or null to clear)"]);
  const raw = w.body.countryIso;
  const iso = raw === null ? null : typeof raw === "string" ? normalizeIso(raw) : null;
  if (raw !== null && !iso) return agentError("invalid request", 400, ["countryIso must be a 2-letter country code or null"]);

  const doc = await updateMkCustomerManual(partnerMkId, { countryIsoManual: iso }, agentActorLabel(w.actor));
  if (!doc) return agentError("customer not found", 404);
  return agentJson({ customer: toMkCustomerView(doc) });
});
