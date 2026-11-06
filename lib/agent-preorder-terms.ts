import "server-only";

// lib/agent-preorder-terms.ts
//
// The agent API's "commercial terms" write (POST /api/agent/preorders/campaigns/:id/terms):
// volume-discount ladders and the per-layer terms (price list, currency, deadline,
// minimum order, note) on one of the three layers a partner inherits from:
//
//   campaign  — a tab's default ladder (the builder's tier editor). Ladders only.
//   market    — a market's config layer (the Markets panel).
//   customer  — one partner's customer rule (the customer drawer); created on first use.
//
// It drives the same lib functions as the admin UI (sanitizeTiers, upsertMarket,
// upsertCustomerRule, deleteCustomerRule, refreshPriceBooks), so validation and stored
// shapes are identical. Submitted preorders keep their frozen pricing snapshot: new
// terms reach drafts and new submissions, and a submitted preorder without a
// Metakocka order picks them up through the `create-mk-order` action with `reprice`.

import type { IPreorderCampaign } from "@/models/preorder-campaign";
import { customerRuleView, marketView, sanitizeTiers } from "@/lib/preorder";
import { deleteCustomerRule, upsertCustomerRule, upsertMarket } from "@/lib/preorder-markets";
import { refreshPriceBooks } from "@/lib/preorder-pricebooks";
import { getMkCustomer } from "@/lib/mk-customers";
import type { CommercialConfig } from "@/types/preorder";

export const TERM_FIELDS = ["partnerPricelist", "currency", "deadline", "minOrderAmount", "note"] as const;
type TermField = (typeof TERM_FIELDS)[number];

export type TermsInput = {
  layer: "campaign" | "market" | "customer";
  marketId?: string;
  partnerMkId?: string;
  // Per tab: a ladder (an empty list = no volume discount), or null = drop this layer's
  // override and inherit (market / customer only).
  tiers?: { tabId: string; tiers: { name?: string; minAmount: number; discountPct: number }[] | null }[];
  // Overrides on a market / customer layer. A value of null is an override too
  // ("no deadline"); to inherit again, list the field in `inherit`.
  set?: Partial<Record<TermField, string | number | null>>;
  inherit?: TermField[];
  // customer layer only: delete the whole rule (the partner falls back to market / campaign).
  removeRule?: boolean;
};

export type TermsResult = { ok: true; pricelistRefreshed: string | null } | { ok: false; status: number; error: string; details?: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Validate the body shape (not the campaign): returns the parsed input or the problems. */
export function parseTerms(body: Record<string, unknown>): { ok: true; input: TermsInput } | { ok: false; details: string[] } {
  const details: string[] = [];
  const layer = body.layer;
  if (layer !== "campaign" && layer !== "market" && layer !== "customer") details.push("layer must be campaign, market or customer");
  if (layer === "market" && (typeof body.marketId !== "string" || !body.marketId)) details.push("marketId is required for the market layer");
  if (layer === "customer" && (typeof body.partnerMkId !== "string" || !body.partnerMkId)) details.push("partnerMkId is required for the customer layer");

  let tiers: TermsInput["tiers"];
  if ("tiers" in body) {
    if (!Array.isArray(body.tiers)) details.push("tiers must be a list of { tabId, tiers }");
    else {
      tiers = [];
      body.tiers.forEach((e, i) => {
        if (!isObj(e) || typeof e.tabId !== "string" || !e.tabId) return details.push(`tiers[${i}].tabId is required`);
        if (e.tiers === null) {
          if (layer === "campaign") details.push(`tiers[${i}]: the campaign layer has no parent to inherit from; send [] for no discount`);
          return tiers!.push({ tabId: e.tabId, tiers: null });
        }
        if (!Array.isArray(e.tiers)) return details.push(`tiers[${i}].tiers must be a list or null`);
        const bad = e.tiers.some(
          (t) => !isObj(t) || !Number.isFinite(Number(t.minAmount)) || Number(t.minAmount) < 0 || !Number.isFinite(Number(t.discountPct)) || Number(t.discountPct) < 0 || Number(t.discountPct) > 100,
        );
        if (bad) return details.push(`tiers[${i}]: every tier needs minAmount >= 0 and discountPct between 0 and 100`);
        tiers!.push({ tabId: e.tabId, tiers: e.tiers as { name?: string; minAmount: number; discountPct: number }[] });
      });
    }
  }

  let set: TermsInput["set"];
  if ("set" in body) {
    if (!isObj(body.set)) details.push("set must be an object");
    else {
      set = {};
      for (const [k, v] of Object.entries(body.set)) {
        if (!(TERM_FIELDS as readonly string[]).includes(k)) details.push(`set.${k} is not a term (allowed: ${TERM_FIELDS.join(", ")})`);
        else if (k === "deadline" && v !== null && (typeof v !== "string" || Number.isNaN(Date.parse(v)))) details.push("set.deadline must be an ISO date or null");
        else if (k === "minOrderAmount" && v !== null && (!Number.isFinite(Number(v)) || Number(v) < 0)) details.push("set.minOrderAmount must be a number >= 0 or null");
        else if (v !== null && typeof v !== "string" && typeof v !== "number") details.push(`set.${k} must be a string, number or null`);
        else set[k as TermField] = v as string | number | null;
      }
    }
  }
  let inherit: TermField[] | undefined;
  if ("inherit" in body) {
    if (!Array.isArray(body.inherit) || body.inherit.some((f) => !(TERM_FIELDS as readonly string[]).includes(String(f)))) details.push(`inherit must list term names (${TERM_FIELDS.join(", ")})`);
    else inherit = body.inherit as TermField[];
  }
  const removeRule = body.removeRule === true;
  if (removeRule && layer !== "customer") details.push("removeRule is for the customer layer only");
  if (layer === "campaign" && (set || inherit)) details.push("the campaign layer takes tiers only (deadline: use the status route; price lists: the builder)");
  if (!removeRule && !tiers?.length && !(set && Object.keys(set).length) && !inherit?.length) details.push("nothing to change: send tiers, set, inherit or removeRule");

  if (details.length) return { ok: false, details };
  return {
    ok: true,
    input: { layer: layer as TermsInput["layer"], marketId: body.marketId as string | undefined, partnerMkId: body.partnerMkId as string | undefined, tiers, set, inherit, removeRule },
  };
}

/** A layer's config with the requested ladders and terms applied (undefined field = inherit). */
function nextConfig(prev: CommercialConfig, input: TermsInput): CommercialConfig {
  const cfg: CommercialConfig = { ...prev };
  for (const f of input.inherit ?? []) delete cfg[f];
  for (const [k, v] of Object.entries(input.set ?? {})) (cfg as Record<string, unknown>)[k] = v;
  if (input.tiers?.length) {
    const byTab = new Map((cfg.tiersByTab ?? []).map((t) => [t.tabId, t.tiers]));
    for (const e of input.tiers) {
      if (e.tiers === null) byTab.delete(e.tabId);
      else byTab.set(e.tabId, sanitizeTiers(e.tiers));
    }
    if (byTab.size) cfg.tiersByTab = [...byTab].map(([tabId, tiers]) => ({ tabId, tiers }));
    else delete cfg.tiersByTab;
  }
  return cfg;
}

/** Apply the change to the campaign document (saved), refreshing a newly used price list's price book. */
export async function applyTerms(doc: IPreorderCampaign, input: TermsInput, actorLabel: string): Promise<TermsResult> {
  const tabIds = new Set(doc.tabs.map((t) => t.id));
  const unknownTabs = (input.tiers ?? []).map((t) => t.tabId).filter((id) => !tabIds.has(id));
  if (unknownTabs.length) return { ok: false, status: 400, error: "unknown tab", details: unknownTabs.map((id) => `no tab ${id} on this campaign`) };

  if (input.layer === "campaign") {
    for (const e of input.tiers ?? []) {
      const tab = doc.tabs.find((t) => t.id === e.tabId)!;
      tab.tiers = sanitizeTiers(e.tiers ?? []) as typeof tab.tiers;
    }
    doc.markModified("tabs");
    await doc.save();
    return { ok: true, pricelistRefreshed: null };
  }

  let pricelist: string | null = null;
  if (input.layer === "market") {
    const existing = doc.markets.find((m) => m.id === input.marketId);
    if (!existing) return { ok: false, status: 404, error: "market not found" };
    const config = nextConfig(marketView(existing).config, input);
    pricelist = config.partnerPricelist ?? null;
    const res = await upsertMarket(doc, { config }, input.marketId);
    if ("error" in res) return { ok: false, status: res.status, error: res.error };
  } else {
    const pid = input.partnerMkId!;
    if (input.removeRule) {
      const removed = await deleteCustomerRule(doc, pid);
      return removed ? { ok: true, pricelistRefreshed: null } : { ok: false, status: 404, error: "this customer has no rule on the campaign" };
    }
    const existing = doc.customerRules.find((r) => r.partnerMkId === pid);
    const prev = existing ? customerRuleView(existing) : null;
    if (!prev && !(await getMkCustomer(pid))) return { ok: false, status: 404, error: "customer not found in the directory" };
    const config = nextConfig(prev?.config ?? {}, input);
    pricelist = config.partnerPricelist ?? null;
    const res = await upsertCustomerRule(
      doc,
      pid,
      { partnerName: prev?.partnerName || (await getMkCustomer(pid))?.name || "", marketId: prev?.marketId ?? null, countryIso: prev?.countryIso ?? null, note: prev?.note ?? null, config },
      actorLabel,
    );
    if ("error" in res) return { ok: false, status: res.status, error: res.error };
  }

  // A price list the campaign has no price book for yet would leave the layer without
  // prices: read it now, as the admin UI's refresh does.
  if (pricelist && input.set && "partnerPricelist" in input.set && !doc.priceBooks?.some((b) => b.pricelist === pricelist) && pricelist !== doc.partnerPricelist) {
    await refreshPriceBooks(doc, [pricelist]);
    return { ok: true, pricelistRefreshed: pricelist };
  }
  return { ok: true, pricelistRefreshed: null };
}
