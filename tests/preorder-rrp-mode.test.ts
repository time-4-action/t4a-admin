import { describe, expect, it } from "vitest";
import { resolveEffectiveCampaign, resolveProvenanceOnly } from "@/lib/preorder-effective";
import { buildCommercialSnapshot } from "@/lib/preorder-snapshot";
import { sanitizeCommercialConfig } from "@/lib/preorder";
import { rrpNetUnit } from "@/lib/pricing";
import { campaignFromSnapshot, computePricedOrder, flattenRows } from "@/types/preorder";
import { baseCampaign, row, vatConfig } from "./helpers/fixtures";

// Fixture rows: s1 partner 100 / RRP 200, s2 partner 200 (manual 150) / RRP 400,
// m1 partner 50 / RRP 100. Restricted s3 is hidden by default.
const ctx = (iso: string | null, partnerMkId = "p1", kind: "business" | "person" = "person") => ({
  partnerMkId,
  countryIso: iso,
  countrySource: iso ? ("mk" as const) : null,
  kind,
});

const team = baseCampaign({
  markets: [
    {
      id: "team",
      name: "Team Germany",
      color: "amber",
      countries: ["DE", "FR"],
      // The price list must be ignored in RRP mode (no book, no warning).
      config: { priceMode: "rrp", rrpDiscountPct: 15, partnerPricelist: "RRP 2027 - Team germany" },
    },
  ],
  customerRules: [
    { partnerMkId: "vip", partnerName: "VIP", config: { rrpDiscountPct: 20 } },
    { partnerMkId: "dealer", partnerName: "Dealer", config: { priceMode: "partner" } },
  ],
});

function prices(e: ReturnType<typeof resolveEffectiveCampaign>) {
  return Object.fromEntries(flattenRows(e).map(({ row: r }) => [r.id, r.partnerPrice]));
}

describe("rrpNetUnit", () => {
  it("takes the discount off the gross RRP, then the VAT out", () => {
    expect(rrpNetUnit(200, 15, 19)).toBe(142.86); // 170.00 gross / 1.19
    expect(rrpNetUnit(200, 0, 0)).toBe(200);
    expect(rrpNetUnit(null, 15, 19)).toBeNull();
    expect(rrpNetUnit(0, 15, 19)).toBeNull();
  });
});

describe("price mode RRP − %", () => {
  it("prices every row from the RRP and never exposes the partner price", () => {
    const e = resolveEffectiveCampaign(team, ctx("DE"), vatConfig);
    expect(prices(e)).toEqual({ s1: 142.86, s2: 285.71, m1: 71.43 });
    for (const { row: r } of flattenRows(e)) {
      expect(r.discountedPrice).toBeNull();
      expect(r.priceSource).toBe("rrp");
    }
    expect(e.effective.pricing).toMatchObject({ mode: "rrp", rrpDiscountPct: 15, fromRrp: 3, fromBook: 0, pricelist: null });
    expect(e.pricing?.rrpDiscountPct).toBe(15);
    expect(e.effective.sources.priceMode).toBe("market");
    expect(e.effective.warnings.filter((w) => w.startsWith("price-book-missing"))).toEqual([]);
  });

  it("an individual pays the discounted RRP incl. VAT; a company pays it net", () => {
    const person = resolveEffectiveCampaign(team, ctx("DE"), vatConfig);
    const p = computePricedOrder(person, { s1: 1 });
    expect(p.vat).toEqual({ rate: 19, net: 142.86, vat: 27.14, gross: 170 });

    const company = resolveEffectiveCampaign(team, ctx("DE", "p1", "business"), vatConfig);
    const c = computePricedOrder(company, { s1: 1 });
    expect(c.vat).toEqual({ rate: 0, net: 142.86, vat: 0, gross: 142.86 });
  });

  it("volume tiers still apply on top of the RRP price", () => {
    const e = resolveEffectiveCampaign(team, ctx("DE", "p1", "business"), vatConfig);
    const p = computePricedOrder(e, { s1: 10 }); // 1428.60 ≥ Silver (1000) → 5%
    expect(p.tabs.find((t) => t.tabId === "tab-sails")?.discountPct).toBe(5);
  });

  it("a customer rule overrides the discount, or switches back to partner prices", () => {
    const vip = resolveEffectiveCampaign(team, ctx("DE", "vip"), vatConfig);
    expect(vip.effective.pricing.rrpDiscountPct).toBe(20);
    expect(vip.effective.sources.priceMode).toBe("customer");
    expect(prices(vip).s1).toBe(134.45); // 160.00 / 1.19

    const dealer = resolveEffectiveCampaign(team, ctx("DE", "dealer"), vatConfig);
    expect(dealer.effective.pricing.mode).toBe("partner");
    expect(dealer.pricing?.rrpDiscountPct).toBeUndefined();
    expect(prices(dealer)).toEqual({ s1: 100, s2: 200, m1: 50 });
  });

  it("customers outside the layer keep partner prices", () => {
    const e = resolveEffectiveCampaign(team, ctx("SI"), vatConfig);
    expect(e.effective.pricing.mode).toBe("partner");
    expect(prices(e)).toEqual({ s1: 100, s2: 200, m1: 50 });
  });

  it("a row without an RRP cannot be ordered (no fallback to the partner price)", () => {
    const c = baseCampaign({
      markets: [{ id: "team", name: "Team", color: "amber", countries: ["DE"], config: { priceMode: "rrp", rrpDiscountPct: 10 } }],
    });
    c.tabs[1].groups[0].rows = [row("m1", 50, { rrp: null })];
    const e = resolveEffectiveCampaign(c, ctx("DE"), vatConfig);
    const m1 = flattenRows(e).find((r) => r.row.id === "m1")!.row;
    expect(m1.unpriced).toBe(true);
    expect(m1.partnerPrice).toBeNull();
    expect(e.effective.warnings).toContain("rrp-missing:SKU-m1");
  });

  it("no VAT rate for the country ⇒ nothing orderable, even for a company", () => {
    const e = resolveEffectiveCampaign(team, ctx("FR", "p1", "business"), vatConfig);
    expect(e.effective.warnings).toContain("rrp-vat-missing:FR");
    expect(flattenRows(e).every((r) => r.row.unpriced && r.row.partnerPrice == null)).toBe(true);
  });

  it("an exempt VAT layer still takes the VAT out of the RRP", () => {
    const c = baseCampaign({
      markets: [{ id: "team", name: "Team", color: "amber", countries: ["DE"], config: { priceMode: "rrp", rrpDiscountPct: 15, vatMode: "exempt" } }],
    });
    const e = resolveEffectiveCampaign(c, ctx("DE"), vatConfig);
    expect(prices(e).s1).toBe(142.86);
    expect(computePricedOrder(e, { s1: 1 }).vat).toEqual({ rate: 0, net: 142.86, vat: 0, gross: 142.86 });
  });

  it("the snapshot freezes the discount and restores it", () => {
    const e = resolveEffectiveCampaign(team, ctx("DE"), vatConfig);
    const snap = buildCommercialSnapshot(e, { s1: 2 }, new Date("2026-11-16T10:00:00Z"), vatConfig);
    expect(snap.pricing?.rrpDiscountPct).toBe(15);
    expect(snap.sources.priceMode).toBe("market");
    expect(snap.lines[0]).toMatchObject({ unitPrice: 142.86, partnerPrice: 142.86, rrp: 200, priceSource: "rrp", lineGross: 340 });
    const frozen = campaignFromSnapshot({ id: "c1", title: "t", season: null, status: "open" }, snap);
    expect(frozen.pricing?.rrpDiscountPct).toBe(15);
  });

  it("provenance marks an RRP override as a pricing override", () => {
    const p = resolveProvenanceOnly(team, ctx("DE", "vip"));
    expect(p.overrides.pricing).toBe(true);
    expect(p.sources.priceMode).toBe("customer");
  });
});

describe("sanitizeCommercialConfig — price mode", () => {
  it("keeps inherit vs override and validates the values", () => {
    expect(sanitizeCommercialConfig({})).toEqual({});
    expect(sanitizeCommercialConfig({ priceMode: "rrp", rrpDiscountPct: "12.5" })).toEqual({ priceMode: "rrp", rrpDiscountPct: 12.5 });
    expect(sanitizeCommercialConfig({ priceMode: "bogus", rrpDiscountPct: 140 })).toEqual({ priceMode: null, rrpDiscountPct: null });
  });
});
