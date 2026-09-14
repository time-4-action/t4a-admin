import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongo, stopMongo, clearMongo } from "./helpers/mongo";
import { baseCampaign } from "./helpers/fixtures";
import { PreorderCampaign, type IPreorderCampaign } from "@/models/preorder-campaign";
import { MkCustomer } from "@/models/mk-customer";
import { assignCountries, deleteCustomerRule, deleteMarket, replaceMarkets, upsertCustomerRule, upsertMarket } from "@/lib/preorder-markets";
import { toCampaignAdminView } from "@/lib/preorder";
import { updateMkCustomerManual, upsertMkCustomer, effectiveCountryIso } from "@/lib/mk-customers";
import { resolveEffectiveCampaign } from "@/lib/preorder-effective";

async function makeCampaign(): Promise<IPreorderCampaign> {
  const c = baseCampaign();
  return PreorderCampaign.create({ title: c.title, currency: "EUR", status: "open", partnerPricelist: "Partner", tabs: c.tabs });
}

beforeAll(startMongo);
afterAll(stopMongo);
beforeEach(clearMongo);

describe("markets configuration", () => {
  it("rejects a country in two markets", async () => {
    const doc = await makeCampaign();
    const res = await replaceMarkets(doc, [
      { name: "DACH", countries: ["de", "AT"], config: {} },
      { name: "Alpine", countries: ["AT", "CH"], config: {} },
    ]);
    expect(Array.isArray(res)).toBe(false);
    if (!Array.isArray(res)) expect(res.conflicts).toEqual([{ iso: "AT", markets: ["DACH", "Alpine"] }]);
    const one = await upsertMarket(doc, { name: "DACH", countries: ["DE", "AT"] });
    expect("error" in one).toBe(false);
    const two = await upsertMarket(doc, { name: "Alpine", countries: ["AT"] });
    expect("error" in two && two.status).toBe(400);
  });

  it("round-trips inherit vs override on the config layer", async () => {
    const doc = await makeCampaign();
    const m = await upsertMarket(doc, { name: "M", countries: ["SI"], config: { currency: "CHF", note: null, tiersByTab: [{ tabId: "tab-sails", tiers: [] }], hiddenIds: [] } });
    if ("error" in m) throw new Error(m.error);
    const fresh = (await PreorderCampaign.findById(doc._id).exec())!;
    const view = toCampaignAdminView(fresh).markets[0];
    expect(view.config).toEqual({ currency: "CHF", note: null, tiersByTab: [{ tabId: "tab-sails", tiers: [] }], hiddenIds: [] });
    expect("partnerPricelist" in view.config).toBe(false);
    expect("deadline" in view.config).toBe(false);
    // A partial PATCH without `config` keeps the layer untouched.
    const renamed = await upsertMarket(fresh, { name: "Renamed" }, view.id);
    if ("error" in renamed) throw new Error(renamed.error);
    expect(renamed.config).toEqual(view.config);
    // The resolver honours the [] tiers override and the explicit null note.
    const eff = resolveEffectiveCampaign(toCampaignAdminView(fresh), { partnerMkId: "x", countryIso: "SI", countrySource: "mk" });
    expect(eff.tabs[0].tiers).toEqual([]);
    expect(eff.currency).toBe("CHF");
  });

  it("prunes assortment ids that are not on the sheet", async () => {
    const doc = await makeCampaign();
    const m = await upsertMarket(doc, { name: "M", countries: ["SI"], config: { hiddenIds: ["s1", "ghost"], exposedIds: ["grp-b"], tiersByTab: [{ tabId: "nope", tiers: [] }] } });
    if ("error" in m) throw new Error(m.error);
    expect(m.config.hiddenIds).toEqual(["s1"]);
    expect(m.config.exposedIds).toEqual(["grp-b"]);
    expect(m.config.tiersByTab).toEqual([]);
  });

  it("assignCountries moves countries between markets; deleteMarket nulls rule assignments", async () => {
    const doc = await makeCampaign();
    const a = await upsertMarket(doc, { name: "A", countries: ["SI", "HR"] });
    const b = await upsertMarket(doc, { name: "B", countries: ["IT"] });
    if ("error" in a || "error" in b) throw new Error("setup");
    expect(await assignCountries(doc, b.id, ["HR", "AT"])).toBe(true);
    let view = toCampaignAdminView(doc);
    expect(view.markets.find((m) => m.id === a.id)?.countries).toEqual(["SI"]);
    expect(view.markets.find((m) => m.id === b.id)?.countries.sort()).toEqual(["AT", "HR", "IT"]);

    const rule = await upsertCustomerRule(doc, "p1", { partnerName: "P", marketId: b.id, config: { partnerPricelist: "VIP" } }, "admin@test");
    if ("error" in rule) throw new Error(rule.error);
    const del = await deleteMarket(doc, b.id);
    if ("error" in del) throw new Error(del.error);
    expect(del.affectedPartners).toEqual(["p1"]);
    view = toCampaignAdminView(doc);
    expect(view.markets.map((m) => m.id)).toEqual([a.id]);
    expect(view.customerRules[0].marketId).toBeNull();
    expect(view.customerRules[0].config).toEqual({ partnerPricelist: "VIP" });
    expect(await deleteCustomerRule(doc, "p1")).toBe(true);
    expect(await deleteCustomerRule(doc, "p1")).toBe(false);
  });

  it("customer rule with an unknown market is rejected; manual country is normalised", async () => {
    const doc = await makeCampaign();
    const bad = await upsertCustomerRule(doc, "p1", { marketId: "nope", config: {} }, null);
    expect("error" in bad && bad.status).toBe(400);
    const ok = await upsertCustomerRule(doc, "p1", { countryIso: "de", config: { minOrderAmount: "250.5" } }, null);
    if ("error" in ok) throw new Error(ok.error);
    expect(ok.countryIso).toBe("DE");
    expect(ok.config.minOrderAmount).toBe(250.5);
  });
});

describe("customer directory", () => {
  const partner = {
    mkId: "p9",
    name: "Shop 9",
    emails: ["nine@example.com"],
    address: { street: "Ulica 9", postNumber: "1000", city: "Ljubljana", country: "Slovenija" },
    foreignCountry: false,
  };

  it("upsert resolves the country and never touches admin-owned fields", async () => {
    await upsertMkCustomer(partner);
    let doc = (await MkCustomer.findOne({ partnerMkId: "p9" }).exec())!;
    expect(doc.countryIso).toBe("SI");
    expect(doc.countrySource).toBe("mk");
    await updateMkCustomerManual("p9", { manualGeo: { lat: 46.05, lng: 14.5 }, countryIsoManual: "at" }, "admin");
    await upsertMkCustomer({ ...partner, name: "Shop 9 renamed" });
    doc = (await MkCustomer.findOne({ partnerMkId: "p9" }).exec())!;
    expect(doc.name).toBe("Shop 9 renamed");
    expect(doc.manualGeo?.lat).toBe(46.05);
    expect(doc.countryIsoManual).toBe("AT");
    expect(effectiveCountryIso(doc)).toBe("AT");
  });

  it("throttled upsert skips a fresh record", async () => {
    await upsertMkCustomer(partner);
    const first = (await MkCustomer.findOne({ partnerMkId: "p9" }).exec())!;
    await new Promise((r) => setTimeout(r, 5));
    await upsertMkCustomer({ ...partner, name: "Changed" }, { throttleMs: 60_000 });
    const second = (await MkCustomer.findOne({ partnerMkId: "p9" }).exec())!;
    expect(second.name).toBe("Shop 9");
    expect(second.mkSyncedAt.getTime()).toBe(first.mkSyncedAt.getTime());
  });
});
