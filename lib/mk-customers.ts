import "server-only";

// lib/mk-customers.ts
//
// The local Metakocka partner directory (models/mk-customer.ts): upserts from any
// MkPartner that passes through the preorder flow, the explicit full sync, and the
// read helpers the Markets & Customers views use. Metakocka is touched ONLY by the
// sync and by per-customer refreshes — never on a page render.

import { connectDB } from "@/lib/mongodb";
import { MkCustomer, MkCustomerSyncState, MK_CUSTOMER_SYNC_ID, type IMkCustomer } from "@/models/mk-customer";
import { callMetakocka, getPartnerById, mapPartnerRaw } from "@/lib/metakocka";
import { countryIsoFromPartner, countryName } from "@/lib/countries";
import { normalizeIso } from "@/lib/countries-client";
import { cached } from "@/lib/auth0-cache";
import type { MkPartner } from "@/types/documents";

// ── wire shape ────────────────────────────────────────────────────────────────

export type MkCustomerView = {
  partnerMkId: string;
  countCode: string | null;
  name: string;
  email: string | null;
  emails: string[];
  phone: string | null;
  city: string | null;
  street: string | null;
  postNumber: string | null;
  countryRaw: string | null;
  countryIso: string | null; // effective (manual override wins)
  countryName: string;
  countrySource: "mk" | "manual" | "home-fallback" | null;
  manualGeo: { lat: number; lng: number } | null;
  mkSyncedAt: string | null;
  stale: boolean;
};

export function effectiveCountryIso(c: Pick<IMkCustomer, "countryIso" | "countryIsoManual">): string | null {
  return normalizeIso(c.countryIsoManual) ?? normalizeIso(c.countryIso) ?? null;
}

export function toMkCustomerView(c: IMkCustomer): MkCustomerView {
  const iso = effectiveCountryIso(c);
  return {
    partnerMkId: c.partnerMkId,
    countCode: c.countCode ?? null,
    name: c.name,
    email: c.emails?.[0] ?? null,
    emails: c.emails ?? [],
    phone: c.phone ?? null,
    city: c.address?.city ?? null,
    street: c.address?.street ?? null,
    postNumber: c.address?.postNumber ?? null,
    countryRaw: c.address?.countryRaw ?? null,
    countryIso: iso,
    countryName: countryName(iso),
    countrySource: c.countryIsoManual ? "manual" : c.countrySource ?? null,
    manualGeo: c.manualGeo ? { lat: c.manualGeo.lat, lng: c.manualGeo.lng } : null,
    mkSyncedAt: c.mkSyncedAt ? new Date(c.mkSyncedAt).toISOString() : null,
    stale: !!c.stale,
  };
}

// ── upserts ───────────────────────────────────────────────────────────────────

function mkFields(p: MkPartner, now: Date) {
  const country = countryIsoFromPartner(p);
  return {
    countCode: p.countCode ?? null,
    name: p.name,
    emails: p.emails ?? [],
    phone: p.phone ?? null,
    taxId: p.taxId ?? null,
    businessEntity: p.businessEntity ?? null,
    foreignCountry: p.foreignCountry ?? null,
    address: {
      street: p.address?.street ?? null,
      postNumber: p.address?.postNumber ?? null,
      city: p.address?.city ?? p.city ?? null,
      countryRaw: p.address?.country ?? null,
    },
    countryIso: country.iso,
    countrySource: country.source === "manual" ? null : country.source,
    mkSyncedAt: now,
    lastSeenInMk: now,
    stale: false,
  };
}

// Upsert one partner's MK-derived fields; admin-owned fields (manualGeo,
// countryIsoManual) are never touched. `throttleMs` skips the write when the record
// was synced recently (portal page loads call this on every request).
export async function upsertMkCustomer(p: MkPartner, opts: { throttleMs?: number } = {}): Promise<void> {
  await connectDB();
  if (opts.throttleMs) {
    const recent = await MkCustomer.exists({ partnerMkId: p.mkId, mkSyncedAt: { $gt: new Date(Date.now() - opts.throttleMs) } });
    if (recent) return;
  }
  await MkCustomer.updateOne({ partnerMkId: p.mkId }, { $set: mkFields(p, new Date()) }, { upsert: true }).exec();
}

// Re-read ONE partner from Metakocka into the directory.
export async function refreshMkCustomer(partnerMkId: string): Promise<IMkCustomer | null> {
  const p = await getPartnerById(partnerMkId);
  if (!p) return null;
  await upsertMkCustomer(p);
  return MkCustomer.findOne({ partnerMkId }).exec();
}

export async function getMkCustomer(partnerMkId: string): Promise<IMkCustomer | null> {
  await connectDB();
  return MkCustomer.findOne({ partnerMkId }).exec();
}

// ── full sync ─────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var _mkCustomerSync: { running: boolean } | undefined;
}
const syncGuard = (global._mkCustomerSync ??= { running: false });

const SYNC_TIMEOUT_MS = 120_000;
const BATCH = 500;

async function fetchAllPartners(): Promise<MkPartner[]> {
  const mode = (process.env.MK_PARTNER_SYNC_MODE || "all").toLowerCase();
  if (mode !== "sharded") {
    // An empty partner_name matches every partner (documented-by-use in searchPartners).
    const res = await callMetakocka("get_partner", { partner_name: "" }, { timeoutMs: SYNC_TIMEOUT_MS });
    if (!res.ok) throw new Error(res.error);
    const list = Array.isArray(res.data.partner_list) ? (res.data.partner_list as Record<string, unknown>[]) : [];
    return list.map(mapPartnerRaw);
  }
  // Sharded fallback for very large registers: one like-query per leading character.
  const byId = new Map<string, MkPartner>();
  for (const ch of "abcdefghijklmnopqrstuvwxyz0123456789čšž") {
    const res = await callMetakocka("get_partner", { partner_name: ch }, { timeoutMs: SYNC_TIMEOUT_MS });
    if (!res.ok) throw new Error(res.error);
    const list = Array.isArray(res.data.partner_list) ? (res.data.partner_list as Record<string, unknown>[]) : [];
    for (const raw of list) {
      const p = mapPartnerRaw(raw);
      byId.set(p.mkId, p);
    }
  }
  return Array.from(byId.values());
}

export async function getSyncState() {
  await connectDB();
  const s = await MkCustomerSyncState.findById(MK_CUSTOMER_SYNC_ID).lean().exec();
  return {
    running: !!s?.running || syncGuard.running,
    startedAt: s?.startedAt ? new Date(s.startedAt).toISOString() : null,
    finishedAt: s?.finishedAt ? new Date(s.finishedAt).toISOString() : null,
    ok: s?.ok ?? null,
    count: s?.count ?? 0,
    error: s?.error ?? null,
  };
}

// Start the full sync in the background (fire-and-poll). Returns false when one is
// already running in this process.
export async function startMkCustomerSync(): Promise<boolean> {
  await connectDB();
  if (syncGuard.running) return false;
  syncGuard.running = true;
  const startedAt = new Date();
  await MkCustomerSyncState.updateOne(
    { _id: MK_CUSTOMER_SYNC_ID },
    { $set: { running: true, startedAt, finishedAt: null, ok: null, error: null } },
    { upsert: true },
  ).exec();

  void (async () => {
    try {
      const partners = await fetchAllPartners();
      const now = new Date();
      for (let i = 0; i < partners.length; i += BATCH) {
        const slice = partners.slice(i, i + BATCH);
        await MkCustomer.bulkWrite(
          slice.map((p) => ({
            updateOne: { filter: { partnerMkId: p.mkId }, update: { $set: mkFields(p, now) }, upsert: true },
          })),
          { ordered: false },
        );
      }
      await MkCustomer.updateMany({ lastSeenInMk: { $lt: now } }, { $set: { stale: true } }).exec();
      await MkCustomerSyncState.updateOne(
        { _id: MK_CUSTOMER_SYNC_ID },
        { $set: { running: false, finishedAt: new Date(), ok: true, count: partners.length, error: null } },
      ).exec();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await MkCustomerSyncState.updateOne(
        { _id: MK_CUSTOMER_SYNC_ID },
        { $set: { running: false, finishedAt: new Date(), ok: false, error: msg.slice(0, 500) } },
      )
        .exec()
        .catch(() => undefined);
    } finally {
      syncGuard.running = false;
    }
  })();
  return true;
}

// ── reads ─────────────────────────────────────────────────────────────────────

export type CustomerListQuery = {
  q?: string;
  countryIso?: string | null; // "" = any, "none" = unresolved
  partnerMkIds?: string[]; // restrict to these ids (campaign-scoped filters)
  includeStale?: boolean;
  page?: number;
  pageSize?: number;
};

export async function listMkCustomers(query: CustomerListQuery): Promise<{ items: IMkCustomer[]; total: number; page: number; pageSize: number }> {
  await connectDB();
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
  const filter: Record<string, unknown> = {};
  if (!query.includeStale) filter.stale = { $ne: true };
  if (query.partnerMkIds) filter.partnerMkId = { $in: query.partnerMkIds };
  if (query.countryIso === "none") {
    filter.$and = [{ $or: [{ countryIso: null }, { countryIso: "" }] }, { $or: [{ countryIsoManual: null }, { countryIsoManual: "" }] }];
  } else if (query.countryIso) {
    const iso = query.countryIso.toUpperCase();
    filter.$or = [{ countryIsoManual: iso }, { countryIsoManual: null, countryIso: iso }, { countryIsoManual: "", countryIso: iso }];
  }
  const q = query.q?.trim();
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$and = [...((filter.$and as unknown[]) ?? []), { $or: [{ name: re }, { emails: re }, { "address.city": re }, { countCode: re }, { partnerMkId: q }] }];
  }
  const [items, total] = await Promise.all([
    MkCustomer.find(filter).sort({ name: 1 }).skip((page - 1) * pageSize).limit(pageSize).exec(),
    MkCustomer.countDocuments(filter).exec(),
  ]);
  return { items, total, page, pageSize };
}

export async function getMkCustomersByIds(ids: string[]): Promise<Map<string, IMkCustomer>> {
  await connectDB();
  if (ids.length === 0) return new Map();
  const docs = await MkCustomer.find({ partnerMkId: { $in: ids } }).exec();
  return new Map(docs.map((d) => [d.partnerMkId, d]));
}

// Customers per effective country (manual override wins). Cached 60 s.
export function countMkCustomersByCountry(): Promise<Record<string, number>> {
  return cached("mk-customers:by-country", 60_000, async () => {
    await connectDB();
    const rows = await MkCustomer.aggregate<{ _id: string | null; n: number }>([
      { $match: { stale: { $ne: true } } },
      { $project: { iso: { $ifNull: [{ $cond: [{ $gt: ["$countryIsoManual", ""] }, "$countryIsoManual", null] }, "$countryIso"] } } },
      { $group: { _id: "$iso", n: { $sum: 1 } } },
    ]);
    const out: Record<string, number> = {};
    for (const r of rows) out[r._id ?? "none"] = r.n;
    return out;
  });
}

export async function countMkCustomers(): Promise<number> {
  await connectDB();
  return MkCustomer.countDocuments({ stale: { $ne: true } }).exec();
}

// Every customer with a manual pin (small set — admins place these by hand).
export async function listManualPins(): Promise<{ partnerMkId: string; name: string; lat: number; lng: number; countryIso: string | null }[]> {
  await connectDB();
  const docs = await MkCustomer.find({ manualGeo: { $ne: null }, stale: { $ne: true } }).limit(5000).exec();
  return docs
    .filter((d) => d.manualGeo)
    .map((d) => ({ partnerMkId: d.partnerMkId, name: d.name, lat: d.manualGeo!.lat, lng: d.manualGeo!.lng, countryIso: effectiveCountryIso(d) }));
}

// Admin-owned fields on a directory record.
export async function updateMkCustomerManual(
  partnerMkId: string,
  patch: { manualGeo?: { lat: number; lng: number } | null; countryIsoManual?: string | null },
  by: string | null,
): Promise<IMkCustomer | null> {
  await connectDB();
  const $set: Record<string, unknown> = {};
  if (patch.manualGeo !== undefined) {
    $set.manualGeo = patch.manualGeo ? { lat: patch.manualGeo.lat, lng: patch.manualGeo.lng, setBy: by, setAt: new Date() } : null;
  }
  if (patch.countryIsoManual !== undefined) $set.countryIsoManual = normalizeIso(patch.countryIsoManual);
  if (Object.keys($set).length === 0) return MkCustomer.findOne({ partnerMkId }).exec();
  return MkCustomer.findOneAndUpdate({ partnerMkId }, { $set }, { returnDocument: "after" }).exec();
}
