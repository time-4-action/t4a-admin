import { describe, expect, it } from "vitest";
import { resolveEffectiveCampaign } from "@/lib/preorder-effective";
import { allocationFromDocument, buildCommercialSnapshot, orderHash, snapshotTotals } from "@/lib/preorder-snapshot";
import { campaignFromSnapshot, computeTotals, flattenRows, rowUnitPrice, snapshotQuantities } from "@/types/preorder";
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
    priceBooks: [{ pricelist: "DACH", currency: "EUR", entries: [{ code: "SKU-s1", gross: 90, taxCode: "EX1" }], missing: 0 }],
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
      priceBooks: [{ pricelist: "NEW", currency: "EUR", entries: [{ code: "SKU-s1", gross: 999 }], missing: 0 }],
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
