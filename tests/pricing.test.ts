import { describe, expect, it } from "vitest";
import {
  addVat,
  basisFor,
  fromCents,
  normalizeVatOverrides,
  normalizeVatRate,
  normalizeVatRateMap,
  pctOfCents,
  priceLine,
  priceOrder,
  resolveVatRate,
  splitGross,
  toCents,
  unitPriceFor,
  vatLabel,
  type PricingContext,
} from "@/lib/pricing";
import { baseCampaign } from "./helpers/fixtures";

const global = { rates: { SI: 22, AT: 20 }, fallbackRate: null, taxCodes: [] };

describe("integer cents", () => {
  it("rounds decimals to cents once and never drifts", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(19.99)).toBe(1999);
    expect(fromCents(1999)).toBe(19.99);
    expect(toCents(null)).toBe(0);
  });

  it("pctOfCents rounds to the nearest cent", () => {
    expect(pctOfCents(3333, 5)).toBe(167);
    expect(pctOfCents(10000, 10)).toBe(1000);
    expect(pctOfCents(10000, 0)).toBe(0);
  });

  it("splitGross extracts VAT from a gross amount: €100 in SI = 81.97 + 18.03", () => {
    expect(splitGross(10000, 22)).toEqual({ net: 8197, vat: 1803, gross: 10000 });
    expect(splitGross(100, 22)).toEqual({ net: 82, vat: 18, gross: 100 });
    expect(splitGross(10000, 0)).toEqual({ net: 10000, vat: 0, gross: 10000 });
    expect(splitGross(10000, 9.5)).toEqual({ net: 9132, vat: 868, gross: 10000 });
    const s = splitGross(12345, 19);
    expect(s.net + s.vat).toBe(s.gross);
  });

  it("addVat puts VAT on top of a net amount", () => {
    expect(addVat(8197, 22)).toEqual({ net: 8197, vat: 1803, gross: 10000 });
    expect(addVat(5000, 0)).toEqual({ net: 5000, vat: 0, gross: 5000 });
  });
});

describe("VAT rate resolution", () => {
  it("companies are always zero-rated, even with a campaign override for their country", () => {
    expect(resolveVatRate({ kind: "business", countryIso: "SI", campaignOverrides: [{ iso: "SI", rate: 22 }], global })).toEqual({ rate: 0, source: "zero-rated" });
  });

  it("everyone is resolved onto the partner price basis — the RRP is reference only", () => {
    expect(basisFor("business")).toBe("partner");
    expect(basisFor("person")).toBe("partner");
  });

  it("individuals: campaign override > global > fallback > missing", () => {
    expect(resolveVatRate({ kind: "person", countryIso: "SI", campaignOverrides: [{ iso: "si", rate: 9.5 }], global })).toEqual({ rate: 9.5, source: "campaign" });
    expect(resolveVatRate({ kind: "person", countryIso: "SI", global })).toEqual({ rate: 22, source: "global" });
    expect(resolveVatRate({ kind: "person", countryIso: "DE", global })).toEqual({ rate: null, source: "missing" });
    expect(resolveVatRate({ kind: "person", countryIso: "DE", global: { ...global, fallbackRate: 20 } })).toEqual({ rate: 20, source: "fallback" });
    // An override for another country changes nothing.
    expect(resolveVatRate({ kind: "person", countryIso: "AT", campaignOverrides: [{ iso: "SI", rate: 5 }], global })).toEqual({ rate: 20, source: "global" });
  });

  it("layer policy: exempt switches VAT off, fixed pins one rate, chargeCompanies taxes companies", () => {
    const exempt = { mode: "exempt" as const, fixedRate: null, chargeCompanies: false, source: "market" as const };
    expect(resolveVatRate({ kind: "person", countryIso: "SI", global, policy: exempt })).toEqual({ rate: 0, source: "exempt" });
    const fixed = { mode: "fixed" as const, fixedRate: 20, chargeCompanies: false, source: "customer" as const };
    expect(resolveVatRate({ kind: "person", countryIso: "SI", global, policy: fixed })).toEqual({ rate: 20, source: "customer" });
    expect(resolveVatRate({ kind: "person", countryIso: "SI", global, policy: { ...fixed, source: "market" } })).toEqual({ rate: 20, source: "market" });
    expect(resolveVatRate({ kind: "person", countryIso: "SI", global, policy: { ...fixed, fixedRate: null } })).toEqual({ rate: null, source: "missing" });
    // Companies stay zero-rated under any mode unless the layer charges them.
    expect(resolveVatRate({ kind: "business", countryIso: "SI", global, policy: fixed })).toEqual({ rate: 0, source: "zero-rated" });
    const charged = { mode: "country" as const, fixedRate: null, chargeCompanies: true, source: "market" as const };
    expect(resolveVatRate({ kind: "business", countryIso: "SI", global, policy: charged })).toEqual({ rate: 22, source: "global" });
    expect(resolveVatRate({ kind: "business", countryIso: "SI", global, policy: { ...charged, mode: "exempt" } })).toEqual({ rate: 0, source: "exempt" });
  });

  it("no country: only the fallback can answer — never a guess", () => {
    expect(resolveVatRate({ kind: "person", countryIso: null, global })).toEqual({ rate: null, source: "missing" });
    expect(resolveVatRate({ kind: "person", countryIso: null, global: { ...global, fallbackRate: 22 } })).toEqual({ rate: 22, source: "fallback" });
  });

  it("normalizers accept 0–100 with two decimals and drop everything else", () => {
    expect(normalizeVatRate("22")).toBe(22);
    expect(normalizeVatRate(" 9.5 ")).toBe(9.5);
    expect(normalizeVatRate(19.999)).toBe(20);
    expect(normalizeVatRate("")).toBeNull();
    expect(normalizeVatRate(-1)).toBeNull();
    expect(normalizeVatRate(101)).toBeNull();
    expect(normalizeVatRate("abc")).toBeNull();
    expect(normalizeVatRateMap({ si: "22", XX: 150, AT: 20, "": 5, SVN: 1 })).toEqual({ SI: 22, AT: 20 });
    expect(normalizeVatRateMap([{ iso: "de", rate: 19 }, { iso: "DE", rate: "x" }])).toEqual({ DE: 19 });
    expect(normalizeVatOverrides({ SI: 22, AT: 20 })).toEqual([
      { iso: "AT", rate: 20 },
      { iso: "SI", rate: 22 },
    ]);
  });
});

describe("line pricing", () => {
  it("individual: partner basis, tier off the net, VAT ADDED per unit on the discounted price", () => {
    const lp = priceLine({ basis: "partner", unit: 100, qty: 3, tierPct: 10, vatRate: 22 });
    expect(lp).toMatchObject({ unit: 100, tierPct: 10, unitFinal: 90, unitNet: 90, unitVat: 19.8, unitGross: 109.8 });
    expect(lp.lineNet).toBe(270);
    expect(lp.lineVat).toBe(59.4);
    expect(lp.lineGross).toBe(329.4);
  });

  it("legacy RRP-basis snapshot: tier off the gross, VAT extracted per unit", () => {
    const lp = priceLine({ basis: "rrp", unit: 100, qty: 3, tierPct: 10, vatRate: 22 });
    expect(lp).toMatchObject({ unit: 100, tierPct: 10, unitFinal: 90, unitNet: 73.77, unitVat: 16.23, unitGross: 90 });
    expect(lp.lineGross).toBe(270);
    expect(lp.lineNet).toBe(221.31);
    expect(lp.lineVat).toBe(48.69);
    expect(lp.lineNet + lp.lineVat).toBeCloseTo(lp.lineGross, 10);
  });

  it("company: partner basis, net price, zero VAT", () => {
    const lp = priceLine({ basis: "partner", unit: 100, qty: 3, tierPct: 10, vatRate: 0 });
    expect(lp).toMatchObject({ unitFinal: 90, unitNet: 90, unitVat: 0, unitGross: 90, lineNet: 270, lineVat: 0, lineGross: 270 });
  });

  it("company charged VAT: VAT is ADDED on top of the net partner price", () => {
    const lp = priceLine({ basis: "partner", unit: 100, qty: 2, tierPct: 0, vatRate: 22 });
    expect(lp).toMatchObject({ unitNet: 100, unitVat: 22, unitGross: 122, lineNet: 200, lineVat: 44, lineGross: 244 });
  });

  it("unitPriceFor: discounted → partner → RRP fallback; the legacy RRP basis never falls back", () => {
    expect(unitPriceFor({ discountedPrice: 80, partnerPrice: 100, rrp: 200 }, "partner")).toBe(80);
    expect(unitPriceFor({ discountedPrice: null, partnerPrice: null, rrp: 200 }, "partner")).toBe(200);
    expect(unitPriceFor({ discountedPrice: 80, partnerPrice: 100, rrp: 200 }, "rrp")).toBe(200);
    expect(unitPriceFor({ discountedPrice: 80, partnerPrice: 100, rrp: null }, "rrp")).toBe(0);
  });
});

describe("priceOrder", () => {
  const qty = { s1: 10, s2: 2, m1: 1 };
  const company: PricingContext = { kind: "business", basis: "partner", countryIso: "SI", vat: { rate: 0, source: "zero-rated" } };
  const person: PricingContext = { kind: "person", basis: "partner", countryIso: "SI", vat: { rate: 22, source: "global" } };
  const legacyPerson: PricingContext = { kind: "person", basis: "rrp", countryIso: "SI", vat: { rate: 22, source: "global" } };

  it("company: partner basis, tier on the net subtotal, no VAT", () => {
    const o = priceOrder({ ...baseCampaign(), pricing: company }, (r) => qty[r.id as keyof typeof qty] ?? 0);
    // Sails: 10×100 + 2×150 (discounted) = 1300 ≥ Silver 1000 ⇒ 5 %.
    expect(o.tabs[0]).toMatchObject({ amount: 1300, discountPct: 5, discount: 65, net: 1235 });
    expect(o.tabs[1]).toMatchObject({ amount: 50, discountPct: 0, net: 50 });
    expect(o.totals).toEqual({ qty: 13, amount: 1350, discount: 65, net: 1285 });
    expect(o.vat).toEqual({ rate: 0, net: 1285, vat: 0, gross: 1285 });
  });

  it("individual: the SAME partner prices and tier as a company, VAT added on top of the discounted net", () => {
    const o = priceOrder({ ...baseCampaign(), pricing: person }, (r) => qty[r.id as keyof typeof qty] ?? 0);
    // Identical basis figures to the company case — the manual discountedPrice counts too.
    expect(o.tabs[0]).toMatchObject({ amount: 1300, discountPct: 5, discount: 65, net: 1235 });
    expect(o.totals).toEqual({ qty: 13, amount: 1350, discount: 65, net: 1285 });
    // 22 % on the net-after-tier of every line: 1285 net + 282.70 VAT.
    expect(o.vat).toEqual({ rate: 22, net: 1285, vat: 282.7, gross: 1567.7 });
    expect(o.tabs[0].lines.s1).toMatchObject({ unit: 100, unitFinal: 95, unitNet: 95, unitVat: 20.9, unitGross: 115.9, lineGross: 1159 });
    expect(o.tabs[0].lines.s2).toMatchObject({ unit: 150, unitFinal: 142.5, unitVat: 31.35 }); // discounted price, not the 200 partner price
  });

  it("legacy RRP-basis snapshot: rrp = 2× partner in the fixtures, tier on the gross subtotal, VAT inside", () => {
    const o = priceOrder({ ...baseCampaign(), pricing: legacyPerson }, (r) => qty[r.id as keyof typeof qty] ?? 0);
    // Sails: 10×200 + 2×400 = 2800 ≥ Silver ⇒ 5 %; the manual discountedPrice is a partner concept and is ignored.
    expect(o.tabs[0]).toMatchObject({ amount: 2800, discountPct: 5, discount: 140, net: 2660 });
    expect(o.totals).toEqual({ qty: 13, amount: 2900, discount: 140, net: 2760 });
    // net / VAT / gross are the Σ of the per-line splits; gross equals what the customer pays.
    expect(o.vat?.gross).toBe(2760);
    expect(o.vat!.net + o.vat!.vat).toBeCloseTo(2760, 10);
    const lines = o.tabs.flatMap((t) => Object.values(t.lines));
    expect(lines.reduce((a, l) => a + l.lineNet, 0)).toBeCloseTo(o.vat!.net, 10);
    expect(lines.reduce((a, l) => a + l.lineVat, 0)).toBeCloseTo(o.vat!.vat, 10);
    expect(o.tabs[0].lines.s1).toMatchObject({ unit: 200, unitFinal: 190, unitNet: 155.74, unitVat: 34.26, lineGross: 1900 });
  });

  it("tiers are unlocked by the WHOLE order, not the tab alone", () => {
    // Sails on its own: 5 × 100 = 500 < Silver (1000). Masts adds 12 × 50 = 600 ⇒ the
    // order is 1100 ≥ Silver, so Sails gets its 5 % even though the tab itself is short.
    const o = priceOrder({ ...baseCampaign(), pricing: company }, (r) => ({ s1: 5, m1: 12 })[r.id] ?? 0);
    expect(o.tabs[0]).toMatchObject({ amount: 500, orderAmount: 1100, discountPct: 5, discount: 25, net: 475 });
    // Masts has no ladder of its own — the order total unlocks nothing there.
    expect(o.tabs[1]).toMatchObject({ amount: 600, orderAmount: 1100, discountPct: 0, net: 600 });
    expect(o.totals).toEqual({ qty: 17, amount: 1100, discount: 25, net: 1075 });
    // Progress towards Gold is measured on the order too.
    expect(o.tabs[0].nextTier?.id).toBe("t2");
    expect(o.tabs[0].toNextTier).toBe(3900);
    // Without the masts the same sails reach nothing.
    const alone = priceOrder({ ...baseCampaign(), pricing: company }, (r) => ({ s1: 5 })[r.id] ?? 0);
    expect(alone.tabs[0]).toMatchObject({ amount: 500, orderAmount: 500, discountPct: 0, toNextTier: 500 });
  });

  it("a fixed-price row counts towards the threshold but is never discounted", () => {
    const c = baseCampaign();
    c.tabs[0].groups[0].rows[1].fixedPrice = true; // s2: 150 (discounted price), fixed
    const o = priceOrder({ ...c, pricing: person }, (r) => qty[r.id as keyof typeof qty] ?? 0);
    // Still 1300 on the tab (and 1350 on the order) ⇒ Silver 5 % — but only on the 1000 of s1.
    expect(o.tabs[0]).toMatchObject({ amount: 1300, discountPct: 5, discount: 50, net: 1250, fixedAmount: 300, fixedQty: 2 });
    expect(o.tabs[0].lines.s2).toMatchObject({ unit: 150, tierPct: 0, unitFinal: 150, unitVat: 33, lineGross: 366 });
    expect(o.tabs[0].lines.s1).toMatchObject({ tierPct: 5, unitFinal: 95 });
    expect(o.totals).toEqual({ qty: 13, amount: 1350, discount: 50, net: 1300 });
    expect(o.vat).toEqual({ rate: 22, net: 1300, vat: 286, gross: 1586 });
    // Only fixed-price items on the order still unlock the ladder for the rest.
    const onlyFixed = priceOrder({ ...c, pricing: company }, (r) => ({ s2: 7, s1: 1 })[r.id] ?? 0);
    expect(onlyFixed.tabs[0]).toMatchObject({ amount: 1150, discountPct: 5, discount: 5, fixedAmount: 1050 });
  });

  it("no pricing context (admin builder) prices on the partner basis without VAT totals", () => {
    const o = priceOrder(baseCampaign(), (r) => qty[r.id as keyof typeof qty] ?? 0);
    expect(o.ctx).toBeNull();
    expect(o.vat).toBeNull();
    expect(o.totals.net).toBe(1285);
  });

  it("a missing VAT rate yields no VAT totals and a telling label", () => {
    const missing: PricingContext = { kind: "person", basis: "rrp", countryIso: "DE", vat: { rate: null, source: "missing" } };
    const o = priceOrder({ ...baseCampaign(), pricing: missing }, (r) => qty[r.id as keyof typeof qty] ?? 0);
    expect(o.vat).toBeNull();
    expect(vatLabel(missing)).toBe("VAT rate not configured");
    expect(vatLabel(person)).toBe("excl. VAT · +22% VAT");
    expect(vatLabel(legacyPerson)).toBe("incl. 22% VAT");
    expect(vatLabel(company)).toBe("excl. VAT · 0% (company)");
  });
});
