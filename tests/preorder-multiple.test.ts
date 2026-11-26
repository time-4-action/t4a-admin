import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongo, stopMongo, clearMongo } from "./helpers/mongo";
import { MkFake } from "./helpers/mk-fake";
import { baseCampaign, vatConfig } from "./helpers/fixtures";
import { PreorderCampaign, type IPreorderCampaign } from "@/models/preorder-campaign";
import { PreorderSubmission } from "@/models/preorder-submission";
import { saveOrSubmitPreorder } from "@/lib/preorder-submit";
import { ensureSubmissionSlots, loadEffectiveCampaignForPartner, toPortalCampaignView } from "@/lib/preorder";
import { buyerOrderKey } from "@/types/preorder";
import { invalidateAuth0Cache } from "@/lib/auth0-cache";

const partner = { mkId: "p1", name: "Surf Shop X", email: "shop@example.com", mk: new MkFake().partnerById };

async function makeCampaign(allowMultiplePreorders: boolean): Promise<IPreorderCampaign> {
  const c = baseCampaign();
  return PreorderCampaign.create({
    title: c.title,
    currency: c.currency,
    status: "open",
    partnerPricelist: c.partnerPricelist,
    rrpPricelist: c.rrpPricelist,
    tabs: c.tabs,
    allowMultiplePreorders,
  });
}

function write(
  campaignDoc: IPreorderCampaign,
  mk: MkFake,
  quantities: Record<string, number>,
  action: "save" | "submit" = "submit",
  submissionId?: string,
) {
  return saveOrSubmitPreorder({
    campaignDoc,
    partner,
    quantities,
    terms: {},
    action,
    actor: { source: "customer" },
    submissionId,
    port: mk,
    vat: vatConfig,
  });
}

beforeAll(startMongo);
afterAll(stopMongo);
beforeEach(async () => {
  await clearMongo();
  invalidateAuth0Cache();
});

describe("submission slot migration", () => {
  it("backfills seq 1 and drops the old one-per-customer unique index", async () => {
    const col = PreorderSubmission.collection;
    await col.dropIndexes();
    await col.createIndex({ campaignId: 1, partnerMkId: 1 }, { unique: true });
    const campaign = await makeCampaign(true);
    await col.insertOne({ campaignId: campaign._id, partnerMkId: "p1", partnerName: "X", status: "submitted", lines: [] });

    await ensureSubmissionSlots({ force: true });
    const names = (await col.indexes()).map((i) => i.name);
    expect(names).not.toContain("campaignId_1_partnerMkId_1");
    expect(names).toContain("campaignId_1_partnerMkId_1_seq_1");
    expect((await col.findOne({ partnerMkId: "p1" }))?.seq).toBe(1);

    // Idempotent.
    await ensureSubmissionSlots({ force: true });
    // And a second preorder can now be placed.
    const r = await write(campaign, new MkFake(), { s1: 1 });
    expect(r.ok && r.doc.seq).toBe(2);
  });
});

describe("multiple preorders per customer", () => {
  it("setting off: a second preorder is refused as locked (unchanged behaviour)", async () => {
    const campaign = await makeCampaign(false);
    const mk = new MkFake();
    expect((await write(campaign, mk, { s1: 1 })).ok).toBe(true);
    const again = await write(campaign, mk, { s1: 2 });
    expect(again.ok === false && again.error).toBe("locked");
    expect(await PreorderSubmission.countDocuments()).toBe(1);
    expect(mk.creates).toHaveLength(1);
  });

  it("setting on: submitting again starts preorder 2 with its own Metakocka order", async () => {
    const campaign = await makeCampaign(true);
    const mk = new MkFake();
    const first = await write(campaign, mk, { s1: 1 });
    const second = await write(campaign, mk, { s1: 2 });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.doc.seq).toBe(1);
    expect(second.doc.seq).toBe(2);
    expect(String(second.doc._id)).not.toBe(String(first.doc._id));
    expect(mk.creates).toHaveLength(2);
    expect(second.doc.mkOrder?.buyerOrder).toBe(buyerOrderKey(String(second.doc._id), 1));
    // The first preorder is untouched.
    const one = await PreorderSubmission.findById(first.doc._id).lean();
    expect(one?.lines.map((l) => l.qty)).toEqual([1]);
  });

  it("each preorder is priced on its own (own volume-discount tier)", async () => {
    const campaign = await makeCampaign(true);
    const mk = new MkFake();
    const big = await write(campaign, mk, { s1: 100 }); // reaches the 10% tier
    const small = await write(campaign, mk, { s1: 1 });
    expect(mk.creates[0].lines[0].discount).toBe(10);
    expect(mk.creates[1].lines[0].discount).toBeUndefined();
    expect(big.ok && small.ok).toBe(true);
  });

  it("drafts: saves go to the one open draft; a new preorder is only started once it is submitted", async () => {
    const campaign = await makeCampaign(true);
    const mk = new MkFake();
    await write(campaign, mk, { s1: 1 });
    const d1 = await write(campaign, mk, { s1: 3 }, "save");
    const d2 = await write(campaign, mk, { s1: 4 }, "save");
    expect(d1.ok && d2.ok && String(d1.doc._id) === String(d2.doc._id)).toBe(true);
    if (!d2.ok) return;
    expect(d2.doc.seq).toBe(2);
    const s = await write(campaign, mk, { s1: 5 }, "submit", String(d2.doc._id));
    expect(s.ok && s.doc.status).toBe("submitted");
    expect(await PreorderSubmission.countDocuments()).toBe(2);
  });

  it("writing to a submitted preorder by id is refused; an unknown id is 404", async () => {
    const campaign = await makeCampaign(true);
    const mk = new MkFake();
    const first = await write(campaign, mk, { s1: 1 });
    if (!first.ok) throw new Error("submit failed");
    const again = await write(campaign, mk, { s1: 2 }, "save", String(first.doc._id));
    expect(again.ok === false && again.error).toBe("locked");
    const other = await write(campaign, mk, { s1: 2 }, "save", "64b000000000000000000000");
    expect(other.ok === false && other.status).toBe(404);
  });

  it("two tabs starting preorder 2 at once never duplicate an order: every Metakocka order is one preorder", async () => {
    const campaign = await makeCampaign(true);
    const mk = new MkFake();
    await write(campaign, mk, { s1: 1 });
    const results = await Promise.all([write(campaign, mk, { s1: 1 }), write(campaign, mk, { s1: 2 })]);
    const ok = results.filter((r) => r.ok).length;
    for (const r of results) if (!r.ok) expect(r.error).toBe("locked");
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(await PreorderSubmission.countDocuments()).toBe(1 + ok);
    expect(mk.creates).toHaveLength(1 + ok);
    const seqs = (await PreorderSubmission.find().lean()).map((d) => d.seq).sort();
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it("the customer's campaign view carries the setting", async () => {
    const campaign = await makeCampaign(true);
    const eff = await loadEffectiveCampaignForPartner(campaign, partner, { vat: vatConfig });
    expect(toPortalCampaignView(eff).allowMultiplePreorders).toBe(true);
  });
});
