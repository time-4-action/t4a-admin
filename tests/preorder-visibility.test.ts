import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { startMongo, stopMongo, clearMongo } from "./helpers/mongo";
import { PreorderSubmission } from "@/models/preorder-submission";
import { annotatePreorderOrders, customerMayViewDocument, filterCustomerVisible, preorderVisibility } from "@/lib/preorder-visibility";
import type { DocDetail, DocSummary } from "@/types/documents";

const partner = { mkId: "p1" };

function order(mkId: string, buyerOrder?: string): DocSummary {
  return { kind: "order", docType: "sales_order", mkId, countCode: `PP-${mkId}`, docDate: "2026-09-14", buyerOrder };
}
function invoice(mkId: string): DocSummary {
  return { kind: "invoice", docType: "sales_bill_domestic", mkId, countCode: `INV-${mkId}`, docDate: "2026-09-14" };
}

async function sub(over: Record<string, unknown>) {
  return PreorderSubmission.create({
    campaignId: new Types.ObjectId(),
    partnerMkId: "p1",
    partnerName: "P",
    status: "submitted",
    ...over,
  });
}

beforeAll(startMongo);
afterAll(stopMongo);
beforeEach(clearMongo);

describe("customer Documents visibility", () => {
  it("hides unpublished registered orders, shows published ones, leaves everything else alone", async () => {
    const a = await sub({ mkSalesOrder: { mkId: "o-hidden", countCode: "PP-1" }, mkOrder: { state: "created", buyerOrder: "T4A" + "a".repeat(24) + ".1", attempts: 1 } });
    await sub({ mkSalesOrder: { mkId: "o-pub", countCode: "PP-2" }, mkOrder: { state: "created", buyerOrder: "T4A" + "b".repeat(24) + ".1", attempts: 1 }, resultPublishedToCustomer: true });
    expect(a.partnerMkId).toBe("p1");
    const items = [order("o-hidden"), order("o-pub"), order("o-normal"), invoice("i-1")];
    const visible = await filterCustomerVisible(partner, items);
    expect(visible.map((d) => d.mkId)).toEqual(["o-pub", "o-normal", "i-1"]);
  });

  it("detached (history) orders stay hidden; the MK marker hides orphans without a record", async () => {
    await sub({
      mkSalesOrder: null,
      mkOrder: null,
      mkSalesOrderHistory: [{ mkId: "o-old", countCode: "PP-9", detachedAt: new Date(), deletedInMk: false }],
    });
    const orphanKey = "T4A" + "c".repeat(24) + ".1";
    const items = [order("o-old"), order("o-orphan", orphanKey), order("o-shop", "SHOP-1234")];
    const visible = await filterCustomerVisible(partner, items);
    expect(visible.map((d) => d.mkId)).toEqual(["o-shop"]);
  });

  it("legacy hand-pushed orders (no mkOrder) remain visible", async () => {
    await sub({ mkSalesOrder: { mkId: "o-legacy", countCode: "PP-L" } });
    const vis = await preorderVisibility("p1");
    expect(vis.mayView(order("o-legacy"))).toBe(true);
  });

  it("another partner's records never affect this partner", async () => {
    await PreorderSubmission.create({
      campaignId: new Types.ObjectId(),
      partnerMkId: "p2",
      partnerName: "Other",
      status: "submitted",
      mkSalesOrder: { mkId: "o-x", countCode: "PP-X" },
      mkOrder: { state: "created", buyerOrder: "k", attempts: 1 },
    });
    const vis = await preorderVisibility("p1");
    expect(vis.hidden.size).toBe(0);
  });

  it("detail: ownership first, then visibility", async () => {
    await sub({ mkSalesOrder: { mkId: "o-hidden", countCode: "PP-1" }, mkOrder: { state: "created", buyerOrder: "k", attempts: 1 } });
    const mine: DocDetail = { ...order("o-hidden"), partner: { mkId: "p1" }, lines: [], links: [] };
    const theirs: DocDetail = { ...order("o-other"), partner: { mkId: "p2" }, lines: [], links: [] };
    const ok: DocDetail = { ...order("o-normal"), partner: { mkId: "p1" }, lines: [], links: [] };
    expect(await customerMayViewDocument(partner, mine)).toBe(false);
    expect(await customerMayViewDocument(partner, theirs)).toBe(false);
    expect(await customerMayViewDocument(partner, ok)).toBe(true);
    expect(await customerMayViewDocument(partner, null)).toBe(false);
  });

  it("admin annotation marks preorder orders and orphans", async () => {
    const s = await sub({ mkSalesOrder: { mkId: "o-1", countCode: "PP-1" }, mkOrder: { state: "created", buyerOrder: "k", attempts: 1 }, resultPublishedToCustomer: true });
    const ann = await annotatePreorderOrders([order("o-1"), order("o-2", "T4A" + "d".repeat(24) + ".3"), order("o-3")]);
    expect(ann["o-1"]).toMatchObject({ submissionId: String(s._id), published: true, detached: false });
    expect(ann["o-2"]).toMatchObject({ submissionId: "", detached: true });
    expect(ann["o-3"]).toBeUndefined();
  });
});
