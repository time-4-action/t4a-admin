import "server-only";

// lib/preorder-customers.ts
//
// The Markets & Customers read models for ONE campaign: the customers table (directory
// rows joined with campaign access / submission / rule state and the resolved
// provenance) and the map's per-country aggregates. Mongo only — no Metakocka.

import { Types } from "mongoose";
import { PreorderAccess } from "@/models/preorder-access";
import { PreorderSubmission } from "@/models/preorder-submission";
import type { IPreorderCampaign } from "@/models/preorder-campaign";
import { MkCustomer, type IMkCustomer } from "@/models/mk-customer";
import { connectDB, toCampaignAdminView, partnerContextFor } from "@/lib/preorder";
import { resolveProvenanceOnly } from "@/lib/preorder-effective";
import { countMkCustomersByCountry, effectiveCountryIso, listMkCustomers, toMkCustomerView, type CustomerKind, type MkCustomerView } from "@/lib/mk-customers";
import { allCountryNames, countryName } from "@/lib/countries";
import { submissionStage, type MarketColor, type SubmissionStage } from "@/types/preorder";

export type CustomerRow = MkCustomerView & {
  market: { id: string; name: string; color: MarketColor; source: "country" | "manual" } | null;
  hasRule: boolean;
  ruleNote: string | null;
  overrides: { pricing: boolean; assortment: boolean; tiers: boolean; commercial: boolean };
  access: boolean;
  grantedAt: string | null;
  submissionId: string | null;
  stage: SubmissionStage | null;
  published: boolean;
  warnings: string[];
};

export type CustomersQuery = {
  q?: string;
  kind?: CustomerKind | null;
  countryIso?: string | null;
  marketId?: string | null; // "none" = no market
  access?: "all" | "unlocked" | "not-unlocked";
  stage?: SubmissionStage | "all" | "any";
  override?: "all" | "yes" | "no";
  page?: number;
  pageSize?: number;
};

type CampaignFacts = {
  access: Map<string, Date>;
  subs: Map<string, { id: string; stage: SubmissionStage; published: boolean }>;
};

async function campaignFacts(campaignId: Types.ObjectId): Promise<CampaignFacts> {
  const [grants, subs] = await Promise.all([
    PreorderAccess.find({ campaignId }, { partnerMkId: 1, grantedAt: 1 }).lean().exec(),
    PreorderSubmission.find(
      { campaignId },
      { partnerMkId: 1, status: 1, "mkOrder.state": 1, "mkSalesOrder.mkId": 1, "mkSalesOrder.countCode": 1, resultPublishedToCustomer: 1 },
    )
      .lean()
      .exec(),
  ]);
  return {
    access: new Map(grants.map((g) => [g.partnerMkId, g.grantedAt])),
    subs: new Map(
      subs.map((s) => {
        const stage = submissionStage({
          status: s.status,
          mkOrder: s.mkOrder?.state ? { state: s.mkOrder.state, buyerOrder: "", attempts: 0 } : null,
          mkSalesOrder: s.mkSalesOrder?.mkId ? { mkId: s.mkSalesOrder.mkId, countCode: s.mkSalesOrder.countCode } : null,
          resultPublishedToCustomer: s.resultPublishedToCustomer,
        });
        return [s.partnerMkId, { id: String(s._id), stage, published: stage === "published" }];
      }),
    ),
  };
}

function rowFor(campaignDoc: IPreorderCampaign, c: IMkCustomer, facts: CampaignFacts): CustomerRow {
  const admin = toCampaignAdminView(campaignDoc);
  const view = toMkCustomerView(c);
  const ctx = partnerContextFor(admin, {
    mkId: c.partnerMkId,
    countryIso: effectiveCountryIso(c),
    countrySource: c.countryIsoManual ? "manual" : c.countrySource ?? null,
    kind: view.kind,
  });
  const prov = resolveProvenanceOnly(admin, ctx);
  const rule = admin.customerRules.find((r) => r.partnerMkId === c.partnerMkId) ?? null;
  const sub = facts.subs.get(c.partnerMkId) ?? null;
  const granted = facts.access.get(c.partnerMkId) ?? null;
  return {
    ...view,
    countryIso: ctx.countryIso,
    countryName: countryName(ctx.countryIso),
    countrySource: ctx.countrySource,
    market: prov.market && prov.marketSource ? { ...prov.market, source: prov.marketSource } : null,
    hasRule: !!rule,
    ruleNote: rule?.note ?? null,
    overrides: prov.overrides,
    access: !!granted || !!sub,
    grantedAt: granted ? new Date(granted).toISOString() : null,
    submissionId: sub?.id ?? null,
    stage: sub?.stage ?? null,
    published: sub?.published ?? false,
    warnings: prov.warnings,
  };
}

export async function listCampaignCustomers(
  campaignDoc: IPreorderCampaign,
  query: CustomersQuery,
): Promise<{ items: CustomerRow[]; total: number; page: number; pageSize: number }> {
  await connectDB();
  const facts = await campaignFacts(campaignDoc._id as Types.ObjectId);
  const admin = toCampaignAdminView(campaignDoc);
  const ruleIds = new Set(admin.customerRules.map((r) => r.partnerMkId));

  // Campaign-scoped filters start from the (small) campaign sets and restrict the
  // directory query to those ids.
  let restrict: Set<string> | null = null;
  const intersect = (ids: Iterable<string>) => {
    const s = new Set(ids);
    restrict = restrict ? new Set([...restrict].filter((x) => s.has(x))) : s;
  };
  if (query.access === "unlocked") intersect([...facts.access.keys(), ...facts.subs.keys()]);
  if (query.stage && query.stage !== "all") {
    intersect([...facts.subs.entries()].filter(([, s]) => query.stage === "any" || s.stage === query.stage).map(([id]) => id));
  }
  if (query.override === "yes") intersect(ruleIds);

  // Country filter must respect manual country overrides on rules: resolve those first.
  const ruleCountry = new Map(admin.customerRules.filter((r) => r.countryIso).map((r) => [r.partnerMkId, r.countryIso!.toUpperCase()]));

  const wantMarket = query.marketId && query.marketId !== "all" ? query.marketId : null;
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
  const page = Math.max(1, query.page ?? 1);

  // Market / not-unlocked / override=no filters cannot be expressed as a directory query
  // (they depend on the resolver), so those cases page in memory over a bounded scan.
  const needsScan = !!wantMarket || query.access === "not-unlocked" || query.override === "no" || ruleCountry.size > 0;
  if (!needsScan) {
    const res = await listMkCustomers({
      q: query.q,
      kind: query.kind ?? null,
      countryIso: query.countryIso ?? null,
      partnerMkIds: restrict ? Array.from(restrict) : undefined,
      page,
      pageSize,
    });
    return { items: res.items.map((c) => rowFor(campaignDoc, c, facts)), total: res.total, page, pageSize };
  }

  const scan = await listMkCustomers({ q: query.q, kind: query.kind ?? null, partnerMkIds: restrict ? Array.from(restrict) : undefined, page: 1, pageSize: 200 * 25 });
  let rows = scan.items.map((c) => rowFor(campaignDoc, c, facts));
  if (query.countryIso === "none") rows = rows.filter((r) => !r.countryIso);
  else if (query.countryIso) rows = rows.filter((r) => r.countryIso === query.countryIso!.toUpperCase());
  if (wantMarket === "none") rows = rows.filter((r) => !r.market);
  else if (wantMarket) rows = rows.filter((r) => r.market?.id === wantMarket);
  if (query.access === "not-unlocked") rows = rows.filter((r) => !r.access);
  if (query.override === "no") rows = rows.filter((r) => !r.hasRule);
  const total = rows.length;
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
}

export async function getCampaignCustomer(campaignDoc: IPreorderCampaign, partnerMkId: string): Promise<CustomerRow | null> {
  await connectDB();
  const c = await MkCustomer.findOne({ partnerMkId }).exec();
  if (!c) return null;
  const facts = await campaignFacts(campaignDoc._id as Types.ObjectId);
  return rowFor(campaignDoc, c, facts);
}

export type CountryGeo = {
  customers: number;
  business: number;
  person: number;
  unlocked: number;
  submitted: number;
  published: number;
  overrides: number;
  marketId: string | null;
};

// Per-country aggregates for the Countries table + the summary strip: directory
// counts split by kind, campaign-scoped counters, the country's market, and the
// English name of every country (for the pickers).
export async function campaignGeo(campaignDoc: IPreorderCampaign): Promise<{
  byCountry: Record<string, CountryGeo>;
  unresolved: number;
  kinds: { business: number; person: number };
  countries: Record<string, string>;
}> {
  await connectDB();
  const admin = toCampaignAdminView(campaignDoc);
  const [byIso, facts] = await Promise.all([countMkCustomersByCountry(), campaignFacts(campaignDoc._id as Types.ObjectId)]);
  const out: Record<string, CountryGeo> = {};
  const marketOf = (iso: string) => admin.markets.find((m) => m.countries.includes(iso))?.id ?? null;
  const ensure = (iso: string) => (out[iso] ??= { customers: 0, business: 0, person: 0, unlocked: 0, submitted: 0, published: 0, overrides: 0, marketId: marketOf(iso) });
  let unresolved = 0;
  const kinds = { business: 0, person: 0 };
  for (const [iso, c] of Object.entries(byIso)) {
    kinds.business += c.business;
    kinds.person += c.person;
    if (iso === "none") unresolved = c.customers;
    else Object.assign(ensure(iso), { customers: c.customers, business: c.business, person: c.person });
  }
  // Campaign-scoped counters need each participant's country (small sets).
  const ids = new Set([...facts.access.keys(), ...facts.subs.keys(), ...admin.customerRules.map((r) => r.partnerMkId)]);
  if (ids.size) {
    const docs = await MkCustomer.find({ partnerMkId: { $in: Array.from(ids) } }, { partnerMkId: 1, countryIso: 1, countryIsoManual: 1 }).lean().exec();
    const isoOf = new Map(docs.map((d) => [d.partnerMkId, effectiveCountryIso(d)]));
    for (const r of admin.customerRules) if (r.countryIso) isoOf.set(r.partnerMkId, r.countryIso.toUpperCase());
    for (const id of ids) {
      const iso = isoOf.get(id);
      if (!iso) continue;
      const g = ensure(iso);
      if (facts.access.has(id) || facts.subs.has(id)) g.unlocked += 1;
      const s = facts.subs.get(id);
      if (s && s.stage !== "draft") g.submitted += 1;
      if (s?.published) g.published += 1;
      if (admin.customerRules.some((r) => r.partnerMkId === id)) g.overrides += 1;
    }
  }
  for (const m of admin.markets) for (const iso of m.countries) ensure(iso);
  return { byCountry: out, unresolved, kinds, countries: allCountryNames() };
}
