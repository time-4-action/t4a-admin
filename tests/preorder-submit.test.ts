import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongo, stopMongo, clearMongo } from "./helpers/mongo";
import { MkFake, personPartner } from "./helpers/mk-fake";
import { baseCampaign, vatConfig } from "./helpers/fixtures";
import { saveVatSettings } from "@/lib/vat-settings";
import { PreorderCampaign, type IPreorderCampaign } from "@/models/preorder-campaign";
import { PreorderSubmission } from "@/models/preorder-submission";
import { saveOrSubmitPreorder, repriceSubmission } from "@/lib/preorder-submit";
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
    vatOverrides: c.vatOverrides,
  });
}

const person = { mkId: "p2", name: "Janez Novak", email: "janez@example.com", mk: personPartner };

function submit(
  campaignDoc: IPreorderCampaign,
  mk: MkFake,
  quantities: Record<string, number>,
  action: "save" | "submit" = "submit",
  actor: "customer" | "admin" = "customer",
  who: typeof partner | typeof person = partner,
) {
  return saveOrSubmitPreorder({
    campaignDoc,
    partner: who,
    quantities,
    terms: { comment: "please ship early" },
    action,
    actor: actor === "customer" ? { source: "customer" } : { source: "admin", email: "admin@t4a.test" },
    port: mk,
    // The company tests need no VAT table (zero-rated); the consumer tests seed one.
    vat: vatConfig,
  });
}

beforeAll(startMongo);
afterAll(stopMongo);
beforeEach(async () => {
  await clearMongo();
  invalidateAuth0Cache();
});

describe("submission → Metakocka order", () => {
  it("a fixed-price line goes to Metakocka without the tier discount; the note says so", async () => {
    const c = baseCampaign();
    c.tabs[0].groups[0].rows.push({ ...c.tabs[0].groups[0].rows[0], id: "s4", code: "SKU-s4", name: "Fixed sail", fixedPrice: true });
    const campaign = await makeCampaign({ tabs: c.tabs });
    const mk = new MkFake();
    const r = await submit(campaign, mk, { s1: 100, s4: 2 });
    expect(r.ok).toBe(true);
    const [l1, l4] = mk.creates[0].lines;
    expect(l1).toMatchObject({ code: "SKU-s1", price: 100, discount: 10 });
    expect(l4).toMatchObject({ code: "SKU-s4", price: 100 });
    expect(l4.discount).toBeUndefined();
    expect(mk.creates[0].notes).toContain("fixed-price items not discounted");
  });

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
    // 100 × 100 + 20 × 50 = 11 000 on the order ⇒ Sails' Gold tier 10 % — sent as the
    // LIST price + a discount %, not baked in. A company: NET partner price, zero-rated.
    expect(input.lines[0]).toMatchObject({ price: 100, discount: 10, taxFactor: 0, tax: "000" });
    expect(input.lines[0].priceWithTax).toBeUndefined();
    // Masts has no ladder ⇒ no discount on that line.
    expect(input.lines[1]).toMatchObject({ price: 50, taxFactor: 0 });
    expect(input.lines[1].discount).toBeUndefined();
    expect(input.buyerOrder).toBe(buyerOrderKey(String(r.doc._id), 1));
    expect(input.extraColumns).toBeUndefined(); // MK rejects extra columns on sales orders
    expect(input.changeLogNote).toBe(`T4A preorder ${String(r.doc._id)}`);
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
      priceBooks: [{ pricelist: "VIP 2027", currency: "EUR", entries: [{ code: "SKU-s1", net: 80, taxCode: "EX1" }], missing: 0 }],
    });
    const mk = new MkFake();
    const r = await submit(campaign, mk, { s1: 1 });
    if (!r.ok) throw new Error("submit failed");
    expect(mk.creates[0].lines[0]).toMatchObject({ code: "SKU-s1", price: 80, taxFactor: 0, tax: "000" });
    const view = toSubmissionView(r.doc);
    expect(view.snapshot?.market?.name).toBe("Adriatic");
    expect(view.snapshot?.partnerPricelist).toBe("VIP 2027");
    expect(view.snapshot?.sources.pricelist).toBe("market");
    expect(view.snapshot?.countryIso).toBe("SI");
  });
});

describe("consumer (B2C) submissions — partner price + VAT on top", () => {
  it("individual: MK lines carry the net partner price + the country's tax factor; snapshot freezes the VAT decision", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const r = await submit(campaign, mk, { s1: 100, m1: 20 }, "submit", "customer", person);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const input = mk.creates[0];
    // 100 × 100 + 20 × 50 = 11 000 net on the order ⇒ Gold 10 % as the line discount on the 100 net; SI 22 % added by MK.
    expect(input.lines[0]).toEqual({ code: "SKU-s1", amount: 100, price: 100, discount: 10, taxFactor: 0.22, tax: "EX4" });
    expect(input.lines[1]).toEqual({ code: "SKU-m1", amount: 20, price: 50, taxFactor: 0.22, tax: "EX4" });
    expect(input.notes).toContain("VAT: Individual, partner prices excl. VAT, 22% added (SI, global rate)");
    const view = toSubmissionView(r.doc);
    expect(view.snapshot?.pricing).toEqual({
      kind: "person",
      basis: "partner",
      countryIso: "SI",
      vatRate: 22,
      vatSource: "global",
      mkTaxCode: "EX4",
      totals: { net: 10000, vat: 2200, gross: 12200 },
    });
    expect(view.snapshot?.lines[0]).toMatchObject({ unitPrice: 100, rrp: 200, partnerPrice: 100, unitNet: 90, unitVat: 19.8, unitGross: 109.8 });
    expect(view.totals?.net).toBe(10000);
    // MK's own total (net lines + the factor) equals the frozen gross.
    expect(Number(mk.orders.get("mk1")?.sumAll)).toBe(12200);
  });

  it("campaign VAT override beats the global rate", async () => {
    const campaign = await makeCampaign({ vatOverrides: [{ iso: "SI", rate: 9.5 }] });
    const mk = new MkFake();
    const r = await submit(campaign, mk, { m1: 1 }, "submit", "customer", person);
    if (!r.ok) throw new Error("submit failed");
    expect(mk.creates[0].lines[0]).toEqual({ code: "SKU-m1", amount: 1, price: 50, taxFactor: 0.095, tax: "EX3" });
    expect(toSubmissionView(r.doc).snapshot?.pricing).toMatchObject({ vatRate: 9.5, vatSource: "campaign", totals: { net: 50, vat: 4.75, gross: 54.75 } });
  });

  it("no VAT rate for the customer's country ⇒ 422 vat-missing, no MK order, for admins too; drafts still save", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const noVat = { ...person, mk: { ...personPartner, address: { ...personPartner.address, country: "Japan" }, foreignCountry: true } };
    const c = await saveOrSubmitPreorder({ campaignDoc: campaign, partner: noVat, quantities: { m1: 1 }, terms: undefined, action: "submit", actor: { source: "customer" }, port: mk, vat: vatConfig });
    expect(c.ok).toBe(false);
    expect(c.ok === false && [c.status, c.error]).toEqual([422, "vat-missing"]);
    expect(c.ok === false && c.message).toContain("JP");
    const a = await saveOrSubmitPreorder({ campaignDoc: campaign, partner: noVat, quantities: { m1: 1 }, terms: undefined, action: "submit", actor: { source: "admin", email: "a" }, port: mk, vat: vatConfig });
    expect(a.ok === false && a.error).toBe("vat-missing");
    expect(mk.creates).toHaveLength(0);
    expect(await PreorderSubmission.countDocuments({ status: "submitted" })).toBe(0);
    const d = await saveOrSubmitPreorder({ campaignDoc: campaign, partner: noVat, quantities: { m1: 1 }, terms: undefined, action: "save", actor: { source: "customer" }, port: mk, vat: vatConfig });
    expect(d.ok && d.doc.status).toBe("draft");
    // A fallback rate unblocks it.
    const f = await saveOrSubmitPreorder({ campaignDoc: campaign, partner: noVat, quantities: { m1: 1 }, terms: undefined, action: "submit", actor: { source: "customer" }, port: mk, vat: { ...vatConfig, fallbackRate: 20 } });
    expect(f.ok).toBe(true);
    expect(mk.creates[0].lines[0]).toEqual({ code: "SKU-m1", amount: 1, price: 50, taxFactor: 0.2, tax: "EX2" });
    expect(f.ok && toSubmissionView(f.doc).snapshot?.pricing?.vatSource).toBe("fallback");
  });

  it("a market that charges companies VAT: net partner price + the country's tax factor on the MK line", async () => {
    const campaign = await makeCampaign({ markets: [{ id: "si", name: "Domestic", color: "sky", countries: ["SI"], config: { vatCompanies: true } }] });
    const mk = new MkFake();
    const r = await submit(campaign, mk, { m1: 2 });
    if (!r.ok) throw new Error("submit failed");
    expect(mk.creates[0].lines[0]).toEqual({ code: "SKU-m1", amount: 2, price: 50, taxFactor: 0.22, tax: "EX4" });
    expect(toSubmissionView(r.doc).snapshot?.pricing).toMatchObject({ kind: "business", basis: "partner", vatRate: 22, vatSource: "global", totals: { net: 100, vat: 22, gross: 122 } });
    expect(Number(mk.orders.get("mk1")?.sumAll)).toBe(122);
  });

  it("a VAT-exempt market: individuals pay the partner price with no VAT added", async () => {
    const campaign = await makeCampaign({ markets: [{ id: "ex", name: "Export", color: "sky", countries: ["SI"], config: { vatMode: "exempt" } }] });
    const mk = new MkFake();
    const r = await submit(campaign, mk, { m1: 1 }, "submit", "customer", person);
    if (!r.ok) throw new Error("submit failed");
    expect(mk.creates[0].lines[0]).toEqual({ code: "SKU-m1", amount: 1, price: 50, taxFactor: 0, tax: "000" });
    expect(toSubmissionView(r.doc).snapshot?.pricing).toMatchObject({ vatRate: 0, vatSource: "exempt", totals: { net: 50, vat: 0, gross: 50 } });
  });

  it("a customer-specific VAT rate beats the country rate for an individual", async () => {
    const campaign = await makeCampaign({ customerRules: [{ partnerMkId: "p2", partnerName: "Jane", config: { vatMode: "fixed", vatRate: 10 } }] });
    const mk = new MkFake();
    const r = await submit(campaign, mk, { m1: 1 }, "submit", "customer", person);
    if (!r.ok) throw new Error("submit failed");
    expect(mk.creates[0].lines[0]).toEqual({ code: "SKU-m1", amount: 1, price: 50, taxFactor: 0.1, tax: null });
    expect(toSubmissionView(r.doc).snapshot?.pricing).toMatchObject({ vatRate: 10, vatSource: "customer", totals: { net: 50, vat: 5, gross: 55 } });
  });

  it("a missing RRP changes nothing — everyone orders at the partner price; a row with no price at all cannot be submitted", async () => {
    const c = baseCampaign();
    c.tabs[1].groups[0].rows[0].rrp = null;
    const campaign = await makeCampaign({ tabs: c.tabs });
    const mk = new MkFake();
    const r = await submit(campaign, mk, { m1: 1 }, "submit", "customer", person);
    expect(r.ok).toBe(true);
    expect(mk.creates[0].lines[0]).toEqual({ code: "SKU-m1", amount: 1, price: 50, taxFactor: 0.22, tax: "EX4" });

    const c2 = baseCampaign();
    Object.assign(c2.tabs[1].groups[0].rows[0], { rrp: null, partnerPrice: null, discountedPrice: null });
    const campaign2 = await makeCampaign({ tabs: c2.tabs });
    const r2 = await submit(campaign2, mk, { m1: 1, s1: 1 }, "submit", "customer", person);
    expect(r2.ok === false && [r2.status, r2.error]).toEqual([422, "unpriced"]);
    expect(r2.ok === false && r2.message).toContain("Product m1");
    const d = await submit(campaign2, mk, { m1: 1, s1: 1 }, "save", "customer", person);
    expect(d.ok && d.doc.lines.map((l) => l.rowId).sort()).toEqual(["m1", "s1"]);
  });

  it("the global VAT table is read from Mongo when the caller passes none, and a later change never alters a registered order", async () => {
    await saveVatSettings({ rates: { SI: 22 }, fallbackRate: null, taxCodes: vatConfig.taxCodes }, "test");
    const campaign = await makeCampaign();
    const mk = new MkFake();
    mk.mode = "fail";
    const r = await saveOrSubmitPreorder({ campaignDoc: campaign, partner: person, quantities: { m1: 1 }, terms: undefined, action: "submit", actor: { source: "customer" }, port: mk });
    expect(r.ok && r.register?.state).toBe("failed");
    if (!r.ok) return;
    // VAT changes to 25 % after the customer submitted; the retry still registers at 22 %.
    await saveVatSettings({ rates: { SI: 25 }, fallbackRate: null, taxCodes: vatConfig.taxCodes }, "test");
    mk.mode = "ok";
    const retry = await registerSalesOrder(r.doc._id, { source: "admin", email: "a" }, { port: mk });
    expect(retry.state).toBe("created");
    expect(mk.creates.at(-1)?.lines[0]).toEqual({ code: "SKU-m1", amount: 1, price: 50, taxFactor: 0.22, tax: "EX4" });
  });
});

describe("a customer's quantities are never lost silently", () => {
  it("a draft keeps quantities on rows the customer can no longer see; submit leaves them out and says so", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const d1 = await submit(campaign, mk, { s1: 2, m1: 5 }, "save");
    expect(d1.ok).toBe(true);
    // Admin hides m1 for this partner after the draft was saved.
    campaign.customerRules = [{ partnerMkId: "p1", partnerName: "Surf Shop X", config: { hiddenIds: ["m1"] } }] as typeof campaign.customerRules;
    await campaign.save();
    const d2 = await submit(campaign, mk, { s1: 3, m1: 5 }, "save");
    expect(d2.ok).toBe(true);
    if (!d2.ok) return;
    expect(d2.dropped).toEqual(["m1"]);
    expect(d2.doc.lines.map((l) => [l.rowId, l.qty])).toEqual([["s1", 3], ["m1", 5]]); // m1 carried over
    const sub = await submit(campaign, mk, { s1: 3, m1: 5 });
    expect(sub.ok).toBe(true);
    if (!sub.ok) return;
    expect(sub.dropped).toEqual(["m1"]);
    expect(sub.doc.lines.map((l) => l.rowId)).toEqual(["s1"]);
    expect(mk.creates[0].lines.map((l) => l.code)).toEqual(["SKU-s1"]);
  });

  it("re-pricing refuses when a submitted line is no longer available, instead of dropping it", async () => {
    await saveVatSettings({ rates: { SI: 22 }, fallbackRate: null, taxCodes: vatConfig.taxCodes }, "test");
    const campaign = await makeCampaign();
    const mk = new MkFake();
    mk.mode = "fail";
    const r = await submit(campaign, mk, { s1: 1, m1: 2 });
    if (!r.ok) throw new Error("submit failed");
    campaign.customerRules = [{ partnerMkId: "p1", partnerName: "Surf Shop X", config: { hiddenIds: ["m1"] } }] as typeof campaign.customerRules;
    await campaign.save();
    const rp = await repriceSubmission((await PreorderSubmission.findById(r.doc._id).exec())!, { partner: mk.partnerById });
    expect(rp.ok).toBe(false);
    expect(rp.ok === false && rp.message).toContain("SKU-m1");
    const still = (await PreorderSubmission.findById(r.doc._id).exec())!;
    expect(still.lines.map((l) => l.rowId).sort()).toEqual(["m1", "s1"]);
  });
});

describe("re-pricing a submitted preorder", () => {
  it("a preorder without a pricing snapshot is re-priced from the campaign as it is now, then registers", async () => {
    await saveVatSettings({ rates: { SI: 22 }, fallbackRate: null, taxCodes: vatConfig.taxCodes }, "test");
    const campaign = await makeCampaign();
    const mk = new MkFake();
    mk.mode = "fail";
    const r = await submit(campaign, mk, { s1: 2, m1: 1 }, "submit", "customer", person);
    if (!r.ok) throw new Error("submit failed");
    // Simulate a legacy submission: no pricing block, no per-line VAT figures.
    await PreorderSubmission.updateOne({ _id: r.doc._id }, { $set: { "snapshot.pricing": null }, $unset: { "snapshot.lines.$[].unitGross": 1, "snapshot.lines.$[].unitNet": 1 } }).exec();
    mk.mode = "ok";
    const stale = (await PreorderSubmission.findById(r.doc._id).exec())!;
    const blocked = await registerSalesOrder(stale._id, { source: "admin", email: "a" }, { port: mk });
    expect(blocked.state).toBe("failed");
    expect(blocked.error).toContain("no pricing snapshot");

    const rp = await repriceSubmission(stale, { partner: personPartner });
    expect(rp.ok).toBe(true);
    if (!rp.ok) return;
    expect(toSubmissionView(rp.doc).snapshot?.pricing).toMatchObject({ kind: "person", basis: "partner", vatRate: 22, vatSource: "global" });
    const retry = await registerSalesOrder(rp.doc._id, { source: "admin", email: "a" }, { port: mk });
    expect(retry.state).toBe("created");
    expect(mk.creates.at(-1)?.lines[0]).toEqual({ code: "SKU-s1", amount: 2, price: 100, taxFactor: 0.22, tax: "EX4" });
  });

  it("refuses to re-price a preorder that already has a Metakocka order", async () => {
    const campaign = await makeCampaign();
    const mk = new MkFake();
    const r = await submit(campaign, mk, { m1: 1 });
    if (!r.ok) throw new Error("submit failed");
    const rp = await repriceSubmission((await PreorderSubmission.findById(r.doc._id).exec())!, { partner: mk.partnerById });
    expect(rp.ok === false && rp.error).toBe("has-order");
  });
});

describe("portal wire views never leak admin configuration", () => {
  it("strips markets, rules, price books, list names and provenance", async () => {
    const campaign = await makeCampaign({
      markets: [{ id: "m", name: "Secret market", color: "sky", countries: ["SI"], config: { partnerPricelist: "VIP 2027" } }],
      customerRules: [{ partnerMkId: "p1", partnerName: "P", config: { note: "hello" } }],
      priceBooks: [{ pricelist: "VIP 2027", currency: "EUR", entries: [{ code: "SKU-s1", net: 80 }], missing: 0 }],
    });
    const effective = await loadEffectiveCampaignForPartner(campaign, { mkId: "p1", countryIso: "SI", countrySource: "mk", kind: "business" });
    const portal = toPortalCampaignView(effective) as unknown as Record<string, unknown>;
    const json = JSON.stringify(portal);
    expect(portal.markets).toBeUndefined();
    expect(portal.customerRules).toBeUndefined();
    expect(portal.priceBooks).toBeUndefined();
    expect(portal.partnerPricelist).toBeUndefined();
    expect(json).not.toContain("VIP 2027");
    expect(json).not.toContain("Secret market");
    expect(portal.effective).toEqual({ note: "hello", minOrderAmount: null });
    // …the pricing context (how this customer is priced) does reach them — no admin data in it.
    expect(portal.pricing).toEqual({ kind: "business", basis: "partner", countryIso: "SI", vat: { rate: 0, source: "zero-rated" } });
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
