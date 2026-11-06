import { agentError, agentJson, agentWriteRoute } from "@/lib/agent-api";
import { grantCampaignAccess, revokeCampaignAccess } from "@/lib/preorder-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/agent/preorders/access { actor, campaignId, partnerMkId, grant: boolean }
// Give a customer access to a campaign by hand (the grant the invite link creates),
// or take it away — the admin Markets & Customers drawer's toggle. Revoking is
// refused (409) once the customer has a preorder in the campaign. The access grant
// records no acting user in the UI either, so the actor is in the audit log line.
// → 200 { campaignId, partnerMkId, access: boolean }
export const POST = agentWriteRoute(async (w) => {
  const { campaignId, partnerMkId, grant } = w.body;
  const details: string[] = [];
  if (typeof campaignId !== "string" || !campaignId.trim()) details.push("campaignId is required");
  if (typeof partnerMkId !== "string" || !partnerMkId.trim()) details.push("partnerMkId is required");
  if (typeof grant !== "boolean") details.push("grant must be true or false");
  if (details.length) return agentError("invalid request", 400, details);

  const cid = (campaignId as string).trim();
  const pid = (partnerMkId as string).trim();
  w.target = `${cid}/${pid}`;
  const res = grant ? await grantCampaignAccess(cid, pid) : await revokeCampaignAccess(cid, pid);
  if (!res.ok) return agentError(res.status === 404 && res.error === "not found" ? "campaign not found" : res.error, res.status);
  return agentJson({ campaignId: cid, partnerMkId: pid, access: res.access });
});
