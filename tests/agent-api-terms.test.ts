// POST /api/agent/preorders/campaigns/:id/terms: volume-discount ladders and commercial
// terms on the campaign / market / customer layer, against seeded Mongo
// (mongodb-memory-server). Checks the stored layers and what a partner effectively sees.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ refresh: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/preorder-pricebooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/preorder-pricebooks")>()),
  refreshPriceBooks: h.refresh,
}));

import { startMongo, stopMongo, clearMongo } from "./helpers/mongo";
import { baseCampaign } from "./helpers/fixtures";
import { loadEffectiveCampaignForPartner } from "@/lib/preorder";
import { PreorderCampaign, type IPreorderCampaign } from "@/models/preorder-campaign";
import { MkCustomer } from "@/models/mk-customer";
import * as termsRoute from "@/app/api/agent/preorders/campaigns/[id]/terms/route";

const WRITE = "w".repeat(64);
const READ = "r".repeat(64);
const ACTOR = { sub: "auth0|staff-1", name: "Maja Novak", email: "maja@t4a.test" };

async function post(body: unknown, id: string, token = WRITE) {
  const res = await termsRoute.POST(
    new Request("http://admin.test/api/agent/preorders/campaigns/x/terms", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function makeCampaign(): Promise<IPreorderCampaign> {
  const c = baseCampaign();
  return PreorderCampaign.create({
    title: c.title, season: c.season, currency: c.currency, status: "open", partnerPricelist: c.partnerPricelist, rrpPricelist: c.rrpPricelist,
    tabs: c.tabs, customerRules: [], priceBooks: [], vatOverrides: [],
    markets: [{ id: "m-de", name: "Germany", color: "sky", countries: ["DE"], config: {} }],
  });
}

const fresh = async (c: IPreorderCampaign) => (await PreorderCampaign.findById(c._id).exec())!;
const ladder = (tiers: { minAmount: number; discountPct: number }[] | undefined) => (tiers ?? []).map((t) => [t.minAmount, t.discountPct]);

vi.spyOn(console, "info").mockImplementation(() => undefined);

beforeAll(async () => {
  process.env.AGENT_WRITE_TOKEN = WRITE;
  process.env.AGENT_READ_TOKEN = READ;
  await startMongo();
});
afterAll(async () => {
  delete process.env.AGENT_WRITE_TOKEN;
  delete process.env.AGENT_READ_TOKEN;
  await stopMongo();
});
beforeEach(async () => {
  await clearMongo();
  h.refresh.mockClear();
});

describe("POST /api/agent/preorders/campaigns/:id/terms", () => {
  it("needs the write token and an actor", async () => {
    const c = await makeCampaign();
    const body = { actor: ACTOR, layer: "campaign", tiers: [{ tabId: "tab-sails", tiers: [] }] };
    expect((await post(body, String(c._id), READ)).status).toBe(401);
    expect((await post({ ...body, actor: undefined }, String(c._id))).status).toBe(400);
  });

  it("rejects bad bodies with the reasons", async () => {
    const c = await makeCampaign();
    const id = String(c._id);
    const bad = [
      { layer: "planet" },
      { layer: "campaign" },
      { layer: "campaign", tiers: [{ tabId: "tab-sails", tiers: null }] },
      { layer: "campaign", set: { note: "x" } },
      { layer: "market", tiers: [{ tabId: "tab-sails", tiers: [] }] },
      { layer: "customer", marketId: "m-de", set: { note: "x" } },
      { layer: "market", marketId: "m-de", tiers: [{ tabId: "tab-sails", tiers: [{ minAmount: 100, discountPct: 140 }] }] },
      { layer: "market", marketId: "m-de", set: { vatRate: 0 } },
      { layer: "market", marketId: "m-de", set: { deadline: "soon" } },
      { layer: "market", marketId: "m-de", removeRule: true },
    ];
    for (const b of bad) {
      const r = await post({ actor: ACTOR, ...b }, id);
      expect(r.status, JSON.stringify(b)).toBe(400);
      expect(r.body.details.length).toBeGreaterThan(0);
    }
    expect((await post({ actor: ACTOR, layer: "campaign", tiers: [{ tabId: "nope", tiers: [] }] }, id)).status).toBe(400);
    expect((await post({ actor: ACTOR, layer: "market", marketId: "m-xx", set: { note: "x" } }, id)).status).toBe(404);
    expect((await post({ actor: ACTOR, layer: "customer", partnerMkId: "ghost", set: { note: "x" } }, id)).status).toBe(404);
    expect((await post({ actor: ACTOR, layer: "campaign", tiers: [{ tabId: "tab-sails", tiers: [] }] }, "000000000000000000000000")).status).toBe(404);
  });

  it("replaces a tab's default ladder (sorted, ids given) and leaves other tabs alone", async () => {
    const c = await makeCampaign();
    const r = await post({ actor: ACTOR, layer: "campaign", tiers: [{ tabId: "tab-sails", tiers: [{ name: "Big", minAmount: 8000, discountPct: 15 }, { minAmount: 2000, discountPct: 7.5 }] }] }, String(c._id));
    expect(r.status).toBe(200);
    expect(r.body.tabs.find((t: { id: string }) => t.id === "tab-sails").tiers).toEqual([
      { name: "", minAmount: 2000, discountPct: 7.5 },
      { name: "Big", minAmount: 8000, discountPct: 15 },
    ]);
    const doc = await fresh(c);
    expect(doc.tabs[0].tiers!.every((t) => t.id)).toBe(true);
    expect(doc.tabs[1].tiers).toEqual([]);
  });

  it("sets and clears a market's ladder and terms", async () => {
    const c = await makeCampaign();
    const id = String(c._id);
    let r = await post({ actor: ACTOR, layer: "market", marketId: "m-de", tiers: [{ tabId: "tab-masts", tiers: [{ minAmount: 500, discountPct: 3 }] }], set: { deadline: "2027-02-15T00:00:00.000Z", minOrderAmount: 1500 } }, id);
    expect(r.status).toBe(200);
    let m = r.body.markets[0];
    expect(m.config.minOrderAmount).toBe(1500);
    expect(m.config.deadline).toBe("2027-02-15T00:00:00.000Z");
    expect(ladder(m.config.tiersByTab[0].tiers)).toEqual([[500, 3]]);
    // Name and countries stay as they were.
    expect(m).toMatchObject({ name: "Germany", countries: ["DE"] });

    r = await post({ actor: ACTOR, layer: "market", marketId: "m-de", tiers: [{ tabId: "tab-masts", tiers: null }], inherit: ["deadline"] }, id);
    m = r.body.markets[0];
    expect(m.config.tiersByTab).toBeUndefined();
    expect(m.config.deadline).toBeUndefined();
    expect(m.config.minOrderAmount).toBe(1500);
  });

  it("gives one customer their own discount (rule created from the directory), which they then see", async () => {
    await MkCustomer.create({ partnerMkId: "p9", name: "Surf Shop Nine", lastSeenInMk: new Date(), mkSyncedAt: new Date() });
    const c = await makeCampaign();
    const r = await post({ actor: ACTOR, layer: "customer", partnerMkId: "p9", tiers: [{ tabId: "tab-sails", tiers: [{ minAmount: 0, discountPct: 20 }] }], set: { note: "Loyalty deal" } }, String(c._id));
    expect(r.status).toBe(200);
    const rule = r.body.customerRules.find((x: { partnerMkId: string }) => x.partnerMkId === "p9");
    expect(rule).toMatchObject({ partnerName: "Surf Shop Nine", config: { note: "Loyalty deal" } });
    const doc = await fresh(c);
    expect(doc.customerRules[0].updatedBy).toBe("Maja Novak (T4A agent)");

    const eff = await loadEffectiveCampaignForPartner(doc, { mkId: "p9", countryIso: "SI", countrySource: null, kind: "business" });
    expect(ladder(eff.tabs.find((t) => t.id === "tab-sails")!.tiers)).toEqual([[0, 20]]);
    const other = await loadEffectiveCampaignForPartner(doc, { mkId: "p1", countryIso: "SI", countrySource: null, kind: "business" });
    expect(ladder(other.tabs.find((t) => t.id === "tab-sails")!.tiers)).toEqual([[1000, 5], [5000, 10]]);

    const removed = await post({ actor: ACTOR, layer: "customer", partnerMkId: "p9", removeRule: true }, String(c._id));
    expect(removed.body.customerRules).toEqual([]);
    expect((await post({ actor: ACTOR, layer: "customer", partnerMkId: "p9", removeRule: true }, String(c._id))).status).toBe(404);
  });

  it("reads a price list's prices the first time a layer uses it", async () => {
    const c = await makeCampaign();
    const r = await post({ actor: ACTOR, layer: "market", marketId: "m-de", set: { partnerPricelist: "VP DE" } }, String(c._id));
    expect(r.body.pricelistRefreshed).toBe("VP DE");
    expect(h.refresh).toHaveBeenCalledTimes(1);
    const again = await post({ actor: ACTOR, layer: "market", marketId: "m-de", set: { note: "x" } }, String(c._id));
    expect(again.body.pricelistRefreshed).toBeNull();
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
});
