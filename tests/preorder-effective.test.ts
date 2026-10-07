import { describe, expect, it } from "vitest";
import { resolveEffectiveCampaign, resolvePartnerContext, referencedPricelists } from "@/lib/preorder-effective";
import { computePricedOrder, computeTotals, flattenRows, rowUnitPrice, type PreorderCampaign } from "@/types/preorder";
import { baseCampaign } from "./helpers/fixtures";

const ctx = (iso: string | null, partnerMkId = "p1") => ({ partnerMkId, countryIso: iso, countrySource: iso ? ("mk" as const) : null });

function rowIds(c: Pick<PreorderCampaign, "tabs">): string[] {
  return flattenRows(c).map((r) => r.row.id);
}

describe("resolveEffectiveCampaign — precedence", () => {
  const campaign = baseCampaign({
    markets: [
      { id: "dach", name: "DACH", color: "sky", countries: ["DE", "AT", "CH"], config: { currency: "CHF", partnerPricelist: "DACH list", note: "Market note" } },
    ],
    customerRules: [
      { partnerMkId: "vip", partnerName: "VIP Shop", config: { partnerPricelist: "VIP 2027", note: null } },
    ],
    priceBooks: [
      { pricelist: "DACH list", currency: "CHF", entries: [{ code: "SKU-s1", net: 90 }, { code: "SKU-m1", net: 40 }], missing: 0 },
      { pricelist: "VIP 2027", currency: "EUR", entries: [{ code: "SKU-s1", net: 80 }], missing: 0 },
    ],
  });

  it("unknown / unconfigured country → campaign defaults", () => {
    const e = resolveEffectiveCampaign(campaign, ctx("SI"));
    expect(e.effective.market).toBeNull();
    expect(e.currency).toBe("EUR");
    expect(e.partnerPricelist).toBe("Partner");
    expect(e.effective.sources.currency).toBe("campaign");
    expect(e.effective.sources.pricelist).toBe("campaign");
    expect(e.effective.note).toBeNull();
    expect(rowIds(e)).toEqual(["s1", "s2", "m1"]); // restricted s3 hidden by default
  });

  it("missing country → campaign defaults, no market", () => {
    const e = resolveEffectiveCampaign(campaign, ctx(null));
    expect(e.effective.market).toBeNull();
    expect(e.effective.countryIso).toBeNull();
  });

  it("country in a market → market layer applies", () => {
    const e = resolveEffectiveCampaign(campaign, ctx("AT"));
    expect(e.effective.market?.name).toBe("DACH");
    expect(e.effective.marketSource).toBe("country");
    expect(e.currency).toBe("CHF");
    expect(e.partnerPricelist).toBe("DACH list");
    expect(e.effective.sources.currency).toBe("market");
    expect(e.effective.note).toBe("Market note");
  });

  it("customer rule beats market beats campaign, per field", () => {
    const e = resolveEffectiveCampaign(campaign, ctx("DE", "vip"));
    expect(e.partnerPricelist).toBe("VIP 2027");
    expect(e.effective.sources.pricelist).toBe("customer");
    expect(e.currency).toBe("CHF"); // inherited from the market
    expect(e.effective.sources.currency).toBe("market");
    expect(e.effective.note).toBeNull(); // explicit null override
    expect(e.effective.sources.note).toBe("customer");
    expect(e.effective.hasCustomerRule).toBe(true);
  });

  it("manual market assignment beats the country lookup", () => {
    const c = baseCampaign({
      markets: [
        { id: "a", name: "A", color: "sky", countries: ["SI"], config: { currency: "EUR" } },
        { id: "b", name: "B", color: "rose", countries: ["HR"], config: { currency: "HRK" } },
      ],
      customerRules: [{ partnerMkId: "p1", partnerName: "P", marketId: "b", config: {} }],
    });
    const e = resolveEffectiveCampaign(c, ctx("SI"));
    expect(e.effective.market?.id).toBe("b");
    expect(e.effective.marketSource).toBe("manual");
    expect(e.currency).toBe("HRK");
  });

  it("deleted market on a rule → falls back to country lookup + warning", () => {
    const c = baseCampaign({
      markets: [{ id: "a", name: "A", color: "sky", countries: ["SI"], config: { currency: "USD" } }],
      customerRules: [{ partnerMkId: "p1", partnerName: "P", marketId: "gone", config: {} }],
    });
    const e = resolveEffectiveCampaign(c, ctx("SI"));
    expect(e.effective.market?.id).toBe("a");
    expect(e.effective.warnings).toContain("market-missing:gone");
    const e2 = resolveEffectiveCampaign(c, ctx("FR"));
    expect(e2.effective.market).toBeNull();
    expect(e2.currency).toBe("EUR");
  });

  it("manual country on a rule overrides MK country", () => {
    const c = baseCampaign({ customerRules: [{ partnerMkId: "p1", partnerName: "P", countryIso: "de", config: {} }] });
    const pc = resolvePartnerContext(c, "p1", "SI", "mk");
    expect(pc).toEqual({ partnerMkId: "p1", countryIso: "DE", countrySource: "manual" });
  });
});

describe("resolveEffectiveCampaign — assortment", () => {
  it("hidden row / group / tab ids remove rows; empty tabs are dropped", () => {
    const byRow = baseCampaign({ markets: [{ id: "m", name: "M", color: "sky", countries: ["SI"], config: { hiddenIds: ["s1"] } }] });
    expect(rowIds(resolveEffectiveCampaign(byRow, ctx("SI")))).toEqual(["s2", "m1"]);
    const byGroup = baseCampaign({ markets: [{ id: "m", name: "M", color: "sky", countries: ["SI"], config: { hiddenIds: ["grp-a"] } }] });
    expect(rowIds(resolveEffectiveCampaign(byGroup, ctx("SI")))).toEqual(["m1"]);
    const byTab = baseCampaign({ markets: [{ id: "m", name: "M", color: "sky", countries: ["SI"], config: { hiddenIds: ["tab-sails"] } }] });
    const e = resolveEffectiveCampaign(byTab, ctx("SI"));
    expect(e.tabs.map((t) => t.id)).toEqual(["tab-masts"]);
    expect(e.effective.assortment.hiddenBy.market).toBe(2);
  });

  it("restricted rows are exposed via row, group or tab id", () => {
    for (const id of ["s3", "grp-b", "tab-sails"]) {
      const c = baseCampaign({ markets: [{ id: "m", name: "M", color: "sky", countries: ["SI"], config: { exposedIds: [id] } }] });
      const e = resolveEffectiveCampaign(c, ctx("SI"));
      expect(rowIds(e)).toContain("s3");
      expect(e.effective.assortment.restrictedExposed).toBe(1);
    }
  });

  it("customer layer re-exposes what the market hid, and can hide more", () => {
    const c = baseCampaign({
      markets: [{ id: "m", name: "M", color: "sky", countries: ["SI"], config: { hiddenIds: ["s1", "s2"] } }],
      customerRules: [{ partnerMkId: "p1", partnerName: "P", config: { exposedIds: ["s1"], hiddenIds: ["m1"] } }],
    });
    const e = resolveEffectiveCampaign(c, ctx("SI"));
    expect(rowIds(e)).toEqual(["s1"]);
    expect(e.effective.assortment.hiddenBy).toEqual({ market: 2, customer: 1 });
    expect(e.effective.assortment.exposed).toBe(1);
  });

  it("hidden products cannot be ordered: totals ignore quantities for hidden rows", () => {
    const c = baseCampaign({ markets: [{ id: "m", name: "M", color: "sky", countries: ["SI"], config: { hiddenIds: ["s1"] } }] });
    const e = resolveEffectiveCampaign(c, ctx("SI"));
    const t = computeTotals(e, { s1: 10, m1: 2 });
    expect(t.qty).toBe(2);
    expect(t.amount).toBe(100);
  });

  it("stale ids are reported, not fatal", () => {
    const c = baseCampaign({ customerRules: [{ partnerMkId: "p1", partnerName: "P", config: { hiddenIds: ["nope"] } }] });
    const e = resolveEffectiveCampaign(c, ctx("SI"));
    expect(e.effective.warnings).toContain("stale-assortment-id:nope");
    expect(rowIds(e)).toEqual(["s1", "s2", "m1"]);
  });
});

describe("resolveEffectiveCampaign — pricing", () => {
  it("campaign list: sheet prices, manual discountedPrice wins", () => {
    const e = resolveEffectiveCampaign(baseCampaign(), ctx("SI"));
    const rows = flattenRows(e).map((r) => r.row);
    expect(rowUnitPrice(rows[0])).toBe(100);
    expect(rows[0].priceSource).toBe("sheet");
    expect(rowUnitPrice(rows[1])).toBe(150);
    expect(rows[1].priceSource).toBe("manual");
    expect(e.effective.pricing.manual).toBe(1);
  });

  it("other list with a price book: book price overlays, manual discount dropped, missing → fallback + warning", () => {
    const c = baseCampaign({
      markets: [{ id: "m", name: "M", color: "sky", countries: ["SI"], config: { partnerPricelist: "VIP 2027" } }],
      priceBooks: [{ pricelist: "VIP 2027", currency: "EUR", entries: [{ code: "SKU-s1", net: 80, taxCode: "EX1" }, { code: "SKU-s2", net: 160 }], missing: 1 }],
    });
    const e = resolveEffectiveCampaign(c, ctx("SI"));
    const rows = flattenRows(e).map((r) => r.row);
    expect(rowUnitPrice(rows[0])).toBe(80);
    expect(rows[0].taxCode).toBe("EX1");
    expect(rowUnitPrice(rows[1])).toBe(160); // discountedPrice 150 ignored
    expect(rows[1].discountedPrice).toBeNull();
    expect(rowUnitPrice(rows[2])).toBe(50); // m1 missing from the book → sheet price
    expect(rows[2].priceSource).toBe("fallback");
    expect(e.effective.pricing).toMatchObject({ pricelist: "VIP 2027", fromBook: 2, fallback: 1, manual: 0 });
    expect(e.effective.warnings).toContain("price-missing:SKU-m1");
    expect(computeTotals(e, { s1: 1, s2: 1, m1: 1 }).amount).toBe(290);
  });

  it("other list without a book: everything falls back + warning", () => {
    const c = baseCampaign({ customerRules: [{ partnerMkId: "p1", partnerName: "P", config: { partnerPricelist: "Ghost" } }] });
    const e = resolveEffectiveCampaign(c, ctx("SI"));
    expect(e.effective.warnings).toContain("price-book-missing:Ghost");
    expect(flattenRows(e).every((r) => r.row.priceSource === "fallback")).toBe(true);
    expect(rowUnitPrice(flattenRows(e)[1].row)).toBe(150);
  });

  it("currency mismatch between book and effective currency is reported", () => {
    const c = baseCampaign({
      markets: [{ id: "m", name: "M", color: "sky", countries: ["SI"], config: { partnerPricelist: "CHF list" } }],
      priceBooks: [{ pricelist: "CHF list", currency: "CHF", entries: [], missing: 0 }],
    });
    expect(resolveEffectiveCampaign(c, ctx("SI")).effective.warnings).toContain("currency-mismatch:CHF vs EUR");
  });

  it("referencedPricelists lists every non-default list once", () => {
    const c = baseCampaign({
      markets: [{ id: "m", name: "M", color: "sky", countries: [], config: { partnerPricelist: "X" } }],
      customerRules: [
        { partnerMkId: "a", partnerName: "", config: { partnerPricelist: "x" } },
        { partnerMkId: "b", partnerName: "", config: { partnerPricelist: "Partner" } },
      ],
    });
    expect(referencedPricelists(c)).toEqual(["X"]);
  });
});

describe("resolveEffectiveCampaign — tiers", () => {
  it("per-tab precedence: customer > market > campaign; [] means no tiers", () => {
    const c = baseCampaign({
      markets: [
        { id: "m", name: "M", color: "sky", countries: ["SI"], config: { tiersByTab: [{ tabId: "tab-sails", tiers: [{ id: "x", name: "Market tier", minAmount: 100, discountPct: 20 }] }] } },
      ],
      customerRules: [{ partnerMkId: "none", partnerName: "", config: { tiersByTab: [{ tabId: "tab-sails", tiers: [] }] } }],
    });
    const market = resolveEffectiveCampaign(c, ctx("SI"));
    expect(market.tabs[0].tiers?.[0].discountPct).toBe(20);
    expect(market.effective.sources.tiers["tab-sails"]).toBe("market");
    expect(market.effective.sources.tiers["tab-masts"]).toBe("campaign");
    const t = computeTotals(market, { s1: 2 });
    expect(t.discount).toBe(40);
    expect(t.net).toBe(160);

    const none = resolveEffectiveCampaign(c, ctx("SI", "none"));
    expect(none.tabs[0].tiers).toEqual([]);
    expect(none.effective.sources.tiers["tab-sails"]).toBe("customer");
    expect(computeTotals(none, { s1: 100 }).discount).toBe(0);

    const def = resolveEffectiveCampaign(c, ctx("FR"));
    expect(def.tabs[0].tiers?.map((x) => x.name)).toEqual(["Silver", "Gold"]);
    expect(computeTotals(def, { s1: 10 }).discount).toBe(50);
  });
});

describe("resolveEffectiveCampaign — output shape", () => {
  it("never carries the admin configuration", () => {
    const c = baseCampaign({ markets: [{ id: "m", name: "M", color: "sky", countries: ["SI"], config: {} }] });
    const e = resolveEffectiveCampaign(c, ctx("SI")) as unknown as Record<string, unknown>;
    expect(e.markets).toBeUndefined();
    expect(e.customerRules).toBeUndefined();
    expect(e.priceBooks).toBeUndefined();
  });
});

describe("resolveEffectiveCampaign — pricing context (kind, basis, VAT)", () => {
  const vat = { rates: { SI: 22, AT: 20 }, fallbackRate: null, taxCodes: [] };
  const person = (iso: string | null) => ({ partnerMkId: "p9", countryIso: iso, countrySource: iso ? ("mk" as const) : null, kind: "person" as const });
  const company = (iso: string | null) => ({ ...person(iso), kind: "business" as const });

  it("company → partner basis, zero-rated, whatever the country", () => {
    const e = resolveEffectiveCampaign(baseCampaign(), company("DE"), vat);
    expect(e.pricing).toEqual({ kind: "business", basis: "partner", countryIso: "DE", vat: { rate: 0, source: "zero-rated" } });
    expect(e.effective.pricing.ctx).toEqual(e.pricing);
    expect(rowUnitPrice(flattenRows(e)[0].row, e.pricing!.basis)).toBe(100);
    expect(e.effective.warnings).toEqual([]);
  });

  it("individual → the same partner basis, with the country's global rate added on top", () => {
    const e = resolveEffectiveCampaign(baseCampaign(), person("SI"), vat);
    expect(e.pricing).toEqual({ kind: "person", basis: "partner", countryIso: "SI", vat: { rate: 22, source: "global" } });
    expect(rowUnitPrice(flattenRows(e)[0].row, e.pricing!.basis)).toBe(100); // the partner price, never the 200 RRP
    expect(computeTotals(e, { s1: 1 })).toEqual({ qty: 1, amount: 100, discount: 0, net: 100 });
    expect(computePricedOrder(e, { s1: 1 }).vat).toEqual({ rate: 22, net: 100, vat: 22, gross: 122 });
  });

  it("campaign override beats the global rate; fallback covers the rest", () => {
    const c = baseCampaign({ vatOverrides: [{ iso: "AT", rate: 13 }] });
    expect(resolveEffectiveCampaign(c, person("AT"), vat).pricing?.vat).toEqual({ rate: 13, source: "campaign" });
    expect(resolveEffectiveCampaign(c, person("SI"), vat).pricing?.vat).toEqual({ rate: 22, source: "global" });
    expect(resolveEffectiveCampaign(c, person("DE"), { ...vat, fallbackRate: 20 }).pricing?.vat).toEqual({ rate: 20, source: "fallback" });
  });

  it("missing rate is reported as a warning, never guessed", () => {
    const e = resolveEffectiveCampaign(baseCampaign(), person("DE"), vat);
    expect(e.pricing?.vat).toEqual({ rate: null, source: "missing" });
    expect(e.effective.warnings).toContain("vat-missing:DE");
    expect(resolveEffectiveCampaign(baseCampaign(), person(null), vat).effective.warnings).toContain("vat-missing:no-country");
    // No VAT table at all (the resolver's default) → the same.
    expect(resolveEffectiveCampaign(baseCampaign(), person("SI")).pricing?.vat.source).toBe("missing");
  });

  it("market / customer VAT policy: exempt, fixed rate, charge companies — rule beats market", () => {
    const c = baseCampaign({
      markets: [{ id: "exp", name: "Export", color: "sky", countries: ["JP"], config: { vatMode: "exempt" } }, { id: "eu", name: "EU", color: "teal", countries: ["SI", "AT"], config: { vatMode: "fixed", vatRate: 20, vatCompanies: true } }],
      customerRules: [{ partnerMkId: "vip", partnerName: "VIP", config: { vatMode: "country" } }],
    });
    const jp = resolveEffectiveCampaign(c, person("JP"), vat);
    expect(jp.pricing?.vat).toEqual({ rate: 0, source: "exempt" });
    expect(jp.effective.sources.vat).toBe("market");
    expect(jp.effective.pricing.vatPolicy).toMatchObject({ mode: "exempt", chargeCompanies: false });
    const at = resolveEffectiveCampaign(c, person("AT"), vat);
    expect(at.pricing?.vat).toEqual({ rate: 20, source: "market" });
    const atCompany = resolveEffectiveCampaign(c, company("AT"), vat);
    expect(atCompany.pricing).toMatchObject({ basis: "partner", vat: { rate: 20, source: "market" } });
    expect(computePricedOrder(atCompany, { s1: 1 }).vat).toEqual({ rate: 20, net: 100, vat: 20, gross: 120 });
    // The VIP rule switches back to country rates but inherits vatCompanies from the market.
    const vip = resolveEffectiveCampaign(c, { ...company("SI"), partnerMkId: "vip" }, vat);
    expect(vip.pricing?.vat).toEqual({ rate: 22, source: "global" });
    expect(vip.effective.sources.vat).toBe("customer");
    // Default policy: nothing set anywhere.
    expect(resolveEffectiveCampaign(baseCampaign(), person("SI"), vat).effective.pricing.vatPolicy).toEqual({ mode: "country", fixedRate: null, chargeCompanies: false, source: "campaign" });
  });

  it("unknown kind defaults to company with a warning; a missing RRP changes nothing for an individual", () => {
    const e = resolveEffectiveCampaign(baseCampaign(), ctx("SI"), vat);
    expect(e.pricing?.kind).toBe("business");
    expect(e.effective.warnings).toContain("kind-unknown");
    const noRrp = baseCampaign();
    noRrp.tabs[1].groups[0].rows[0].rrp = null;
    const p = resolveEffectiveCampaign(noRrp, person("SI"), vat);
    expect(p.effective.warnings).toEqual([]);
    expect(flattenRows(p).find((r) => r.row.id === "m1")?.row.unpriced).toBeUndefined();
    expect(computeTotals(p, { m1: 3 })).toEqual({ qty: 3, amount: 150, discount: 0, net: 150 });
  });

  it("a row with no price at all is listed but not orderable, for everyone", () => {
    const c = baseCampaign();
    Object.assign(c.tabs[1].groups[0].rows[0], { rrp: null, partnerPrice: null, discountedPrice: null });
    for (const who of [person("SI"), company("SI")]) {
      const p = resolveEffectiveCampaign(c, who, vat);
      expect(p.effective.warnings).toContain("unpriced:SKU-m1");
      expect(flattenRows(p).find((r) => r.row.id === "m1")?.row.unpriced).toBe(true);
      expect(computeTotals(p, { m1: 3 })).toEqual({ qty: 0, amount: 0, discount: 0, net: 0 });
    }
  });
});
