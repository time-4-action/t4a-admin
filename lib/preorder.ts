import "server-only";

// Server-side data helpers for the Preorder module: connect to Mongo and map the
// mongoose documents (models/preorder-*.ts) to the wire views (types/preorder.ts).
// Shared by both the admin (/api/admin/preorder) and portal (/api/portal/preorder)
// route groups. The effective-campaign entry point for a partner lives here too
// (loadEffectiveCampaignForPartner) so every consumer resolves the same way.

import { randomBytes } from "crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import {
  PreorderCampaign,
  type ICommercialConfig,
  type ICustomerRule,
  type IPreorderCampaign,
  type IPreorderMarket,
} from "@/models/preorder-campaign";
import {
  PreorderSubmission,
  type ICommercialSnapshot,
  type IPreorderSubmission,
} from "@/models/preorder-submission";
import { PreorderAccess, type IPreorderAccess } from "@/models/preorder-access";
import { countryIsoFromPartner, type CountrySource } from "@/lib/countries";
import { normalizeIso } from "@/lib/countries-client";
import { resolveEffectiveCampaign, resolvePartnerContext, type PartnerContext } from "@/lib/preorder-effective";
import type { MkPartner } from "@/types/documents";
import {
  isLegacyMkOrder,
  isOrderCustomerVisible,
  submissionStage,
  MARKET_COLOR_KEYS,
  type CommercialConfig,
  type CommercialSnapshot,
  type CustomerRule,
  type EffectiveCampaign,
  type PortalSubmission,
  type PreorderCampaign as CampaignView,
  type PreorderCampaignAdmin,
  type PreorderCampaignSummary,
  type PreorderMarket,
  type PreorderSubmission as SubmissionView,
  type PreorderSubmissionSummary,
  type PreorderAccessSummary,
  type PreorderSubmissionTotals,
  type PreorderTab,
  type PreorderTier,
  type MarketColor,
} from "@/types/preorder";

export { connectDB };

// A URL-safe secret for a campaign's invite link.
export function genShareToken(): string {
  return randomBytes(18).toString("base64url");
}

// Ensure a campaign has an invite token (backfills legacy campaigns), returning it.
export async function ensureShareToken(doc: IPreorderCampaign): Promise<string> {
  if (!doc.shareToken) {
    doc.shareToken = genShareToken();
    await doc.save();
  }
  return doc.shareToken;
}

// Whether a partner may see/fill a campaign: they hold an access grant OR already
// have a submission on it. THE invite boundary — nothing about markets, countries or
// customer rules ever grants access.
export async function partnerHasCampaignAccess(
  campaignId: Types.ObjectId | string,
  partnerMkId: string,
): Promise<boolean> {
  const oid = typeof campaignId === "string" ? toObjectId(campaignId) : campaignId;
  if (!oid) return false;
  const [access, sub] = await Promise.all([
    PreorderAccess.exists({ campaignId: oid, partnerMkId }),
    PreorderSubmission.exists({ campaignId: oid, partnerMkId }),
  ]);
  return !!(access || sub);
}

export function toAccessSummary(doc: IPreorderAccess, countryIso?: string | null): PreorderAccessSummary {
  return {
    partnerMkId: doc.partnerMkId,
    partnerName: doc.partnerName,
    partnerEmail: doc.partnerEmail,
    grantedAt: iso(doc.grantedAt),
    countryIso: countryIso ?? null,
  };
}

// Totals as the wire sees them. `net` is DERIVED, never read back from the document:
// submissions saved before volume discounts existed carry the schema default (0), which
// would otherwise read as a free order.
function totalsView(
  t?: { qty?: number; amount?: number; discount?: number; net?: number } | null,
): PreorderSubmissionTotals {
  const qty = t?.qty ?? 0;
  const amount = t?.amount ?? 0;
  const discount = t?.discount ?? 0;
  return { qty, amount, discount, net: Math.round((amount - discount) * 100) / 100 };
}

export function iso(d?: Date | null): string | null {
  return d ? new Date(d).toISOString() : null;
}

// ── sanitizers (admin-authored configuration) ─────────────────────────────────

// Clean the volume-discount ladder a builder sends up: keep it in range (a % outside
// 0–100 would fail schema validation and reject the whole save), give every tier an id,
// and store it sorted by threshold so every reader sees the same ladder.
export function sanitizeTiers(tiers: unknown): PreorderTier[] {
  if (!Array.isArray(tiers)) return [];
  return tiers
    .map((raw, i) => {
      const t = (raw ?? {}) as Partial<PreorderTier>;
      const minAmount = Math.max(0, Number(t.minAmount) || 0);
      const discountPct = Math.min(100, Math.max(0, Number(t.discountPct) || 0));
      return {
        id: String(t.id || `tier-${i}-${Math.random().toString(36).slice(2, 8)}`),
        name: String(t.name ?? "").trim().slice(0, 60),
        minAmount,
        discountPct,
      };
    })
    .sort((a, b) => a.minAmount - b.minAmount);
}

function cleanIdList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return Array.from(new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))).slice(0, 5000);
}

// A config layer as sent by the admin UI. Keeps the `undefined` (inherit) vs
// present (override) distinction on every field; null is a valid override for the
// nullable scalars ("no note", "no deadline").
export function sanitizeCommercialConfig(raw: unknown): CommercialConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: CommercialConfig = {};
  if ("partnerPricelist" in r) out.partnerPricelist = r.partnerPricelist == null ? null : String(r.partnerPricelist).trim().slice(0, 120) || null;
  if ("currency" in r) out.currency = r.currency == null ? null : String(r.currency).trim().toUpperCase().slice(0, 3) || null;
  if ("deadline" in r) {
    const d = r.deadline == null ? null : new Date(String(r.deadline));
    out.deadline = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  if ("note" in r) out.note = r.note == null ? null : String(r.note).trim().slice(0, 2000) || null;
  if ("minOrderAmount" in r) {
    const n = r.minOrderAmount == null ? null : Number(r.minOrderAmount);
    out.minOrderAmount = n != null && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  if ("hiddenIds" in r) out.hiddenIds = cleanIdList(r.hiddenIds) ?? [];
  if ("exposedIds" in r) out.exposedIds = cleanIdList(r.exposedIds) ?? [];
  if ("tiersByTab" in r) {
    const list = Array.isArray(r.tiersByTab) ? (r.tiersByTab as Record<string, unknown>[]) : [];
    const seen = new Set<string>();
    out.tiersByTab = [];
    for (const e of list) {
      const tabId = String(e?.tabId ?? "").trim();
      if (!tabId || seen.has(tabId)) continue;
      seen.add(tabId);
      out.tiersByTab.push({ tabId, tiers: sanitizeTiers(e?.tiers) });
    }
  }
  return out;
}

export function sanitizeMarket(raw: unknown, fallbackId?: string): PreorderMarket {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const color = String(r.color ?? "sky") as MarketColor;
  return {
    id: String(r.id || fallbackId || `mkt-${Math.random().toString(36).slice(2, 10)}`),
    name: String(r.name ?? "").trim().slice(0, 80) || "Market",
    color: MARKET_COLOR_KEYS.includes(color) ? color : "sky",
    countries: Array.from(new Set((Array.isArray(r.countries) ? r.countries : []).map((c) => normalizeIso(String(c))).filter((c): c is string => !!c))),
    config: sanitizeCommercialConfig(r.config),
    updatedAt: new Date().toISOString(),
  };
}

export function sanitizeCustomerRule(raw: unknown, partnerMkId: string, updatedBy: string | null): CustomerRule {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    partnerMkId,
    partnerName: String(r.partnerName ?? "").trim().slice(0, 200),
    marketId: r.marketId == null || r.marketId === "" ? null : String(r.marketId),
    countryIso: normalizeIso(r.countryIso == null ? null : String(r.countryIso)),
    config: sanitizeCommercialConfig(r.config),
    note: r.note == null ? null : String(r.note).trim().slice(0, 2000) || null,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
}

// ── mongoose → wire ───────────────────────────────────────────────────────────

function configView(c?: ICommercialConfig | null): CommercialConfig {
  if (!c) return {};
  const out: CommercialConfig = {};
  if (c.partnerPricelist !== undefined) out.partnerPricelist = c.partnerPricelist ?? null;
  if (c.currency !== undefined) out.currency = c.currency ?? null;
  if (c.deadline !== undefined) out.deadline = iso(c.deadline);
  if (c.note !== undefined) out.note = c.note ?? null;
  if (c.minOrderAmount !== undefined) out.minOrderAmount = c.minOrderAmount ?? null;
  if (c.hiddenIds !== undefined) out.hiddenIds = [...c.hiddenIds];
  if (c.exposedIds !== undefined) out.exposedIds = [...c.exposedIds];
  if (c.tiersByTab !== undefined) {
    out.tiersByTab = c.tiersByTab.map((t) => ({
      tabId: t.tabId,
      tiers: t.tiers.map((x) => ({ id: x.id, name: x.name, minAmount: x.minAmount, discountPct: x.discountPct })),
    }));
  }
  return out;
}

// Mongoose materialises sub-documents with every path present (as `undefined`), so a
// plain `toObject()` would not tell inherit from override; read the raw doc instead.
function rawConfig(doc: { config?: unknown }): ICommercialConfig | null {
  const c = doc.config as (ICommercialConfig & { toObject?: () => ICommercialConfig }) | undefined;
  if (!c) return null;
  const plain = typeof c.toObject === "function" ? c.toObject() : c;
  const out: ICommercialConfig = {};
  for (const k of ["partnerPricelist", "currency", "deadline", "note", "minOrderAmount", "hiddenIds", "exposedIds", "tiersByTab"] as const) {
    if (plain[k] !== undefined) (out as Record<string, unknown>)[k] = plain[k];
  }
  return out;
}

export function marketView(m: IPreorderMarket): PreorderMarket {
  return {
    id: m.id,
    name: m.name,
    color: m.color,
    countries: [...m.countries],
    config: configView(rawConfig(m)),
    updatedAt: iso(m.updatedAt),
  };
}

export function customerRuleView(r: ICustomerRule): CustomerRule {
  return {
    partnerMkId: r.partnerMkId,
    partnerName: r.partnerName,
    marketId: r.marketId ?? null,
    countryIso: r.countryIso ?? null,
    config: configView(rawConfig(r)),
    note: r.note ?? null,
    updatedAt: iso(r.updatedAt),
    updatedBy: r.updatedBy ?? null,
  };
}

function countRows(tabs: PreorderTab[] | IPreorderCampaign["tabs"]): number {
  let n = 0;
  for (const t of tabs) for (const g of t.groups) n += g.rows.length;
  return n;
}

// The lean sheet (what the portal is allowed to know about a campaign's structure).
export function toCampaignView(doc: IPreorderCampaign): CampaignView {
  return {
    id: String(doc._id),
    title: doc.title,
    season: doc.season ?? null,
    currency: doc.currency,
    status: doc.status,
    deadline: iso(doc.deadline),
    rrpPricelist: doc.rrpPricelist ?? null,
    partnerPricelist: doc.partnerPricelist ?? null,
    tabs: (typeof (doc.tabs as unknown as { toObject?: () => unknown }).toObject === "function"
      ? (doc.tabs as unknown as { toObject: () => PreorderTab[] }).toObject()
      : doc.tabs) as unknown as PreorderTab[],
    createdBy: doc.createdBy ?? null,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

// The admin view: the sheet plus its inheritance configuration.
export function toCampaignAdminView(doc: IPreorderCampaign): PreorderCampaignAdmin {
  return {
    ...toCampaignView(doc),
    markets: (doc.markets ?? []).map(marketView),
    customerRules: (doc.customerRules ?? []).map(customerRuleView),
    priceBooks: (doc.priceBooks ?? []).map((b) => ({
      pricelist: b.pricelist,
      currency: b.currency ?? null,
      fetchedAt: iso(b.fetchedAt),
      entries: b.entries.map((e) => ({ code: e.code, gross: e.gross ?? null, taxCode: e.taxCode ?? null })),
      missing: b.missing ?? 0,
    })),
  };
}

// What a customer receives: the effective campaign minus authorship.
export function toPortalCampaignView(effective: EffectiveCampaign): EffectiveCampaign {
  const { createdBy: _createdBy, ...rest } = effective;
  void _createdBy;
  return rest;
}

export function toCampaignSummary(
  doc: IPreorderCampaign,
  submissionCount: number,
): PreorderCampaignSummary {
  return {
    id: String(doc._id),
    title: doc.title,
    season: doc.season ?? null,
    currency: doc.currency,
    status: doc.status,
    deadline: iso(doc.deadline),
    tabCount: doc.tabs.length,
    rowCount: countRows(doc.tabs),
    submissionCount,
    marketCount: doc.markets?.length ?? 0,
    customerRuleCount: doc.customerRules?.length ?? 0,
    updatedAt: iso(doc.updatedAt),
  };
}

export function snapshotView(s?: ICommercialSnapshot | null): CommercialSnapshot | null {
  if (!s) return null;
  const tiersRaw = s.sources?.tiers;
  const tiers: Record<string, "campaign" | "market" | "customer"> = {};
  if (tiersRaw instanceof Map) for (const [k, v] of tiersRaw) tiers[k] = v;
  else if (tiersRaw && typeof tiersRaw === "object") Object.assign(tiers, tiersRaw);
  return {
    resolvedAt: iso(s.resolvedAt) ?? new Date(0).toISOString(),
    countryIso: s.countryIso ?? null,
    market: s.market?.id ? { id: s.market.id, name: s.market.name } : null,
    marketSource: s.marketSource ?? null,
    partnerPricelist: s.partnerPricelist ?? null,
    currency: s.currency,
    deadline: iso(s.deadline),
    note: s.note ?? null,
    sources: {
      pricelist: s.sources?.pricelist ?? "campaign",
      currency: s.sources?.currency ?? "campaign",
      deadline: s.sources?.deadline ?? "campaign",
      note: s.sources?.note ?? "campaign",
      minOrderAmount: s.sources?.minOrderAmount ?? "campaign",
      tiers,
    },
    tabs: (s.tabs ?? []).map((t) => ({
      tabId: t.tabId,
      tabName: t.tabName,
      tiers: (t.tiers ?? []).map((x) => ({ id: x.id, name: x.name, minAmount: x.minAmount, discountPct: x.discountPct })),
    })),
    lines: (s.lines ?? []).map((l) => ({
      rowId: l.rowId,
      code: l.code,
      name: l.name,
      variantLabel: l.variantLabel ?? null,
      image: l.image ?? null,
      tabId: l.tabId,
      tabName: l.tabName,
      groupId: l.groupId,
      groupName: l.groupName,
      qty: l.qty,
      unitPrice: l.unitPrice,
      rrp: l.rrp ?? null,
      taxCode: l.taxCode ?? null,
      priceSource: l.priceSource ?? "sheet",
    })),
  };
}

export function toSubmissionView(doc: IPreorderSubmission): SubmissionView {
  const mkSalesOrder = doc.mkSalesOrder?.mkId
    ? {
        mkId: doc.mkSalesOrder.mkId,
        countCode: doc.mkSalesOrder.countCode,
        totalPrice: doc.mkSalesOrder.totalPrice ?? null,
        createdAt: iso(doc.mkSalesOrder.createdAt),
        createdBy: doc.mkSalesOrder.createdBy ?? null,
      }
    : null;
  const mkOrder = doc.mkOrder?.state
    ? {
        state: doc.mkOrder.state,
        buyerOrder: doc.mkOrder.buyerOrder ?? "",
        attempts: doc.mkOrder.attempts ?? 0,
        lastError: doc.mkOrder.lastError ?? null,
        lastAttemptAt: iso(doc.mkOrder.lastAttemptAt),
        lockedAt: iso(doc.mkOrder.lockedAt),
        lastSeen: doc.mkOrder.lastSeen?.at
          ? {
              at: iso(doc.mkOrder.lastSeen.at)!,
              sumAll: doc.mkOrder.lastSeen.sumAll ?? null,
              statusDesc: doc.mkOrder.lastSeen.statusDesc ?? null,
              lineQty: doc.mkOrder.lastSeen.lineQty ?? 0,
              hash: doc.mkOrder.lastSeen.hash ?? "",
            }
          : null,
      }
    : null;
  const view: SubmissionView = {
    id: String(doc._id),
    campaignId: String(doc.campaignId),
    partnerMkId: doc.partnerMkId,
    partnerName: doc.partnerName,
    partnerEmail: doc.partnerEmail,
    status: doc.status,
    terms: {
      invoiceAddress: doc.terms?.invoiceAddress,
      shippingAddress: doc.terms?.shippingAddress,
      country: doc.terms?.country,
      phone: doc.terms?.phone,
      deliveryDate: iso(doc.terms?.deliveryDate),
      comment: doc.terms?.comment,
    },
    lines: doc.lines.map((l) => ({
      rowId: l.rowId,
      code: l.code,
      qty: l.qty,
      confirmedQty: l.confirmedQty ?? null,
      lineStatus: l.lineStatus,
    })),
    totals: totalsView(doc.totals),
    confirmedTotals: totalsView(doc.confirmedTotals),
    submittedAt: iso(doc.submittedAt),
    updatedAt: iso(doc.updatedAt),
    unlockRequest: doc.unlockRequestedAt
      ? { note: doc.unlockRequestNote ?? "", requestedAt: iso(doc.unlockRequestedAt) }
      : null,
    mkSalesOrder,
    mkOrder,
    mkSalesOrderHistory: (doc.mkSalesOrderHistory ?? []).map((h) => ({
      mkId: h.mkId,
      countCode: h.countCode,
      buyerOrder: h.buyerOrder ?? null,
      detachedAt: iso(h.detachedAt) ?? "",
      detachedBy: h.detachedBy ?? null,
      deletedInMk: !!h.deletedInMk,
      reason: h.reason ?? null,
    })),
    resultPublishedToCustomer: !!doc.resultPublishedToCustomer,
    resultPublishedAt: iso(doc.resultPublishedAt),
    resultPublishedBy: doc.resultPublishedBy ?? null,
    publishedHash: doc.publishedHash ?? null,
    snapshot: snapshotView(doc.snapshot),
    submitRevision: doc.submitRevision ?? 0,
    firstSubmittedAt: iso(doc.firstSubmittedAt),
    submitSource: doc.submitSource ?? null,
    submittedBy: doc.submittedBy ?? null,
  };
  view.stage = submissionStage(view);
  return view;
}

// Customer-facing view: no MK identifiers, no error text, no admin fulfilment.
export function toPortalSubmissionView(doc: IPreorderSubmission): PortalSubmission {
  const full = toSubmissionView(doc);
  const {
    mkSalesOrder: _ref,
    mkOrder,
    mkSalesOrderHistory: _hist,
    publishedHash: _hash,
    confirmedTotals: _ct,
    resultPublishedBy: _by,
    ...rest
  } = full;
  void _ref;
  void _hist;
  void _hash;
  void _ct;
  void _by;
  let registration: PortalSubmission["registration"];
  if (full.status === "draft") registration = { state: "none", canRetry: false };
  else if (mkOrder) {
    if (mkOrder.state === "created") registration = { state: "done", canRetry: false };
    else if (mkOrder.state === "failed") registration = { state: "failed", canRetry: true };
    else {
      const stale = mkOrder.lockedAt ? Date.now() - new Date(mkOrder.lockedAt).getTime() > REGISTRATION_STALE_MS : true;
      registration = { state: stale ? "failed" : "pending", canRetry: stale };
    }
  } else if (isLegacyMkOrder(full)) registration = { state: "done", canRetry: false };
  else registration = { state: "none", canRetry: false };
  return {
    ...rest,
    lines: rest.lines.map((l) => ({ rowId: l.rowId, code: l.code, qty: l.qty })),
    registration,
    published: isOrderCustomerVisible(full),
  };
}

// A pending registration older than this is considered abandoned (the MK put_document
// budget is 60 s + two 20 s lookups + slack) and may be retried.
export const REGISTRATION_STALE_MS = 180_000;

export function toSubmissionSummary(doc: IPreorderSubmission, countryIso?: string | null): PreorderSubmissionSummary {
  const view = toSubmissionView(doc);
  return {
    id: view.id,
    partnerMkId: view.partnerMkId,
    partnerName: view.partnerName,
    partnerEmail: view.partnerEmail,
    status: view.status,
    totals: view.totals ?? totalsView(null),
    confirmedTotals: view.confirmedTotals ?? totalsView(null),
    submittedAt: view.submittedAt,
    updatedAt: view.updatedAt,
    hasUnlockRequest: !!doc.unlockRequestedAt,
    stage: view.stage ?? submissionStage(view),
    mkState: view.mkOrder ? view.mkOrder.state : isLegacyMkOrder(view) ? "legacy" : null,
    mkCountCode: view.mkSalesOrder?.countCode ?? null,
    mkId: view.mkSalesOrder?.mkId ?? null,
    published: isOrderCustomerVisible(view),
    allocatedQty: view.mkOrder?.lastSeen?.lineQty ?? null,
    countryIso: view.snapshot?.countryIso ?? countryIso ?? null,
    marketName: view.snapshot?.market?.name ?? null,
    failedError: view.mkOrder?.state === "failed" ? view.mkOrder.lastError ?? null : null,
  };
}

// Count submissions per campaign id (for the campaigns list). One grouped query.
export async function submissionCountsByCampaign(
  campaignIds: string[],
): Promise<Record<string, number>> {
  const ids = campaignIds.map(toObjectId).filter(Boolean) as Types.ObjectId[];
  if (ids.length === 0) return {};
  const rows = await PreorderSubmission.aggregate<{ _id: unknown; n: number }>([
    { $match: { campaignId: { $in: ids } } },
    { $group: { _id: "$campaignId", n: { $sum: 1 } } },
  ]);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r._id)] = r.n;
  return out;
}

export function toObjectId(id: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

// ── effective campaign for ONE partner (the single entry point) ───────────────

// Minimal partner facts the resolver needs; both a live MkPartner and a directory
// record (models/mk-customer.ts) satisfy it.
export type PartnerFacts = {
  mkId: string;
  countryIso?: string | null;
  countrySource?: CountrySource;
  mk?: Pick<MkPartner, "address" | "addresses" | "foreignCountry"> | null;
};

export function partnerContextFor(campaign: PreorderCampaignAdmin, partner: PartnerFacts): PartnerContext {
  let iso = normalizeIso(partner.countryIso ?? null);
  let source: CountrySource = iso ? (partner.countrySource ?? "mk") : null;
  if (!iso && partner.mk) {
    const r = countryIsoFromPartner(partner.mk);
    iso = r.iso;
    source = r.source;
  }
  return resolvePartnerContext(campaign, partner.mkId, iso, source);
}

export function loadEffectiveCampaignForPartner(campaignDoc: IPreorderCampaign, partner: PartnerFacts): EffectiveCampaign {
  const admin = toCampaignAdminView(campaignDoc);
  return resolveEffectiveCampaign(admin, partnerContextFor(admin, partner));
}

export { PreorderCampaign, PreorderSubmission, PreorderAccess };
