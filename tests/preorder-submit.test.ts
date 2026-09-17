import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongo, stopMongo, clearMongo } from "./helpers/mongo";
import { MkFake } from "./helpers/mk-fake";
import { baseCampaign } from "./helpers/fixtures";
import { PreorderCampaign, type IPreorderCampaign } from "@/models/preorder-campaign";
import { PreorderSubmission } from "@/models/preorder-submission";
import { saveOrSubmitPreorder } from "@/lib/preorder-submit";
import { detachSalesOrder, publishResult, readSubmissionOrder, registerSalesOrder } from "@/lib/preorder-mk";
import { loadEffectiveCampaignForPartner, toPortalCampaignView, toPortalSubmissionView, toSubmissionView } from "@/lib/preorder";
import { buyerOrderKey } from "@/types/preorder";
import { invalidateAuth0Cache } from "@/lib/auth0-cache";

const partner = { mkId: "p1", name: "Surf Shop X", email: "shop@example.com", mk: new MkFake().partnerById };

async function makeCampaign(over: Parameters<typeof baseCampaign>[0] = {}): Promise<IPreorderCampaign> {
  const c = baseCampaign(over);
  return PreorderCampaign.create({
    title: c.title,
    season: c.season,
    currency: c.currency,
    status: "open",
    partnerPricelist: c.partnerPricelist,
    rrpPricelist: c.rrpPricelist,
    tabs: c.tabs,
    markets: c.markets.map((m) => ({ ...m, config: m.config })),
    customerRules: c.customerRules,
    priceBooks: c.priceBooks,
  });
}

function submit(campaignDoc: IPreorderCampaign, mk: MkFake, quantities: Record<string, number>, action: "save" | "submit" = "submit", actor: "customer" | "admin" = "customer") {
  return saveOrSubmitPreorder({
    campaignDoc,
    partner,
    quantities,
    terms: { comment: "please ship early" },
    action,
    actor: actor === "customer" ? { source: "customer" } : { source: "admin", email: "admin@t4a.test" },
    port: mk,
  });
}

beforeAll(startMongo);
afterAll(stopMongo);
beforeEach(async () => {
  await clearMongo();
  invalidateAuth0Cache();
});

describe("submission → Metakocka order", () => {
  it("submit creates exactly one MK order containing exactly the submitted lines, priced from the snapshot", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const r = await submit(campaign, mk, { s1: 100, m1: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(mk.creates).toHaveLength(1);
    const input = mk.creates[0];
    expect(input.lines.map((l) => [l.code, l.amount])).toEqual([
      ["SKU-s1", 100],
      ["SKU-m1", 20],
    ]);
    // 100 × 100 = 10 000 in the Sails tab ⇒ Gold tier 10 % baked into the unit price.
    expect(input.lines[0].priceWithTax).toBe(90);
    expect(input.lines[1].priceWithTax).toBe(50);
    expect(input.buyerOrder).toBe(buyerOrderKey(String(r.doc._id), 1));
    expect(input.extraColumns?.[0]).toEqual({ name: "t4a_preorder_submission", value: String(r.doc._id) });
    expect(input.currencyCode).toBe("EUR");
    expect(r.register?.state).toBe("created");

    const view = toSubmissionView(r.doc);
    expect(view.stage).toBe("registered");
    expect(view.mkOrder?.state).toBe("created");
    expect(view.mkSalesOrder?.countCode).toBe("PP-mk1");
    expect(view.snapshot?.lines).toHaveLength(2);
    expect(view.totals?.net).toBe(10000 - 1000 + 1000);
    expect(view.resultPublishedToCustomer).toBe(false);
  });

  it("two concurrent submits ⇒ one MK order, one 409", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const [a, b] = await Promise.all([submit(campaign, mk, { s1: 1 }), submit(campaign, mk, { s1: 2 })]);
    const oks = [a, b].filter((r) => r.ok);
    const errs = [a, b].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(errs).toHaveLength(1);
    expect(errs[0].ok === false && errs[0].error).toBe("locked");
    expect(mk.creates).toHaveLength(1);
    expect(await PreorderSubmission.countDocuments()).toBe(1);
  });

  it("a second submit after success is rejected as locked; save on a locked doc too", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    expect((await submit(campaign, mk, { s1: 1 })).ok).toBe(true);
    const again = await submit(campaign, mk, { s1: 5 });
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.status).toBe(409);
    const save = await submit(campaign, mk, { s1: 5 }, "save");
    expect(save.ok === false && save.error).toBe("locked");
    expect(mk.creates).toHaveLength(1);
  });

  it("draft save then submit: one document, draft data replaced", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const d = await submit(campaign, mk, { s1: 3 }, "save");
    expect(d.ok && d.doc.status).toBe("draft");
    expect(mk.creates).toHaveLength(0);
    const s = await submit(campaign, mk, { s1: 4 });
    expect(s.ok && s.doc.status).toBe("submitted");
    expect(s.ok && String(s.doc._id)).toBe(d.ok ? String(d.doc._id) : "");
    expect(mk.creates[0].lines[0].amount).toBe(4);
  });

  it("MK create failure keeps the submission (status submitted, lines + snapshot) with state failed", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    mk.mode = "fail";
    const r = await submit(campaign, mk, { s1: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.register?.state).toBe("failed");
    const doc = (await PreorderSubmission.findById(r.doc._id).exec())!;
    expect(doc.status).toBe("submitted");
    expect(doc.lines).toHaveLength(1);
    expect(doc.snapshot?.lines).toHaveLength(1);
    expect(doc.mkOrder?.state).toBe("failed");
    expect(doc.mkOrder?.lastError).toContain("bad product");
    expect(doc.mkSalesOrder).toBeNull();
    const portal = toPortalSubmissionView(doc);
    expect(portal.registration).toEqual({ state: "failed", canRetry: true });
    expect((portal as unknown as Record<string, unknown>).mkOrder).toBeUndefined();
    expect(JSON.stringify(portal)).not.toContain("bad product");
  });

  it("retry after a failure creates the order once; a further retry is a no-op", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    mk.mode = "fail";
    const r = await submit(campaign, mk, { s1: 2 });
    if (!r.ok) throw new Error("submit failed");
    mk.mode = "ok";
    const retry = await registerSalesOrder(r.doc._id, { source: "customer" }, { port: mk });
    expect(retry.state).toBe("created");
    expect(mk.creates).toHaveLength(2);
    const again = await registerSalesOrder(r.doc._id, { source: "admin", email: "a" }, { port: mk });
    expect(again.state).toBe("created");
    expect(again.mkId).toBe(retry.mkId);
    expect(mk.creates).toHaveLength(2);
    expect(mk.orders.size).toBe(1);
  });

  it("MK committed but our response was lost ⇒ retry ADOPTS the order, zero new creates", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    mk.mode = "commit-then-throw";
    const r = await submit(campaign, mk, { s1: 2 });
    if (!r.ok) throw new Error("submit failed");
    // The service re-looks-up after a failed create and adopts immediately.
    expect(r.register?.state).toBe("created");
    expect(r.register?.adopted).toBe(true);
    expect(mk.creates).toHaveLength(1);
    expect(mk.orders.size).toBe(1);
    const doc = (await PreorderSubmission.findById(r.doc._id).exec())!;
    expect(doc.mkSalesOrder?.mkId).toBe("mk1");
  });

  it("an inconclusive lookup (MK unreachable) fails WITHOUT creating", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    mk.mode = "lookup-error";
    const r = await submit(campaign, mk, { s1: 2 });
    if (!r.ok) throw new Error("submit failed");
    expect(r.register?.state).toBe("failed");
    expect(mk.creates).toHaveLength(0);
    const doc = (await PreorderSubmission.findById(r.doc._id).exec())!;
    expect(doc.mkOrder?.lastError).toContain("lookup inconclusive");
  });

  it("a fresh pending lock cannot be re-acquired; a stale one can", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const r = await submit(campaign, mk, { s1: 2 });
    if (!r.ok) throw new Error("submit failed");
    // Force the doc back into a pending state as if a registration were in flight.
    await PreorderSubmission.updateOne({ _id: r.doc._id }, { $set: { "mkOrder.state": "pending", "mkOrder.lockedAt": new Date(), mkSalesOrder: null } });
    mk.orders.clear();
    const blocked = await registerSalesOrder(r.doc._id, { source: "customer" }, { port: mk });
    expect(blocked.state).toBe("pending");
    expect(mk.creates).toHaveLength(1);
    await PreorderSubmission.updateOne({ _id: r.doc._id }, { $set: { "mkOrder.lockedAt": new Date(Date.now() - 10 * 60_000) } });
    const took = await registerSalesOrder(r.doc._id, { source: "customer" }, { port: mk });
    expect(took.state).toBe("created");
    expect(mk.creates).toHaveLength(2);
  });

  it("hidden row ids in the payload are dropped; restricted rows cannot be ordered", async () => {
    const campaign = await makeCampaign({
      markets: [{ id: "m", name: "M", color: "sky", countries: ["SI"], config: { hiddenIds: ["m1"] } }],
    });
    const mk = new MkFake();
    const r = await submit(campaign, mk, { s1: 1, m1: 5, s3: 7 });
    expect(r.ok && r.dropped.sort()).toEqual(["m1", "s3"]);
    expect(mk.creates[0].lines.map((l) => l.code)).toEqual(["SKU-s1"]);
  });

  it("minimum order value is enforced for customers only", async () => {
    const campaign = await makeCampaign({
      customerRules: [{ partnerMkId: "p1", partnerName: "P", config: { minOrderAmount: 5000 } }],
    });
    const mk = new MkFake();
    const c = await submit(campaign, mk, { s1: 1 });
    expect(c.ok === false && c.error).toBe("min-order");
    expect(mk.creates).toHaveLength(0);
    const a = await submit(campaign, mk, { s1: 1 }, "submit", "admin");
    expect(a.ok).toBe(true);
    expect(mk.creates).toHaveLength(1);
  });

  it("market pricing reaches the MK order (price book), snapshot keeps provenance", async () => {
    const campaign = await makeCampaign({
      markets: [{ id: "adr", name: "Adriatic", color: "teal", countries: ["SI"], config: { partnerPricelist: "VIP 2027" } }],
      priceBooks: [{ pricelist: "VIP 2027", currency: "EUR", entries: [{ code: "SKU-s1", gross: 80, taxCode: "EX1" }], missing: 0 }],
    });
    const mk = new MkFake();
    const r = await submit(campaign, mk, { s1: 1 });
    if (!r.ok) throw new Error("submit failed");
    expect(mk.creates[0].lines[0]).toMatchObject({ code: "SKU-s1", priceWithTax: 80, tax: "EX1" });
    const view = toSubmissionView(r.doc);
    expect(view.snapshot?.market?.name).toBe("Adriatic");
    expect(view.snapshot?.partnerPricelist).toBe("VIP 2027");
    expect(view.snapshot?.sources.pricelist).toBe("market");
    expect(view.snapshot?.countryIso).toBe("SI");
  });
});

describe("portal wire views never leak admin configuration", () => {
  it("strips markets, rules, price books, list names and provenance", async () => {
    const campaign = await makeCampaign({
      markets: [{ id: "m", name: "Secret market", color: "sky", countries: ["SI"], config: { partnerPricelist: "VIP 2027" } }],
      customerRules: [{ partnerMkId: "p1", partnerName: "P", config: { note: "hello" } }],
      priceBooks: [{ pricelist: "VIP 2027", currency: "EUR", entries: [{ code: "SKU-s1", gross: 80 }], missing: 0 }],
    });
    const effective = loadEffectiveCampaignForPartner(campaign, { mkId: "p1", countryIso: "SI", countrySource: "mk" });
    const portal = toPortalCampaignView(effective) as unknown as Record<string, unknown>;
    const json = JSON.stringify(portal);
    expect(portal.markets).toBeUndefined();
    expect(portal.customerRules).toBeUndefined();
    expect(portal.priceBooks).toBeUndefined();
    expect(portal.partnerPricelist).toBeUndefined();
    expect(json).not.toContain("VIP 2027");
    expect(json).not.toContain("Secret market");
    expect(portal.effective).toEqual({ note: "hello", minOrderAmount: null });
    // …but the resolved prices did reach the sheet.
    const rows = (portal.tabs as { groups: { rows: { code: string; partnerPrice: number }[] }[] }[]).flatMap((t) => t.groups.flatMap((g) => g.rows));
    expect(rows.find((r) => r.code === "SKU-s1")?.partnerPrice).toBe(80);
  });
});

describe("unlock / detach / resubmit", () => {
  it("unlock while registering is refused; after detaching, resubmit uses a new buyer_order and the old order lands in history", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const r = await submit(campaign, mk, { s1: 1 });
    if (!r.ok) throw new Error("submit failed");

    await PreorderSubmission.updateOne({ _id: r.doc._id }, { $set: { "mkOrder.state": "pending", "mkOrder.lockedAt": new Date() } });
    const live = (await PreorderSubmission.findById(r.doc._id).exec())!;
    const refused = await detachSalesOrder(live, { deleteInMk: false, actor: { source: "admin", email: "a" }, port: mk });
    expect(refused.ok).toBe(false);
    await PreorderSubmission.updateOne({ _id: r.doc._id }, { $set: { "mkOrder.state": "created", "mkOrder.lockedAt": null } });

    const doc = (await PreorderSubmission.findById(r.doc._id).exec())!;
    const det = await detachSalesOrder(doc, { deleteInMk: false, actor: { source: "admin", email: "a" }, port: mk, reason: "unlock" });
    expect(det.ok).toBe(true);
    await PreorderSubmission.updateOne({ _id: r.doc._id }, { $set: { status: "draft" } });

    const r2 = await submit(campaign, mk, { s1: 3 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(mk.creates).toHaveLength(2);
    expect(mk.creates[1].buyerOrder).toBe(buyerOrderKey(String(r.doc._id), 2));
    const view = toSubmissionView(r2.doc);
    expect(view.submitRevision).toBe(2);
    expect(view.mkSalesOrderHistory?.[0]).toMatchObject({ mkId: "mk1", deletedInMk: false });
    expect(view.mkSalesOrder?.mkId).toBe("mk2");
    expect(view.resultPublishedToCustomer).toBe(false);
  });

  it("detach with deleteInMk removes the order in MK", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const r = await submit(campaign, mk, { s1: 1 });
    if (!r.ok) throw new Error("submit failed");
    const doc = (await PreorderSubmission.findById(r.doc._id).exec())!;
    const det = await detachSalesOrder(doc, { deleteInMk: true, actor: { source: "admin", email: "a" }, port: mk });
    expect(det.ok && det.deletedInMk).toBe(true);
    expect(mk.orders.size).toBe(0);
  });
});

describe("publication", () => {
  it("allocation is private until published, then reflects the live MK order", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const r = await submit(campaign, mk, { s1: 100, m1: 20 });
    if (!r.ok) throw new Error("submit failed");
    let doc = (await PreorderSubmission.findById(r.doc._id).exec())!;
    expect(toPortalSubmissionView(doc).published).toBe(false);

    // Staff cut the allocation in MK.
    mk.setLine("mk1", "SKU-s1", 90);

    const pub = await publishResult(doc, true, { source: "admin", email: "a" }, { port: mk });
    expect(pub.ok).toBe(true);
    doc = (await PreorderSubmission.findById(r.doc._id).exec())!;
    expect(doc.resultPublishedToCustomer).toBe(true);
    expect(toPortalSubmissionView(doc).published).toBe(true);
    expect(toSubmissionView(doc).stage).toBe("published");

    const read = await readSubmissionOrder(doc, { port: mk, fresh: true });
    expect(read.state).toBe("ok");
    if (read.state !== "ok") return;
    expect(read.allocation.requestedQty).toBe(120);
    expect(read.allocation.allocatedQty).toBe(110);
    expect(read.allocation.lines[0]).toMatchObject({ code: "SKU-s1", requestedQty: 100, allocatedQty: 90, status: "partial" });
    expect(read.allocation.changedSincePublish).toBe(false);

    // A later MK edit shows up as "changed since publish".
    mk.setLine("mk1", "SKU-s1", 50);
    const read2 = await readSubmissionOrder(doc, { port: mk, fresh: true });
    expect(read2.state === "ok" && read2.allocation.changedSincePublish).toBe(true);

    // Unpublish hides again.
    await publishResult(doc, false, { source: "admin", email: "a" }, { port: mk });
    doc = (await PreorderSubmission.findById(r.doc._id).exec())!;
    expect(toPortalSubmissionView(doc).published).toBe(false);
  });

  it("publishing a deleted MK order is refused", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const r = await submit(campaign, mk, { s1: 1 });
    if (!r.ok) throw new Error("submit failed");
    mk.orders.clear();
    const doc = (await PreorderSubmission.findById(r.doc._id).exec())!;
    const pub = await publishResult(doc, true, { source: "admin", email: "a" }, { port: mk });
    expect(pub.ok).toBe(false);
    expect(pub.ok === false && pub.status).toBe(409);
    const read = await readSubmissionOrder(doc, { port: mk, fresh: true });
    expect(read.state).toBe("missing");
  });
});
