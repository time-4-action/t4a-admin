import { describe, expect, it } from "vitest";
import { resolveEffectiveCampaign } from "@/lib/preorder-effective";
import { allocationFromDocument, buildCommercialSnapshot, orderHash, snapshotTotals, snapshotVatTotals } from "@/lib/preorder-snapshot";
import { campaignFromSnapshot, computePricedOrder, computeTotals, flattenRows, rowUnitPrice, snapshotQuantities } from "@/types/preorder";
import type { DocDetail } from "@/types/documents";
import { baseCampaign } from "./helpers/fixtures";

const ctx = { partnerMkId: "p1", countryIso: "AT", countrySource: "mk" as const };

function order(lines: { code: string; amount: string; priceWithTax?: string; shipped?: string }[], sumAll = "0"): DocDetail {
  return {
    kind: "order",
    docType: "sales_order",
    mkId: "mk1",
    countCode: "PP-1",
    docDate: "2026-09-14",
    currency: "EUR",
    sumAll,
    statusDesc: "created",
    lines: lines.map((l) => ({ code: l.code, name: l.code, amount: l.amount, priceWithTax: l.priceWithTax, shipped: l.shipped })),
    links: [],
  };
}

describe("commercial snapshot", () => {
  const campaign = baseCampaign({
    markets: [{ id: "dach", name: "DACH", color: "sky", countries: ["AT"], config: { partnerPricelist: "DACH", currency: "EUR" } }],
    priceBooks: [{ pricelist: "DACH", currency: "EUR", entries: [{ code: "SKU-s1", net: 90, taxCode: "EX1" }], missing: 0 }],
  });
  const effective = resolveEffectiveCampaign(campaign, ctx);
  const qty = { s1: 20, m1: 3, s2: 0 };
  const snap = buildCommercialSnapshot(effective, qty, new Date("2026-09-01T10:00:00Z"));

  it("keeps only ordered lines with their effective price + provenance", () => {
    expect(snap.lines.map((l) => [l.code, l.qty, l.unitPrice, l.priceSource])).toEqual([
      ["SKU-s1", 20, 90, "book"],
      ["SKU-m1", 3, 50, "fallback"],
    ]);
    expect(snap.lines[0].taxCode).toBe("EX1");
    expect(snap.tabs.map((t) => t.tabId)).toEqual(["tab-sails", "tab-masts"]);
    expect(snap.market).toEqual({ id: "dach", name: "DACH" });
    expect(snap.partnerPricelist).toBe("DACH");
    expect(snap.sources.pricelist).toBe("market");
    expect(snap.resolvedAt).toBe("2026-09-01T10:00:00.000Z");
  });

  it("snapshot totals equal the totals computed at submit", () => {
    const stored = computeTotals(effective, qty);
    expect(snapshotTotals(snap)).toEqual(stored);
    expect(stored.amount).toBe(1950);
    expect(stored.discount).toBe(90); // Silver 5% on the 1800 sails subtotal
  });

  it("later configuration changes do not touch the frozen submission", () => {
    // Admin repoints Austria at another list and hides s1 after the customer submitted.
    const mutated = baseCampaign({
      markets: [{ id: "dach", name: "DACH", color: "sky", countries: ["AT"], config: { partnerPricelist: "NEW", hiddenIds: ["s1"] } }],
      priceBooks: [{ pricelist: "NEW", currency: "EUR", entries: [{ code: "SKU-s1", net: 999 }], missing: 0 }],
    });
    const live = resolveEffectiveCampaign(mutated, ctx);
    expect(flattenRows(live).some((r) => r.row.id === "s1")).toBe(false);
    const frozen = campaignFromSnapshot(mutated, snap);
    const rows = flattenRows(frozen).map((r) => r.row);
    expect(rows.map((r) => r.id)).toEqual(["s1", "m1"]);
    expect(rowUnitPrice(rows[0])).toBe(90);
    expect(computeTotals(frozen, snapshotQuantities(snap))).toEqual(snapshotTotals(snap));
    expect(frozen.tabs[0].tiers?.map((t) => t.name)).toEqual(["Silver", "Gold"]);
  });
});

describe("allocation (live MK order vs request)", () => {
  const snap = buildCommercialSnapshot(resolveEffectiveCampaign(baseCampaign(), ctx), { s1: 100, m1: 20 });

  it("joins by code with full / partial / removed / added / increased statuses", () => {
    const a = allocationFromDocument(
      snap,
      order([{ code: "SKU-s1", amount: "90", priceWithTax: "100", shipped: "10" }, { code: "SKU-x", amount: "5", priceWithTax: "1" }], "9005"),
    );
    expect(a.requestedQty).toBe(120);
    expect(a.allocatedQty).toBe(95);
    expect(a.lines.map((l) => [l.code, l.requestedQty, l.allocatedQty, l.status])).toEqual([
      ["SKU-s1", 100, 90, "partial"],
      ["SKU-m1", 20, 0, "removed"],
      ["SKU-x", 0, 5, "added"],
    ]);
    expect(a.lines[0].lineTotal).toBe(9000);
    expect(a.lines[0].shipped).toBe("10");
    expect(a.sumAll).toBe("9005");
  });

  it("sums repeated codes, flags increases", () => {
    const a = allocationFromDocument(snap, order([{ code: "SKU-s1", amount: "60" }, { code: "SKU-s1", amount: "60" }, { code: "SKU-m1", amount: "20" }]));
    expect(a.lines[0]).toMatchObject({ allocatedQty: 120, status: "increased" });
    expect(a.lines[1]).toMatchObject({ allocatedQty: 20, status: "full" });
  });

  it("changedSincePublish compares the order hash", () => {
    const o1 = order([{ code: "SKU-s1", amount: "100", priceWithTax: "100" }], "10000");
    const h = orderHash(o1);
    expect(allocationFromDocument(snap, o1, { publishedHash: h }).changedSincePublish).toBe(false);
    const o2 = order([{ code: "SKU-s1", amount: "90", priceWithTax: "100" }], "9000");
    expect(allocationFromDocument(snap, o2, { publishedHash: h }).changedSincePublish).toBe(true);
    expect(allocationFromDocument(snap, o2, { publishedHash: null }).changedSincePublish).toBe(false);
  });
});

describe("commercial snapshot — frozen VAT arithmetic", () => {
  const vat = { rates: { SI: 22 }, fallbackRate: null, taxCodes: [] };
  const person = { partnerMkId: "p2", countryIso: "SI", countrySource: "mk" as const, kind: "person" as const };
  const qty = { s1: 100, m1: 20 }; // 100 × 100 + 20 × 50 = 11 000 net on the order ⇒ Gold 10 % on Sails

  it("individual: partner prices, tier off the net, VAT added on top; pricing block sums the lines", () => {
    const snap = buildCommercialSnapshot(resolveEffectiveCampaign(baseCampaign(), person, vat), qty);
    expect(snap.pricing).toMatchObject({ kind: "person", basis: "partner", countryIso: "SI", vatRate: 22, vatSource: "global" });
    const s1 = snap.lines.find((l) => l.code === "SKU-s1")!;
    expect(s1).toMatchObject({ unitPrice: 100, rrp: 200, partnerPrice: 100, tierPct: 10, unitNet: 90, unitVat: 19.8, unitGross: 109.8, lineNet: 9000, lineGross: 10980 });
    expect(snap.pricing?.totals).toEqual(snapshotVatTotals(snap));
    expect(snap.pricing?.totals).toEqual({ net: 10000, vat: 2200, gross: 12200 });
    // The legacy totals stay net (what the tiers were measured on); the VAT rides in the pricing block.
    expect(snapshotTotals(snap).net).toBe(snap.pricing?.totals.net);
  });

  it("freezes the fixed-price flag: no tier on that line, and the frozen view re-prices identically", () => {
    const c = baseCampaign();
    c.tabs[1].groups[0].rows[0].fixedPrice = true; // m1
    c.tabs[1].tiers = [{ id: "mt", name: "Mast deal", minAmount: 100, discountPct: 20 }];
    const snap = buildCommercialSnapshot(resolveEffectiveCampaign(c, person, vat), qty);
    const m1 = snap.lines.find((l) => l.code === "SKU-m1")!;
    expect(m1).toMatchObject({ fixedPrice: true, tierPct: 0, unitNet: 50, lineNet: 1000 });
    expect(snap.lines.find((l) => l.code === "SKU-s1")!.fixedPrice).toBeUndefined();
    // The flag later removed from the sheet does not change the frozen order.
    c.tabs[1].groups[0].rows[0].fixedPrice = false;
    const frozen = campaignFromSnapshot(baseCampaign(), snap);
    expect(computeTotals(frozen, snapshotQuantities(snap))).toEqual(snapshotTotals(snap));
    expect(computePricedOrder(frozen, snapshotQuantities(snap)).vat).toEqual({ rate: 22, ...snap.pricing!.totals });
  });

  it("company: net lines, zero VAT, gross = net", () => {
    const company = { ...person, partnerMkId: "p1", kind: "business" as const };
    const snap = buildCommercialSnapshot(resolveEffectiveCampaign(baseCampaign(), company, vat), qty);
    expect(snap.pricing).toMatchObject({ kind: "business", basis: "partner", vatRate: 0, vatSource: "zero-rated" });
    expect(snap.lines[0]).toMatchObject({ unitPrice: 100, unitNet: 90, unitVat: 0, unitGross: 90 });
    expect(snap.pricing?.totals).toEqual({ net: 9000 + 1000, vat: 0, gross: 10000 });
  });

  it("later VAT / price changes never alter the frozen order", () => {
    const snap = buildCommercialSnapshot(resolveEffectiveCampaign(baseCampaign(), person, vat), qty);
    // The VAT table and the sheet change after submit.
    const mutated = baseCampaign({ vatOverrides: [{ iso: "SI", rate: 9.5 }] });
    mutated.tabs[0].groups[0].rows[0].partnerPrice = 999;
    const live = resolveEffectiveCampaign(mutated, person, { rates: { SI: 25 }, fallbackRate: null, taxCodes: [] });
    expect(live.pricing?.vat.rate).toBe(9.5);
    const frozen = campaignFromSnapshot(mutated, snap);
    expect(frozen.pricing).toEqual({ kind: "person", basis: "partner", countryIso: "SI", vat: { rate: 22, source: "global" } });
    expect(rowUnitPrice(flattenRows(frozen)[0].row, "partner")).toBe(100);
    expect(computeTotals(frozen, snapshotQuantities(snap))).toEqual(snapshotTotals(snap));
    expect(snapshotVatTotals(snap)?.vat).toBeCloseTo(1980 + 220, 5); // 100 × 19.80 + 20 × 11
  });

  it("a legacy snapshot frozen on the RRP basis keeps pricing exactly as submitted", () => {
    const legacy = buildCommercialSnapshot(resolveEffectiveCampaign(baseCampaign(), person, vat), qty);
    // Rewrite it the way the pre-change code froze an individual: gross RRP units, VAT inside.
    legacy.pricing = { ...legacy.pricing!, basis: "rrp", totals: { net: 15573.77, vat: 4426.23, gross: 20000 } };
    legacy.lines = legacy.lines.map((l) => ({ ...l, unitPrice: l.rrp!, unitNet: null, unitVat: null, unitGross: null, lineNet: null, lineVat: null, lineGross: null }));
    const frozen = campaignFromSnapshot(baseCampaign(), legacy);
    expect(frozen.pricing?.basis).toBe("rrp");
    expect(rowUnitPrice(flattenRows(frozen)[0].row, "rrp")).toBe(200);
    // 100 × 200 = 20 000 ⇒ Gold 10 % off the gross; VAT extracted, never added.
    const priced = computePricedOrder(frozen, snapshotQuantities(legacy));
    expect(priced.totals).toEqual({ qty: 120, amount: 22000, discount: 2000, net: 20000 });
    expect(priced.vat?.gross).toBe(20000);
    expect(priced.tabs[0].lines.s1).toMatchObject({ unit: 200, unitFinal: 180, unitNet: 147.54, unitVat: 32.46, unitGross: 180 });
  });

  it("a missing VAT rate leaves no pricing block (submit refuses such an order)", () => {
    const snap = buildCommercialSnapshot(resolveEffectiveCampaign(baseCampaign(), { ...person, countryIso: "DE" }, vat), qty);
    expect(snap.pricing).toBeNull();
    expect(snapshotVatTotals(snap)).toBeNull();
  });
});
