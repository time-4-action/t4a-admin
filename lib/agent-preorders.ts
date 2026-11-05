import "server-only";

// lib/agent-preorders.ts
//
// Read models of the Preorder module for the agent API (/api/agent/preorders/*).
// Built on the same mappers as the admin UI (lib/preorder.ts: marketView,
// customerRuleView, toSubmissionView, snapshotView, totalsView) so the numbers
// match what an admin sees. Mongo only — never calls Metakocka. Never exposes the
// campaign `shareToken` (every view below is built field by field).

import { Types } from "mongoose";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  customerRuleView,
  iso,
  marketView,
  toCampaignView,
  toObjectId,
  toSubmissionView,
  totalsView,
} from "@/lib/preorder";
import type { IPreorderCampaign } from "@/models/preorder-campaign";
import type { IPreorderSubmission } from "@/models/preorder-submission";
import { isOrderCustomerVisible, submissionStage, type MkOrderState, type SubmissionStatus } from "@/types/preorder";
import type { Paging } from "@/lib/agent-api";

const CAMPAIGN_STATUSES = ["draft", "open", "closed"] as const;
const SUBMISSION_STATUSES: SubmissionStatus[] = ["draft", "submitted", "confirmed", "closed"];
// `legacy` = a hand-pushed order (reference, no sync state); `none` = no order at all.
export const MK_STATE_FILTERS = ["pending", "created", "failed", "legacy", "none"] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── campaigns ────────────────────────────────────────────────────────────────

export type AgentCampaignCounts = {
  draft: number;
  submitted: number;
  confirmed: number;
  closed: number;
  mkCreated: number; // a Metakocka sales order exists (registered or legacy)
  mkFailed: number; // registration failed (retryable)
  published: number; // the MK order is visible to the customer
};

export type AgentCampaign = {
  id: string;
  title: string;
  season: string | null;
  status: string;
  currency: string;
  deadline: string | null;
  rrpPricelist: string | null;
  partnerPricelist: string | null;
  marketCount: number;
  customerRuleCount: number;
  tabCount: number;
  rowCount: number;
  submissionCount: number;
  counts: AgentCampaignCounts;
  totalNet: number; // Σ net of submitted + confirmed submissions, in `currency`
  createdAt: string | null;
  updatedAt: string | null;
};

type SubFacts = Pick<IPreorderSubmission, "campaignId" | "status" | "mkOrder" | "mkSalesOrder" | "resultPublishedToCustomer" | "totals">;

function emptyCounts(): AgentCampaignCounts {
  return { draft: 0, submitted: 0, confirmed: 0, closed: 0, mkCreated: 0, mkFailed: 0, published: 0 };
}

async function campaignStats(ids: Types.ObjectId[]): Promise<Map<string, { counts: AgentCampaignCounts; totalNet: number; n: number }>> {
  const out = new Map<string, { counts: AgentCampaignCounts; totalNet: number; n: number }>();
  if (ids.length === 0) return out;
  const subs = await PreorderSubmission.find(
    { campaignId: { $in: ids } },
    { campaignId: 1, status: 1, "mkOrder.state": 1, "mkSalesOrder.mkId": 1, resultPublishedToCustomer: 1, totals: 1 },
  )
    .lean<SubFacts[]>()
    .exec();
  for (const s of subs) {
    const key = String(s.campaignId);
    const e = out.get(key) ?? { counts: emptyCounts(), totalNet: 0, n: 0 };
    e.n += 1;
    if (s.status in e.counts) e.counts[s.status as SubmissionStatus] += 1;
    const facts = {
      status: s.status,
      mkOrder: s.mkOrder?.state ? { state: s.mkOrder.state, buyerOrder: "", attempts: 0 } : null,
      mkSalesOrder: s.mkSalesOrder?.mkId ? { mkId: s.mkSalesOrder.mkId, countCode: "" } : null,
      resultPublishedToCustomer: !!s.resultPublishedToCustomer,
    };
    const stage = submissionStage(facts);
    if (stage === "registered" || stage === "published") e.counts.mkCreated += 1;
    if (stage === "registration-failed") e.counts.mkFailed += 1;
    if (isOrderCustomerVisible(facts)) e.counts.published += 1;
    if (s.status === "submitted" || s.status === "confirmed") e.totalNet += (totalsView(s.totals).net ?? 0);
    out.set(key, e);
  }
  for (const e of out.values()) e.totalNet = round2(e.totalNet);
  return out;
}

function countRows(doc: IPreorderCampaign): number {
  let n = 0;
  for (const t of doc.tabs ?? []) for (const g of t.groups ?? []) n += g.rows?.length ?? 0;
  return n;
}

function toAgentCampaign(doc: IPreorderCampaign, stats?: { counts: AgentCampaignCounts; totalNet: number; n: number }): AgentCampaign {
  return {
    id: String(doc._id),
    title: doc.title,
    season: doc.season ?? null,
    status: doc.status,
    currency: doc.currency,
    deadline: iso(doc.deadline),
    rrpPricelist: doc.rrpPricelist ?? null,
    partnerPricelist: doc.partnerPricelist ?? null,
    marketCount: doc.markets?.length ?? 0,
    customerRuleCount: doc.customerRules?.length ?? 0,
    tabCount: doc.tabs?.length ?? 0,
    rowCount: countRows(doc),
    submissionCount: stats?.n ?? 0,
    counts: stats?.counts ?? emptyCounts(),
    totalNet: stats?.totalNet ?? 0,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

export async function listAgentCampaigns(query: { status?: string | null }, paging: Paging) {
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (query.status && (CAMPAIGN_STATUSES as readonly string[]).includes(query.status)) filter.status = query.status;
  const [docs, total] = await Promise.all([
    PreorderCampaign.find(filter).sort({ updatedAt: -1 }).skip(paging.skip).limit(paging.limit).exec() as Promise<IPreorderCampaign[]>,
    PreorderCampaign.countDocuments(filter).exec(),
  ]);
  const stats = await campaignStats(docs.map((d) => d._id as Types.ObjectId));
  return { total, items: docs.map((d) => toAgentCampaign(d, stats.get(String(d._id)))) };
}

export async function getAgentCampaign(id: string) {
  const oid = toObjectId(id);
  if (!oid) return null;
  await connectDB();
  const doc = (await PreorderCampaign.findById(oid).exec()) as IPreorderCampaign | null;
  if (!doc) return null;
  const stats = await campaignStats([oid]);
  return {
    campaign: toAgentCampaign(doc, stats.get(String(oid))),
    tabs: (doc.tabs ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      groupCount: t.groups?.length ?? 0,
      rowCount: (t.groups ?? []).reduce((n, g) => n + (g.rows?.length ?? 0), 0),
      tiers: (t.tiers ?? []).map((x) => ({ name: x.name, minAmount: x.minAmount, discountPct: x.discountPct })),
    })),
    markets: (doc.markets ?? []).map(marketView).map((m) => ({ id: m.id, name: m.name, countries: m.countries, kinds: m.kinds, config: m.config })),
    customerRules: (doc.customerRules ?? []).map(customerRuleView).map((r) => ({
      partnerMkId: r.partnerMkId,
      partnerName: r.partnerName,
      marketId: r.marketId,
      countryIso: r.countryIso,
      config: r.config,
      note: r.note,
      updatedAt: r.updatedAt,
    })),
    vatOverrides: (doc.vatOverrides ?? []).map((o) => ({ iso: o.iso, rate: o.rate })),
    priceBooks: (doc.priceBooks ?? []).map((b) => ({
      pricelist: b.pricelist,
      currency: b.currency ?? null,
      fetchedAt: iso(b.fetchedAt),
      entryCount: b.entries?.length ?? 0,
      missing: b.missing ?? 0,
    })),
  };
}

// ── submissions ──────────────────────────────────────────────────────────────

export type AgentSubmissionQuery = {
  campaignId?: string | null;
  partnerMkId?: string | null;
  q?: string | null;
  status?: string | null;
  mkState?: string | null;
};

function submissionFilter(query: AgentSubmissionQuery): Record<string, unknown> | null {
  const filter: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];
  if (query.campaignId) {
    const oid = toObjectId(query.campaignId);
    if (!oid) return null; // an invalid id matches nothing
    filter.campaignId = oid;
  }
  if (query.partnerMkId) filter.partnerMkId = query.partnerMkId;
  if (query.status && SUBMISSION_STATUSES.includes(query.status as SubmissionStatus)) filter.status = query.status;
  const q = query.q?.trim();
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    and.push({ $or: [{ partnerName: re }, { partnerEmail: re }] });
  }
  switch (query.mkState) {
    case "pending":
    case "created":
    case "failed":
      filter["mkOrder.state"] = query.mkState as MkOrderState;
      break;
    case "legacy":
      and.push({ "mkSalesOrder.mkId": { $nin: [null, ""] } }, { $or: [{ mkOrder: null }, { "mkOrder.state": null }] });
      break;
    case "none":
      and.push({ $or: [{ mkOrder: null }, { "mkOrder.state": null }] }, { $or: [{ mkSalesOrder: null }, { "mkSalesOrder.mkId": { $in: [null, ""] } }] });
      break;
  }
  if (and.length) filter.$and = and;
  return filter;
}

function toAgentSubmission(doc: IPreorderSubmission, campaign: { title: string; currency: string } | null) {
  const v = toSubmissionView(doc);
  return {
    id: v.id,
    campaignId: v.campaignId,
    campaignTitle: campaign?.title ?? null,
    partnerMkId: v.partnerMkId,
    partnerName: v.partnerName,
    partnerEmail: v.partnerEmail ?? null,
    status: v.status,
    stage: v.stage ?? null,
    currency: v.snapshot?.currency ?? campaign?.currency ?? null,
    totals: v.totals,
    countryIso: v.snapshot?.countryIso ?? null,
    marketName: v.snapshot?.market?.name ?? null,
    submittedAt: v.submittedAt ?? null,
    firstSubmittedAt: v.firstSubmittedAt ?? null,
    updatedAt: v.updatedAt ?? null,
    submitSource: v.submitSource ?? null,
    submittedBy: v.submittedBy ?? null,
    mkSalesOrder: v.mkSalesOrder ? { countCode: v.mkSalesOrder.countCode, mkId: v.mkSalesOrder.mkId } : null,
    mkOrder: v.mkOrder ? { state: v.mkOrder.state, attempts: v.mkOrder.attempts, lastError: v.mkOrder.lastError } : null,
    published: isOrderCustomerVisible(v),
    unlockRequestedAt: v.unlockRequest?.requestedAt ?? null,
  };
}

async function campaignLookup(ids: string[]): Promise<Map<string, { title: string; currency: string }>> {
  const oids = Array.from(new Set(ids)).map(toObjectId).filter(Boolean) as Types.ObjectId[];
  if (oids.length === 0) return new Map();
  const docs = await PreorderCampaign.find({ _id: { $in: oids } }, { title: 1, currency: 1 })
    .lean<{ _id: Types.ObjectId; title: string; currency: string }[]>()
    .exec();
  return new Map(docs.map((d) => [String(d._id), { title: d.title, currency: d.currency }]));
}

export async function listAgentSubmissions(query: AgentSubmissionQuery, paging: Paging) {
  await connectDB();
  const filter = submissionFilter(query);
  if (!filter) return { total: 0, items: [] };
  const [docs, total] = await Promise.all([
    // The heavy snapshot parts (lines, tabs) are not needed for the list.
    PreorderSubmission.find(filter, { "snapshot.lines": 0, "snapshot.tabs": 0 })
      .sort({ submittedAt: -1, updatedAt: -1, _id: -1 })
      .skip(paging.skip)
      .limit(paging.limit)
      .exec() as Promise<IPreorderSubmission[]>,
    PreorderSubmission.countDocuments(filter).exec(),
  ]);
  const campaigns = await campaignLookup(docs.map((d) => String(d.campaignId)));
  return { total, items: docs.map((d) => toAgentSubmission(d, campaigns.get(String(d.campaignId)) ?? null)) };
}

export async function getAgentSubmission(id: string) {
  const oid = toObjectId(id);
  if (!oid) return null;
  await connectDB();
  const doc = (await PreorderSubmission.findById(oid).exec()) as IPreorderSubmission | null;
  if (!doc) return null;
  const campaignDoc = (await PreorderCampaign.findById(doc.campaignId).exec()) as IPreorderCampaign | null;
  const v = toSubmissionView(doc);
  const base = toAgentSubmission(doc, campaignDoc ? { title: campaignDoc.title, currency: campaignDoc.currency } : null);

  let lines;
  if (v.snapshot && v.snapshot.lines.length) {
    // The frozen commercial snapshot: exactly what was submitted and registered.
    lines = v.snapshot.lines.map((l) => ({
      rowId: l.rowId,
      code: l.code,
      name: l.name,
      variantLabel: l.variantLabel ?? null,
      tabName: l.tabName,
      groupName: l.groupName,
      qty: l.qty,
      unitPrice: l.unitPrice, // list unit price before the volume tier
      rrp: l.rrp ?? null, // gross reference price
      partnerPrice: l.partnerPrice ?? null, // net partner price
      tierPct: l.tierPct ?? null,
      fixedPrice: !!l.fixedPrice,
      unitNet: l.unitNet ?? null,
      unitVat: l.unitVat ?? null,
      unitGross: l.unitGross ?? null,
      lineNet: l.lineNet ?? (l.unitNet != null ? round2(l.unitNet * l.qty) : round2(l.unitPrice * l.qty)),
      lineVat: l.lineVat ?? null,
      lineGross: l.lineGross ?? null,
      priceSource: l.priceSource,
    }));
  } else {
    // A draft (or a legacy submission with no snapshot): quantities only, named and
    // priced from the campaign's CURRENT sheet (no tier / VAT applied).
    const rows = new Map<string, { name: string; variantLabel: string | null; size: string | null; tab: string; group: string; rrp: number | null; partner: number | null; discounted: number | null }>();
    if (campaignDoc) {
      for (const t of toCampaignView(campaignDoc).tabs)
        for (const g of t.groups)
          for (const r of g.rows)
            rows.set(r.id, {
              name: r.name,
              variantLabel: r.variantLabel ?? null,
              size: r.size ?? null,
              tab: t.name,
              group: g.name,
              rrp: r.rrp ?? null,
              partner: r.partnerPrice ?? null,
              discounted: r.discountedPrice ?? null,
            });
    }
    lines = v.lines.map((l) => {
      const r = rows.get(l.rowId);
      const unit = r ? (r.discounted ?? r.partner ?? null) : null;
      return {
        rowId: l.rowId,
        code: l.code,
        name: r?.name ?? null,
        variantLabel: r?.variantLabel ?? r?.size ?? null,
        tabName: r?.tab ?? null,
        groupName: r?.group ?? null,
        qty: l.qty,
        unitPrice: unit,
        rrp: r?.rrp ?? null,
        partnerPrice: r?.partner ?? null,
        tierPct: null,
        fixedPrice: false,
        unitNet: null,
        unitVat: null,
        unitGross: null,
        lineNet: unit != null ? round2(unit * l.qty) : null,
        lineVat: null,
        lineGross: null,
        priceSource: "current-sheet",
        confirmedQty: l.confirmedQty ?? null,
        lineStatus: l.lineStatus ?? null,
      };
    });
  }

  const snap = v.snapshot;
  return {
    ...base,
    terms: v.terms,
    unlockRequestNote: v.unlockRequest?.note ?? null,
    lines,
    pricing: {
      source: snap ? "snapshot" : "none",
      currency: base.currency,
      kind: snap?.pricing?.kind ?? null,
      basis: snap?.pricing?.basis ?? null,
      countryIso: snap?.pricing?.countryIso ?? snap?.countryIso ?? null,
      vatRate: snap?.pricing?.vatRate ?? null,
      vatSource: snap?.pricing?.vatSource ?? null,
      partnerPricelist: snap?.partnerPricelist ?? null,
      market: snap?.market ?? null,
      tiers: (snap?.tabs ?? []).map((t) => ({ tabName: t.tabName, tiers: t.tiers.map((x) => ({ minAmount: x.minAmount, discountPct: x.discountPct })) })),
      totals: snap?.pricing?.totals ?? null, // {net, vat, gross} as invoiced
      submissionTotals: v.totals, // {qty, amount, discount, net} in the customer's basis
    },
    resultPublishedAt: v.resultPublishedAt ?? null,
    mkOrderLastSeen: v.mkOrder?.lastSeen
      ? { at: v.mkOrder.lastSeen.at, sumAll: v.mkOrder.lastSeen.sumAll, statusDesc: v.mkOrder.lastSeen.statusDesc, lineQty: v.mkOrder.lastSeen.lineQty }
      : null,
    mkSalesOrderHistory: (v.mkSalesOrderHistory ?? []).map((h) => ({
      countCode: h.countCode,
      mkId: h.mkId,
      detachedAt: h.detachedAt,
      detachedBy: h.detachedBy,
      deletedInMk: h.deletedInMk,
      reason: h.reason,
    })),
  };
}
