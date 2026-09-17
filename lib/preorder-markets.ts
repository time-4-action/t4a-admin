import "server-only";

// lib/preorder-markets.ts
//
// Mutations of a campaign's inheritance configuration (markets + customer rules).
// Markets are embedded in the campaign document, ORDERED BY PRIORITY (index 0 is
// checked first; the first market matching a partner's country + kind wins), so a
// country may sit in several markets. Every write checks that assortment ids
// point at the sheet.

import type { IPreorderCampaign } from "@/models/preorder-campaign";
import { marketView, sanitizeCustomerRule, sanitizeMarket } from "@/lib/preorder";
import type { CommercialConfig, CustomerRule, PreorderMarket } from "@/types/preorder";

export type MarketsError = { status: number; error: string; conflicts?: { iso: string; markets: string[] }[] };

// Countries shared by several markets — informational (priority resolves them).
export function findCountryConflicts(markets: PreorderMarket[]): { iso: string; markets: string[] }[] {
  const seen = new Map<string, string[]>();
  for (const m of markets) for (const iso of m.countries) seen.set(iso, [...(seen.get(iso) ?? []), m.name]);
  return Array.from(seen.entries())
    .filter(([, names]) => names.length > 1)
    .map(([iso, names]) => ({ iso, markets: names }));
}

function sheetIds(doc: IPreorderCampaign): Set<string> {
  const ids = new Set<string>();
  for (const t of doc.tabs) {
    ids.add(t.id);
    for (const g of t.groups) {
      ids.add(g.id);
      for (const r of g.rows) ids.add(r.id);
    }
  }
  return ids;
}

// Drop assortment / tier ids that do not exist on the sheet (keeps the arrays present).
function pruneConfig(doc: IPreorderCampaign, cfg: CommercialConfig): CommercialConfig {
  const ids = sheetIds(doc);
  const tabIds = new Set(doc.tabs.map((t) => t.id));
  const out = { ...cfg };
  if (out.hiddenIds) out.hiddenIds = out.hiddenIds.filter((id) => ids.has(id));
  if (out.exposedIds) out.exposedIds = out.exposedIds.filter((id) => ids.has(id));
  if (out.tiersByTab) out.tiersByTab = out.tiersByTab.filter((t) => tabIds.has(t.tabId));
  return out;
}

function toDocConfig(cfg: CommercialConfig) {
  return { ...cfg, deadline: cfg.deadline === undefined ? undefined : cfg.deadline ? new Date(cfg.deadline) : null };
}

export async function replaceMarkets(doc: IPreorderCampaign, raw: unknown): Promise<PreorderMarket[] | MarketsError> {
  const list = Array.isArray(raw) ? raw : [];
  const markets = list.map((m, i) => sanitizeMarket(m, `mkt-${i}-${Date.now().toString(36)}`)).map((m) => ({ ...m, config: pruneConfig(doc, m.config) }));
  doc.markets = markets.map((m) => ({ ...m, config: toDocConfig(m.config), updatedAt: new Date() })) as IPreorderCampaign["markets"];
  doc.markModified("markets");
  await doc.save();
  return markets;
}

export async function upsertMarket(doc: IPreorderCampaign, raw: unknown, marketId?: string): Promise<PreorderMarket | MarketsError> {
  const existing = marketId ? doc.markets.find((m) => m.id === marketId) : undefined;
  if (marketId && !existing) return { status: 404, error: "Market not found." };
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // Read the existing layer through the wire view — a mongoose sub-document reports
  // every schema path as present, which would turn "inherit" into "override".
  const prev = existing ? marketView(existing) : null;
  const merged = sanitizeMarket(
    {
      id: prev?.id ?? r.id,
      name: r.name ?? prev?.name,
      color: r.color ?? prev?.color,
      countries: r.countries ?? prev?.countries ?? [],
      kinds: r.kinds ?? prev?.kinds ?? [],
      config: "config" in r ? r.config : prev?.config ?? {},
    },
    marketId,
  );
  merged.config = pruneConfig(doc, merged.config);
  const stored = { ...merged, config: toDocConfig(merged.config), updatedAt: new Date() };
  if (existing) {
    const idx = doc.markets.findIndex((m) => m.id === merged.id);
    doc.markets.splice(idx, 1, stored as IPreorderCampaign["markets"][number]);
  } else {
    doc.markets.push(stored as IPreorderCampaign["markets"][number]);
  }
  doc.markModified("markets");
  await doc.save();
  return merged;
}

// Reorder markets = set their priority. `ids` lists every market id, first = highest.
export async function reorderMarkets(doc: IPreorderCampaign, ids: string[]): Promise<true | MarketsError> {
  const byId = new Map(doc.markets.map((m) => [m.id, m]));
  if (ids.length !== byId.size || ids.some((id) => !byId.has(id)) || new Set(ids).size !== ids.length) {
    return { status: 400, error: "Order must list every market exactly once." };
  }
  doc.markets = ids.map((id) => byId.get(id)!) as IPreorderCampaign["markets"];
  doc.markModified("markets");
  await doc.save();
  return true;
}

// Move countries between markets in one go (the countries table's assign).
export async function assignCountries(doc: IPreorderCampaign, marketId: string | null, isos: string[]): Promise<true | MarketsError> {
  const set = new Set(isos.map((i) => i.toUpperCase()));
  if (marketId && !doc.markets.some((m) => m.id === marketId)) return { status: 404, error: "Market not found." };
  for (const m of doc.markets) {
    m.countries = m.countries.filter((c) => !set.has(c));
    if (m.id === marketId) m.countries = Array.from(new Set([...m.countries, ...set]));
    m.updatedAt = new Date();
  }
  doc.markModified("markets");
  await doc.save();
  return true;
}

export async function deleteMarket(doc: IPreorderCampaign, marketId: string): Promise<{ affectedPartners: string[] } | MarketsError> {
  if (!doc.markets.some((m) => m.id === marketId)) return { status: 404, error: "Market not found." };
  doc.markets = doc.markets.filter((m) => m.id !== marketId) as IPreorderCampaign["markets"];
  const affected: string[] = [];
  for (const r of doc.customerRules) {
    if (r.marketId === marketId) {
      r.marketId = null;
      affected.push(r.partnerMkId);
    }
  }
  doc.markModified("markets");
  doc.markModified("customerRules");
  await doc.save();
  return { affectedPartners: affected };
}

export async function upsertCustomerRule(doc: IPreorderCampaign, partnerMkId: string, raw: unknown, updatedBy: string | null): Promise<CustomerRule | MarketsError> {
  const rule = sanitizeCustomerRule(raw, partnerMkId, updatedBy);
  if (rule.marketId && !doc.markets.some((m) => m.id === rule.marketId)) return { status: 400, error: "Unknown market." };
  rule.config = pruneConfig(doc, rule.config);
  const existing = doc.customerRules.find((r) => r.partnerMkId === partnerMkId);
  if (!rule.partnerName) rule.partnerName = existing?.partnerName ?? "";
  const stored = { ...rule, config: toDocConfig(rule.config), updatedAt: new Date() };
  if (existing) {
    const idx = doc.customerRules.findIndex((r) => r.partnerMkId === partnerMkId);
    doc.customerRules.splice(idx, 1, stored as IPreorderCampaign["customerRules"][number]);
  } else {
    doc.customerRules.push(stored as IPreorderCampaign["customerRules"][number]);
  }
  doc.markModified("customerRules");
  await doc.save();
  return rule;
}

export async function deleteCustomerRule(doc: IPreorderCampaign, partnerMkId: string): Promise<boolean> {
  const before = doc.customerRules.length;
  doc.customerRules = doc.customerRules.filter((r) => r.partnerMkId !== partnerMkId) as IPreorderCampaign["customerRules"];
  if (doc.customerRules.length === before) return false;
  doc.markModified("customerRules");
  await doc.save();
  return true;
}
