// lib/preorder-effective.ts
//
// The effective-campaign resolver: ONE master campaign + a partner ⇒ exactly what that
// partner is allowed to see and order. Pure and framework-agnostic (no server-only,
// no Mongo) so it is unit-testable and can never be bypassed by a route "doing its own
// thing" — every consumer (portal, admin preview, submission, customer tables) goes
// through resolveEffectiveCampaign().
//
// Precedence, per field:   CUSTOMER RULE  >  MARKET  >  CAMPAIGN DEFAULT
//
// Pipeline: find the customer rule → determine the market (manual assignment, else the
// market that lists the partner's country) → scalar settings → assortment (hidden /
// exposed ids, layer by layer) → prices (price book of the effective list) → tiers per
// tab → pricing context (customer kind + country ⇒ VAT rate; everyone is on the
// partner price basis). The output
// is a PreorderCampaign (same shape) plus `effective` provenance, so the existing pricing
// engine (computeTotals & co.) and the fill components work unchanged.
// Campaign defaults are the safe fallback everywhere (unknown country, deleted market,
// missing price book entry) — EXCEPT the VAT rate, which is never guessed: a consumer
// whose country has no rate gets `vat-missing` and cannot submit.

import {
  activeTiers,
  type CommercialConfig,
  type ConfigSource,
  type CustomerRule,
  type EffectiveCampaign,
  type EffectiveMeta,
  type EffectiveSources,
  type PreorderCampaign,
  type PreorderCampaignAdmin,
  type PreorderMarket,
  type PreorderRow,
  type PreorderTab,
  type PreorderTier,
  type PriceBook,
  marketMatches,
  type MarketKind,
} from "@/types/preorder";
import { basisFor, resolveVatRate, EMPTY_VAT_CONFIG, type PricingContext, type VatConfig, type VatPolicy } from "@/lib/pricing";

export type PartnerContext = {
  partnerMkId: string;
  countryIso: string | null;
  countrySource: EffectiveMeta["countrySource"];
  kind?: MarketKind | null; // company / individual, when known
};

export type ConfigLayers = { rule: CustomerRule | null; market: PreorderMarket | null; marketSource: "country" | "manual" | null; warnings: string[] };

// The first market (markets are ordered by priority) that matches the partner's
// country and kind — see marketMatches. Several may match; the first wins.
export function findMarketFor(
  campaign: Pick<PreorderCampaignAdmin, "markets">,
  iso: string | null | undefined,
  kind: MarketKind | null | undefined,
): PreorderMarket | null {
  return campaign.markets.find((m) => marketMatches(m, iso ?? null, kind ?? null)) ?? null;
}

export function findCustomerRule(
  campaign: Pick<PreorderCampaignAdmin, "customerRules">,
  partnerMkId: string,
): CustomerRule | null {
  return campaign.customerRules.find((r) => r.partnerMkId === partnerMkId) ?? null;
}

// Apply the rule's manual country to what MK told us about the partner.
export function resolvePartnerContext(
  campaign: Pick<PreorderCampaignAdmin, "customerRules">,
  partnerMkId: string,
  mkCountryIso: string | null,
  mkSource: EffectiveMeta["countrySource"],
  kind: MarketKind | null = null,
): PartnerContext {
  const rule = findCustomerRule(campaign, partnerMkId);
  const base = { partnerMkId, ...(kind ? { kind } : {}) };
  if (rule?.countryIso) {
    return { ...base, countryIso: rule.countryIso.toUpperCase(), countrySource: "manual" };
  }
  return { ...base, countryIso: mkCountryIso ? mkCountryIso.toUpperCase() : null, countrySource: mkCountryIso ? mkSource : null };
}

// Which layers apply to this partner (and why).
export function effectiveConfigLayers(
  campaign: Pick<PreorderCampaignAdmin, "markets" | "customerRules">,
  ctx: PartnerContext,
): ConfigLayers {
  const warnings: string[] = [];
  const rule = findCustomerRule(campaign, ctx.partnerMkId);
  let market: PreorderMarket | null = null;
  let marketSource: "country" | "manual" | null = null;
  if (rule?.marketId) {
    market = campaign.markets.find((m) => m.id === rule.marketId) ?? null;
    if (market) marketSource = "manual";
    else warnings.push(`market-missing:${rule.marketId}`);
  }
  if (!market) {
    market = findMarketFor(campaign, ctx.countryIso, ctx.kind ?? null);
    if (market) marketSource = "country";
  }
  return { rule, market, marketSource, warnings };
}

// ── scalar settings ───────────────────────────────────────────────────────────

function has<K extends keyof CommercialConfig>(cfg: CommercialConfig | null | undefined, key: K): boolean {
  return !!cfg && cfg[key] !== undefined;
}

function pickScalar<K extends keyof CommercialConfig>(
  key: K,
  layers: ConfigLayers,
  campaignDefault: CommercialConfig[K],
): { value: CommercialConfig[K]; source: ConfigSource } {
  if (has(layers.rule?.config, key)) return { value: layers.rule!.config[key], source: "customer" };
  if (has(layers.market?.config, key)) return { value: layers.market!.config[key], source: "market" };
  return { value: campaignDefault, source: "campaign" };
}

// The VAT policy of the layer a customer falls in. Each of the three keys inherits
// on its own; `source` is the most specific layer that set any of them (for the
// provenance badge).
export function vatPolicyFor(layers: ConfigLayers): { policy: VatPolicy; source: ConfigSource } {
  const mode = pickScalar("vatMode", layers, null);
  const rate = pickScalar("vatRate", layers, null);
  const companies = pickScalar("vatCompanies", layers, null);
  const rank: Record<ConfigSource, number> = { campaign: 0, market: 1, customer: 2 };
  const source = [mode.source, rate.source, companies.source].sort((a, b) => rank[b] - rank[a])[0];
  return {
    policy: {
      mode: mode.value ?? "country",
      fixedRate: rate.value ?? null,
      chargeCompanies: !!companies.value,
      source: mode.source,
    },
    source,
  };
}

// ── assortment ────────────────────────────────────────────────────────────────

type FlatRow = { tab: PreorderTab; group: PreorderTab["groups"][number]; row: PreorderRow };

function idsOf(r: FlatRow): string[] {
  return [r.row.id, r.group.id, r.tab.id];
}

// Rows visible after applying the layers in order (market, then customer). A layer's
// hiddenIds remove rows (by row / group / tab id); its exposedIds add them back —
// including `restricted` rows. Within one layer exposed beats hidden.
function applyAssortment(
  campaign: Pick<PreorderCampaign, "tabs">,
  layers: ConfigLayers,
): { visible: Set<string>; hiddenBy: Partial<Record<ConfigSource, number>>; exposed: number; restrictedExposed: number; staleIds: string[] } {
  const all: FlatRow[] = [];
  const knownIds = new Set<string>();
  for (const tab of campaign.tabs) {
    knownIds.add(tab.id);
    for (const group of tab.groups) {
      knownIds.add(group.id);
      for (const row of group.rows) {
        knownIds.add(row.id);
        all.push({ tab, group, row });
      }
    }
  }
  const visible = new Set(all.filter((r) => !r.row.restricted).map((r) => r.row.id));
  const hiddenBy: Partial<Record<ConfigSource, number>> = {};
  let exposed = 0;
  let restrictedExposed = 0;
  const staleIds: string[] = [];

  const order: { cfg: CommercialConfig | undefined; source: ConfigSource }[] = [
    { cfg: layers.market?.config, source: "market" },
    { cfg: layers.rule?.config, source: "customer" },
  ];
  for (const { cfg, source } of order) {
    if (!cfg) continue;
    const hidden = new Set(cfg.hiddenIds ?? []);
    const shown = new Set(cfg.exposedIds ?? []);
    for (const id of [...hidden, ...shown]) if (!knownIds.has(id)) staleIds.push(id);
    if (hidden.size) {
      for (const r of all) {
        if (!visible.has(r.row.id)) continue;
        if (idsOf(r).some((id) => hidden.has(id))) {
          visible.delete(r.row.id);
          hiddenBy[source] = (hiddenBy[source] ?? 0) + 1;
        }
      }
    }
    if (shown.size) {
      for (const r of all) {
        if (visible.has(r.row.id)) continue;
        if (idsOf(r).some((id) => shown.has(id))) {
          visible.add(r.row.id);
          exposed += 1;
          if (r.row.restricted) restrictedExposed += 1;
        }
      }
    }
  }
  return { visible, hiddenBy, exposed, restrictedExposed, staleIds: Array.from(new Set(staleIds)) };
}

// ── tiers ─────────────────────────────────────────────────────────────────────

function tiersForTab(tabId: string, layers: ConfigLayers): { tiers: PreorderTier[] | undefined; source: ConfigSource } {
  const fromRule = layers.rule?.config.tiersByTab?.find((t) => t.tabId === tabId);
  if (fromRule) return { tiers: fromRule.tiers, source: "customer" };
  const fromMarket = layers.market?.config.tiersByTab?.find((t) => t.tabId === tabId);
  if (fromMarket) return { tiers: fromMarket.tiers, source: "market" };
  return { tiers: undefined, source: "campaign" };
}

// ── the resolver ──────────────────────────────────────────────────────────────

function lean(campaign: PreorderCampaignAdmin): PreorderCampaign {
  // Strip the admin-only configuration explicitly (never spread the admin object).
  return {
    id: campaign.id,
    title: campaign.title,
    season: campaign.season ?? null,
    currency: campaign.currency,
    status: campaign.status,
    deadline: campaign.deadline ?? null,
    rrpPricelist: campaign.rrpPricelist ?? null,
    partnerPricelist: campaign.partnerPricelist ?? null,
    tabs: campaign.tabs,
    createdBy: campaign.createdBy ?? null,
    createdAt: campaign.createdAt ?? null,
    updatedAt: campaign.updatedAt ?? null,
  };
}

function samePricelist(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

export function findPriceBook(
  campaign: Pick<PreorderCampaignAdmin, "priceBooks">,
  pricelist: string | null | undefined,
): PriceBook | null {
  if (!pricelist) return null;
  return campaign.priceBooks.find((b) => samePricelist(b.pricelist, pricelist)) ?? null;
}

export function resolveEffectiveCampaign(
  campaign: PreorderCampaignAdmin,
  ctx: PartnerContext,
  vat: VatConfig = EMPTY_VAT_CONFIG,
): EffectiveCampaign {
  const layers = effectiveConfigLayers(campaign, ctx);
  const warnings = [...layers.warnings];

  // Pricing context: everyone orders at the net partner price; the customer's kind
  // and country decide the VAT (company → zero-rated unless the layer charges
  // companies, individual → the country's rate added on top).
  const kind = ctx.kind ?? "business";
  if (!ctx.kind) warnings.push("kind-unknown");
  const vatPolicy = vatPolicyFor(layers);
  const vatRes = resolveVatRate({ kind, countryIso: ctx.countryIso, campaignOverrides: campaign.vatOverrides, global: vat, policy: vatPolicy.policy });
  if (vatRes.rate == null) warnings.push(`vat-missing:${ctx.countryIso ?? "no-country"}`);
  const pricingCtx: PricingContext = { kind, basis: basisFor(kind), countryIso: ctx.countryIso, vat: vatRes };

  const pricelist = pickScalar("partnerPricelist", layers, campaign.partnerPricelist ?? null);
  const currency = pickScalar("currency", layers, campaign.currency);
  const deadline = pickScalar("deadline", layers, campaign.deadline ?? null);
  const note = pickScalar("note", layers, null);
  const minOrder = pickScalar("minOrderAmount", layers, null);

  const effectiveCurrency = (currency.value ?? "").trim() || campaign.currency;
  const effectivePricelist = pricelist.value?.trim() || null;

  // Price book: only when the effective list differs from the sheet's own list (the
  // sheet's row prices ARE that list's book).
  const usesBook = !!effectivePricelist && !samePricelist(effectivePricelist, campaign.partnerPricelist);
  const book = usesBook ? findPriceBook(campaign, effectivePricelist) : null;
  if (usesBook && !book) warnings.push(`price-book-missing:${effectivePricelist}`);
  if (book?.currency && book.currency.toUpperCase() !== effectiveCurrency.toUpperCase()) {
    warnings.push(`currency-mismatch:${book.currency} vs ${effectiveCurrency}`);
  }
  const bookByCode = new Map(book?.entries.map((e) => [e.code, e]) ?? []);

  const assort = applyAssortment(campaign, layers);
  for (const id of assort.staleIds) warnings.push(`stale-assortment-id:${id}`);

  const pricing = { pricelist: effectivePricelist, fromBook: 0, fallback: 0, manual: 0, ctx: pricingCtx, vatPolicy: vatPolicy.policy };
  const tierSources: Record<string, ConfigSource> = {};
  const missingCodes: string[] = [];
  const unpricedCodes: string[] = [];

  const tabs: PreorderTab[] = [];
  for (const tab of campaign.tabs) {
    const groups: PreorderTab["groups"] = [];
    for (const group of tab.groups) {
      const rows: PreorderRow[] = [];
      for (const row of group.rows) {
        if (!assort.visible.has(row.id)) continue;
        let out: PreorderRow;
        if (usesBook) {
          const entry = bookByCode.get(row.code);
          if (entry && entry.net != null) {
            out = {
              ...row,
              partnerPrice: entry.net,
              discountedPrice: null,
              taxCode: entry.taxCode ?? row.taxCode ?? null,
              priceSource: "book",
            };
            pricing.fromBook += 1;
          } else {
            out = { ...row, priceSource: "fallback" };
            pricing.fallback += 1;
            if (row.source === "catalogue") missingCodes.push(row.code);
          }
        } else {
          const manual = row.discountedPrice != null;
          out = { ...row, priceSource: manual ? "manual" : "sheet" };
          if (manual) pricing.manual += 1;
        }
        // A row with no price at all (no partner price, no manual discount, not even
        // an RRP to fall back on) has nothing to order at — still listed (so a saved
        // quantity is not silently lost) but not orderable.
        if (out.discountedPrice == null && out.partnerPrice == null && out.rrp == null) {
          unpricedCodes.push(out.code);
          out = { ...out, unpriced: true };
        }
        rows.push(out);
      }
      if (rows.length) groups.push({ ...group, rows });
    }
    if (!groups.length) continue;
    const t = tiersForTab(tab.id, layers);
    tierSources[tab.id] = t.source;
    tabs.push({ ...tab, tiers: t.tiers !== undefined ? activeTiers(t.tiers) : tab.tiers, groups });
  }
  if (book && missingCodes.length) {
    for (const code of missingCodes.slice(0, 20)) warnings.push(`price-missing:${code}`);
    if (missingCodes.length > 20) warnings.push(`price-missing:+${missingCodes.length - 20} more`);
  }
  if (unpricedCodes.length) {
    for (const code of unpricedCodes.slice(0, 20)) warnings.push(`unpriced:${code}`);
    if (unpricedCodes.length > 20) warnings.push(`unpriced:+${unpricedCodes.length - 20} more`);
  }

  const sources: EffectiveSources = {
    pricelist: pricelist.source,
    currency: currency.source,
    deadline: deadline.source,
    note: note.source,
    minOrderAmount: minOrder.source,
    vat: vatPolicy.source,
    tiers: tierSources,
  };

  const effective: EffectiveMeta = {
    partnerMkId: ctx.partnerMkId,
    countryIso: ctx.countryIso,
    countrySource: ctx.countrySource,
    market: layers.market ? { id: layers.market.id, name: layers.market.name, color: layers.market.color } : null,
    marketSource: layers.marketSource,
    hasCustomerRule: !!layers.rule,
    sources,
    minOrderAmount: minOrder.value != null && minOrder.value > 0 ? minOrder.value : null,
    note: note.value?.trim() || null,
    assortment: {
      hidden: Object.values(assort.hiddenBy).reduce((a, b) => a + (b ?? 0), 0),
      exposed: assort.exposed,
      restrictedExposed: assort.restrictedExposed,
      hiddenBy: assort.hiddenBy,
    },
    pricing,
    warnings,
  };

  return {
    ...lean(campaign),
    currency: effectiveCurrency,
    deadline: deadline.value ?? null,
    partnerPricelist: effectivePricelist,
    tabs,
    pricing: pricingCtx,
    effective,
  };
}

// The provenance block only — for tables that list many customers and must not pay
// for per-row assortment/pricing work.
export function resolveProvenanceOnly(
  campaign: Pick<PreorderCampaignAdmin, "markets" | "customerRules" | "partnerPricelist" | "currency" | "deadline">,
  ctx: PartnerContext,
): Pick<EffectiveMeta, "market" | "marketSource" | "hasCustomerRule" | "countryIso" | "countrySource" | "sources" | "warnings"> & {
  overrides: { pricing: boolean; assortment: boolean; tiers: boolean; commercial: boolean };
} {
  const layers = effectiveConfigLayers(campaign, ctx);
  const cfg = layers.rule?.config;
  const pricelist = pickScalar("partnerPricelist", layers, campaign.partnerPricelist ?? null);
  const currency = pickScalar("currency", layers, campaign.currency);
  const deadline = pickScalar("deadline", layers, campaign.deadline ?? null);
  const note = pickScalar("note", layers, null);
  const minOrder = pickScalar("minOrderAmount", layers, null);
  return {
    countryIso: ctx.countryIso,
    countrySource: ctx.countrySource,
    market: layers.market ? { id: layers.market.id, name: layers.market.name, color: layers.market.color } : null,
    marketSource: layers.marketSource,
    hasCustomerRule: !!layers.rule,
    sources: {
      pricelist: pricelist.source,
      currency: currency.source,
      deadline: deadline.source,
      note: note.source,
      minOrderAmount: minOrder.source,
      vat: vatPolicyFor(layers).source,
      tiers: {},
    },
    warnings: layers.warnings,
    overrides: {
      pricing: has(cfg, "partnerPricelist"),
      assortment: has(cfg, "hiddenIds") || has(cfg, "exposedIds"),
      tiers: has(cfg, "tiersByTab"),
      commercial: has(cfg, "currency") || has(cfg, "deadline") || has(cfg, "note") || has(cfg, "minOrderAmount") || has(cfg, "vatMode") || has(cfg, "vatRate") || has(cfg, "vatCompanies"),
    },
  };
}

// Every non-default price list any layer refers to (what the price books must cover).
export function referencedPricelists(campaign: Pick<PreorderCampaignAdmin, "markets" | "customerRules" | "partnerPricelist">): string[] {
  const out = new Map<string, string>(); // lower-cased key → first spelling seen
  const add = (v: string | null | undefined) => {
    const t = v?.trim();
    if (!t || samePricelist(t, campaign.partnerPricelist)) return;
    const key = t.toLowerCase();
    if (!out.has(key)) out.set(key, t);
  };
  for (const m of campaign.markets) add(m.config.partnerPricelist);
  for (const r of campaign.customerRules) add(r.config.partnerPricelist);
  return Array.from(out.values());
}
