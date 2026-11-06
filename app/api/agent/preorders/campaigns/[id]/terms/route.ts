import { agentActorLabel, agentError, agentJson, agentWriteRoute } from "@/lib/agent-api";
import { getAgentCampaign } from "@/lib/agent-preorders";
import { applyTerms, parseTerms } from "@/lib/agent-preorder-terms";
import { connectDB, PreorderCampaign, toObjectId } from "@/lib/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/agent/preorders/campaigns/:id/terms
//   { actor, layer: "campaign" | "market" | "customer", marketId?, partnerMkId?,
//     tiers?: [{ tabId, tiers: [{ name?, minAmount, discountPct }] | null }],
//     set?: { partnerPricelist?, currency?, deadline?, minOrderAmount?, note? },
//     inherit?: ["deadline", ...], removeRule? }
// Volume-discount ladders and commercial terms on one layer (lib/agent-preorder-terms.ts).
// → 200 { campaign, tabs, markets, customerRules, pricelistRefreshed } (as GET
// /api/agent/preorders/campaigns/:id, plus the price list read for the first time, if any).
export const POST = agentWriteRoute<Ctx>(async (w, { params }) => {
  const { id } = await params;
  w.target = id;
  const parsed = parseTerms(w.body);
  if (!parsed.ok) return agentError("invalid request", 400, parsed.details);
  if (!toObjectId(id)) return agentError("campaign not found", 404);
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return agentError("campaign not found", 404);

  const res = await applyTerms(doc, parsed.input, agentActorLabel(w.actor));
  if (!res.ok) return agentError(res.error, res.status, res.details);
  const data = await getAgentCampaign(id);
  if (!data) return agentError("campaign not found", 404);
  return agentJson({ campaign: data.campaign, tabs: data.tabs, markets: data.markets, customerRules: data.customerRules, pricelistRefreshed: res.pricelistRefreshed });
});
