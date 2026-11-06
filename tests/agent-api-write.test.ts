// The agent API's WRITE routes (POST /api/agent/*): write-token auth, the actor,
// and that each route drives the same lib function as the admin UI against seeded
// Mongo (mongodb-memory-server), with Metakocka faked through the MkFake port and
// mk-automation through a stubbed fetch.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

const h = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fake: null as any,
  callMetakocka: vi.fn(),
}));
// Every Metakocka call the real lib makes goes to the in-memory fake.
vi.mock("@/lib/metakocka", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/metakocka")>();
  return {
    ...orig,
    callMetakocka: h.callMetakocka,
    createSalesOrder: (i: never) => h.fake.create(i),
    getSalesOrderByBuyerOrder: (b: string) => h.fake.getByBuyerOrder(b),
    getSalesOrder: async (id: string) => {
      const o = await h.fake.get(id);
      return o === "error" ? { status: "error", error: "down" } : o ? { status: "ok", order: o } : { status: "not-found" };
    },
    deleteSalesOrder: (id: string) => h.fake.delete(id),
    getPartnerById: (id: string) => h.fake.partner(id),
  };
});

import { startMongo, stopMongo, clearMongo } from "./helpers/mongo";
import { MkFake } from "./helpers/mk-fake";
import { baseCampaign, vatConfig } from "./helpers/fixtures";
import { invalidateAuth0Cache } from "@/lib/auth0-cache";
import { saveOrSubmitPreorder } from "@/lib/preorder-submit";
import { PreorderCampaign, type IPreorderCampaign } from "@/models/preorder-campaign";
import { PreorderSubmission } from "@/models/preorder-submission";
import { PreorderAccess } from "@/models/preorder-access";
import { MkCustomer } from "@/models/mk-customer";
import { PortalAgent } from "@/models/portal-agent";

import * as campaignStatusRoute from "@/app/api/agent/preorders/campaigns/[id]/status/route";
import * as submissionActionRoute from "@/app/api/agent/preorders/submissions/[id]/action/route";
import * as submissionRoute from "@/app/api/agent/preorders/submissions/[id]/route";
import * as accessRoute from "@/app/api/agent/preorders/access/route";
import * as runRoute from "@/app/api/agent/automation/run/route";
import * as customerSyncRoute from "@/app/api/agent/customers/sync/route";
import * as customerRoute from "@/app/api/agent/customers/[partnerMkId]/route";
import * as agentClientsRoute from "@/app/api/agent/portal-agents/[partnerMkId]/clients/route";

const WRITE = "w".repeat(64);
const READ = "r".repeat(64);
const ACTOR = { sub: "auth0|staff-1", name: "Maja Novak", email: "maja@t4a.test" };
const LABEL = "Maja Novak (T4A agent)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = { POST: (req: Request, ctx: any) => Promise<Response> };

async function post(mod: Mod, body: unknown, params: Record<string, string> = {}, token = WRITE) {
  const res = await mod.POST(
    new Request("http://admin.test/api/agent/x", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve(params) },
  );
  const text = await res.text();
  expect(res.headers.get("cache-control")).toBe("no-store");
  return { status: res.status, body: text ? JSON.parse(text) : null, text };
}

const partner = { mkId: "p1", name: "Surf Shop X", email: "shop@example.com", mk: new MkFake().partnerById };

async function makeCampaign(): Promise<IPreorderCampaign> {
  const c = baseCampaign();
  return PreorderCampaign.create({
    title: c.title, season: c.season, currency: c.currency, status: "open", partnerPricelist: c.partnerPricelist, rrpPricelist: c.rrpPricelist,
    tabs: c.tabs, markets: [], customerRules: [], priceBooks: [], vatOverrides: [], shareToken: "SECRET-share",
  });
}

// A submitted preorder; `register` decides whether its MK order got created.
async function submitted(campaign: IPreorderCampaign, register: boolean) {
  const mk: MkFake = h.fake;
  mk.mode = register ? "ok" : "fail";
  const r = await saveOrSubmitPreorder({
    campaignDoc: campaign, partner, quantities: { s1: 10 }, terms: {}, action: "submit", actor: { source: "customer" }, port: mk, vat: vatConfig,
  });
  expect(r.ok).toBe(true);
  mk.mode = "ok";
  const doc = await PreorderSubmission.findOne({ campaignId: campaign._id, partnerMkId: "p1" }).exec();
  return doc!;
}

// A directory record (models/mk-customer.ts requires the sync stamps).
const dir = (partnerMkId: string, name: string, extra: Record<string, unknown> = {}) =>
  MkCustomer.create({ partnerMkId, name, lastSeenInMk: new Date(), mkSyncedAt: new Date(), ...extra });

const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

beforeAll(async () => {
  process.env.AGENT_WRITE_TOKEN = WRITE;
  process.env.AGENT_READ_TOKEN = READ;
  await startMongo();
});
afterAll(async () => {
  delete process.env.AGENT_WRITE_TOKEN;
  delete process.env.AGENT_READ_TOKEN;
  vi.unstubAllGlobals();
  await stopMongo();
});
beforeEach(async () => {
  await clearMongo();
  invalidateAuth0Cache();
  h.fake = new MkFake();
  h.callMetakocka.mockReset();
  infoSpy.mockClear();
});

describe("write auth + actor (every POST route)", () => {
  const routes: [string, Mod][] = [
    ["campaign status", campaignStatusRoute],
    ["submission action", submissionActionRoute],
    ["access", accessRoute],
    ["automation run", runRoute],
    ["customer sync", customerSyncRoute],
    ["customer", customerRoute],
    ["agent clients", agentClientsRoute],
  ];

  it("the read token is refused (401) and AGENT_WRITE_TOKEN unset → 503", async () => {
    for (const [name, mod] of routes) {
      expect((await post(mod, { actor: ACTOR }, { id: "x", partnerMkId: "x" }, READ)).status, name).toBe(401);
      expect((await post(mod, { actor: ACTOR }, { id: "x", partnerMkId: "x" }, "nope")).status, name).toBe(401);
    }
    delete process.env.AGENT_WRITE_TOKEN;
    try {
      for (const [name, mod] of routes) {
        const r = await post(mod, { actor: ACTOR }, { id: "x", partnerMkId: "x" }, READ);
        expect(r.status, name).toBe(503);
        expect(r.text).not.toContain(READ);
      }
    } finally {
      process.env.AGENT_WRITE_TOKEN = WRITE;
    }
  });

  it("400 without a valid actor, before doing any work", async () => {
    const campaign = await makeCampaign();
    for (const [name, mod] of routes) {
      for (const body of [{}, { actor: null }, { actor: { sub: "x" } }, { actor: { name: "y" } }, { actor: { ...ACTOR, name: "" } }, { actor: { ...ACTOR, email: "not-an-email" } }, { actor: { ...ACTOR, sub: "  " } }, "not json", "[1]"]) {
        const r = await post(mod, body, { id: String(campaign._id), partnerMkId: "p1" });
        expect(r.status, `${name} ${JSON.stringify(body)}`).toBe(400);
        expect(r.body.error, name).toEqual(expect.any(String));
      }
    }
    expect((await PreorderCampaign.findById(campaign._id).lean())!.status).toBe("open");
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("the write token also works for GET (one token is enough), the read token still does", async () => {
    const campaign = await makeCampaign();
    const sub = await submitted(campaign, true);
    for (const token of [WRITE, READ]) {
      const res = await submissionRoute.GET(new Request("http://admin.test/x", { headers: { authorization: `Bearer ${token}` } }), {
        params: Promise.resolve({ id: String(sub._id) }),
      });
      expect(res.status).toBe(200);
    }
  });
});

describe("actor without an email", () => {
  it("is accepted (missing or empty) and recorded by name", async () => {
    const campaign = await makeCampaign();
    const sub = await submitted(campaign, true);
    for (const actor of [{ sub: "auth0|staff-2", name: "Ana Kos" }, { sub: "auth0|staff-2", name: "Ana Kos", email: "" }]) {
      const r = await post(campaignStatusRoute, { actor, status: "closed" }, { id: String(campaign._id) });
      expect(r.status, JSON.stringify(actor)).toBe(200);
    }
    const p = await post(submissionActionRoute, { actor: { sub: "auth0|staff-2", name: "Ana Kos" }, action: "publish-result" }, { id: String(sub._id) });
    expect(p.status).toBe(200);
    expect((await PreorderSubmission.findById(sub._id).lean())!.resultPublishedBy).toBe("Ana Kos (T4A agent)");
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("actor=auth0|staff-2"));
  });
});

describe("POST /api/agent/preorders/campaigns/:id/status", () => {
  it("changes status + deadline via the builder's own logic and logs the write", async () => {
    const campaign = await makeCampaign();
    const r = await post(campaignStatusRoute, { actor: ACTOR, status: "closed", deadline: "2027-02-15T00:00:00.000Z" }, { id: String(campaign._id) });
    expect(r.status).toBe(200);
    expect(r.body.campaign).toMatchObject({ id: String(campaign._id), status: "closed", deadline: "2027-02-15T00:00:00.000Z" });
    expect(r.text).not.toContain("SECRET-share");
    const doc = await PreorderCampaign.findById(campaign._id).lean();
    expect(doc!.status).toBe("closed");
    expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`\\[agent-write\\] POST .* target=${campaign._id} actor=auth0\\|staff-1 status=200`)));

    // deadline omitted = unchanged; null clears it
    await post(campaignStatusRoute, { actor: ACTOR, status: "open" }, { id: String(campaign._id) });
    expect((await PreorderCampaign.findById(campaign._id).lean())!.deadline?.toISOString()).toBe("2027-02-15T00:00:00.000Z");
    await post(campaignStatusRoute, { actor: ACTOR, status: "open", deadline: null }, { id: String(campaign._id) });
    expect((await PreorderCampaign.findById(campaign._id).lean())!.deadline).toBeNull();
  });

  it("400 on a bad status / deadline, 404 on an unknown campaign", async () => {
    const campaign = await makeCampaign();
    expect((await post(campaignStatusRoute, { actor: ACTOR, status: "archived" }, { id: String(campaign._id) })).status).toBe(400);
    const bad = await post(campaignStatusRoute, { actor: ACTOR, status: "open", deadline: "soon" }, { id: String(campaign._id) });
    expect(bad.status).toBe(400);
    expect(bad.body.details).toEqual([expect.stringContaining("deadline")]);
    expect((await post(campaignStatusRoute, { actor: ACTOR, status: "open" }, { id: String(new Types.ObjectId()) })).status).toBe(404);
    expect((await post(campaignStatusRoute, { actor: ACTOR, status: "open" }, { id: "nope" })).status).toBe(404);
  });
});

describe("POST /api/agent/preorders/submissions/:id/action", () => {
  it("create-mk-order registers the MK order (actor in createdBy) and returns the GET shape", async () => {
    const campaign = await makeCampaign();
    const sub = await submitted(campaign, false);
    expect(sub.mkOrder?.state).toBe("failed");
    const r = await post(submissionActionRoute, { actor: ACTOR, action: "create-mk-order" }, { id: String(sub._id) });
    expect(r.status).toBe(200);
    const get = await submissionRoute.GET(new Request("http://admin.test/x", { headers: { authorization: `Bearer ${READ}` } }), {
      params: Promise.resolve({ id: String(sub._id) }),
    });
    // Same shape as the GET (mkOrderLastSeen / updatedAt are refreshed in the
    // background after the live MK read, so compare the stable parts).
    const g = await get.json();
    expect(Object.keys(r.body).sort()).toEqual(Object.keys(g).sort());
    expect({ ...r.body, mkOrderLastSeen: null, updatedAt: null }).toMatchObject({ id: g.id, status: g.status, mkOrder: g.mkOrder, mkSalesOrder: g.mkSalesOrder, lines: g.lines });
    expect(r.body.mkOrder.state).toBe("created");
    const doc = await PreorderSubmission.findById(sub._id).lean();
    expect(doc!.mkSalesOrder?.createdBy).toBe(LABEL);
    // A second call does not create a second order.
    const again = await post(submissionActionRoute, { actor: ACTOR, action: "create-mk-order" }, { id: String(sub._id) });
    expect(again.status).toBe(409);
    expect(h.fake.orders.size).toBe(1);
  });

  it("create-mk-order: 502 when Metakocka fails", async () => {
    const campaign = await makeCampaign();
    const sub = await submitted(campaign, false);
    h.fake.mode = "fail";
    const r = await post(submissionActionRoute, { actor: ACTOR, action: "create-mk-order" }, { id: String(sub._id) });
    expect(r.status).toBe(502);
    expect(r.body.error).toContain("bad product");
  });

  it("publish-result / unpublish-result record the actor and flip the flag", async () => {
    const campaign = await makeCampaign();
    const sub = await submitted(campaign, true);
    const p = await post(submissionActionRoute, { actor: ACTOR, action: "publish-result" }, { id: String(sub._id) });
    expect(p.status).toBe(200);
    expect(p.body.published).toBe(true);
    let doc = await PreorderSubmission.findById(sub._id).lean();
    expect(doc!.resultPublishedBy).toBe(LABEL);
    const u = await post(submissionActionRoute, { actor: ACTOR, action: "unpublish-result" }, { id: String(sub._id) });
    expect(u.status).toBe(200);
    doc = await PreorderSubmission.findById(sub._id).lean();
    expect(doc!.resultPublishedToCustomer).toBe(false);
  });

  it("publish-result without an order → 409 (the lib's refusal)", async () => {
    const campaign = await makeCampaign();
    const sub = await submitted(campaign, false);
    const r = await post(submissionActionRoute, { actor: ACTOR, action: "publish-result" }, { id: String(sub._id) });
    expect(r.status).toBe(409);
  });

  it("unlock detaches the MK order (not deleted in MK), records actor + note, clears the request", async () => {
    const campaign = await makeCampaign();
    const sub = await submitted(campaign, true);
    await PreorderSubmission.updateOne({ _id: sub._id }, { $set: { unlockRequestNote: "wrong sizes", unlockRequestedAt: new Date() } });
    const mkId = sub.mkSalesOrder!.mkId;
    const r = await post(submissionActionRoute, { actor: ACTOR, action: "unlock", note: "customer asked by phone" }, { id: String(sub._id) });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("draft");
    const doc = await PreorderSubmission.findById(sub._id).lean();
    expect(doc!.status).toBe("draft");
    expect(doc!.mkSalesOrder).toBeNull();
    expect(doc!.unlockRequestedAt).toBeNull();
    expect(doc!.mkSalesOrderHistory?.[0]).toMatchObject({ mkId, detachedBy: LABEL, deletedInMk: false, reason: "customer asked by phone" });
    expect(h.fake.orders.has(mkId)).toBe(true);
    // A draft cannot be unlocked again.
    expect((await post(submissionActionRoute, { actor: ACTOR, action: "unlock" }, { id: String(sub._id) })).status).toBe(409);
  });

  it("dismiss-unlock-request clears the request; 409 when there is none", async () => {
    const campaign = await makeCampaign();
    const sub = await submitted(campaign, true);
    expect((await post(submissionActionRoute, { actor: ACTOR, action: "dismiss-unlock-request" }, { id: String(sub._id) })).status).toBe(409);
    await PreorderSubmission.updateOne({ _id: sub._id }, { $set: { unlockRequestNote: "pls", unlockRequestedAt: new Date() } });
    const r = await post(submissionActionRoute, { actor: ACTOR, action: "dismiss-unlock-request" }, { id: String(sub._id) });
    expect(r.status).toBe(200);
    const doc = await PreorderSubmission.findById(sub._id).lean();
    expect(doc!.unlockRequestedAt).toBeNull();
    expect(doc!.status).toBe("submitted");
  });

  it("400 for unknown / destructive actions and misplaced fields, 404 for an unknown submission", async () => {
    const campaign = await makeCampaign();
    const sub = await submitted(campaign, true);
    for (const action of ["delete", "confirm", "close", "", undefined]) {
      expect((await post(submissionActionRoute, { actor: ACTOR, action }, { id: String(sub._id) })).status, String(action)).toBe(400);
    }
    expect((await post(submissionActionRoute, { actor: ACTOR, action: "publish-result", note: "x" }, { id: String(sub._id) })).status).toBe(400);
    expect((await post(submissionActionRoute, { actor: ACTOR, action: "unlock", reprice: true }, { id: String(sub._id) })).status).toBe(400);
    expect((await post(submissionActionRoute, { actor: ACTOR, action: "unlock" }, { id: String(new Types.ObjectId()) })).status).toBe(404);
    expect(await PreorderSubmission.countDocuments()).toBe(1);
  });
});

describe("POST /api/agent/preorders/access", () => {
  it("grants (idempotent) and revokes; revoke refused once there is a preorder", async () => {
    const campaign = await makeCampaign();
    await dir("p9", "Nine Surf", { emails: ["nine@example.com"] });
    const g = await post(accessRoute, { actor: ACTOR, campaignId: String(campaign._id), partnerMkId: "p9", grant: true });
    expect(g.status).toBe(200);
    expect(g.body).toEqual({ campaignId: String(campaign._id), partnerMkId: "p9", access: true });
    await post(accessRoute, { actor: ACTOR, campaignId: String(campaign._id), partnerMkId: "p9", grant: true });
    expect(await PreorderAccess.countDocuments({ partnerMkId: "p9" })).toBe(1);
    expect((await PreorderAccess.findOne({ partnerMkId: "p9" }).lean())!.partnerName).toBe("Nine Surf");

    const rv = await post(accessRoute, { actor: ACTOR, campaignId: String(campaign._id), partnerMkId: "p9", grant: false });
    expect(rv.body.access).toBe(false);
    expect(await PreorderAccess.countDocuments({ partnerMkId: "p9" })).toBe(0);

    await submitted(campaign, true); // p1 has a preorder
    expect((await post(accessRoute, { actor: ACTOR, campaignId: String(campaign._id), partnerMkId: "p1", grant: false })).status).toBe(409);
  });

  it("400 on a bad body, 404 on an unknown campaign", async () => {
    expect((await post(accessRoute, { actor: ACTOR, campaignId: "x", partnerMkId: "p1" })).status).toBe(400);
    expect((await post(accessRoute, { actor: ACTOR, campaignId: String(new Types.ObjectId()), partnerMkId: "p1", grant: true })).status).toBe(404);
  });
});

describe("POST /api/agent/automation/run", () => {
  it("POSTs to mk-automation's run trigger and passes its JSON through", async () => {
    process.env.MK_API_BASE = "http://mk.test";
    process.env.MK_API_TOKEN = "mk-secret";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ started: true, runId: "r1", apiKey: "leak" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await post(runRoute, { actor: ACTOR, type: "pricelists", dryRun: true });
      expect(r.status).toBe(202);
      expect(r.body).toEqual({ started: true, runId: "r1" });
      expect(fetchMock).toHaveBeenCalledWith("http://mk.test/api/v1/pricelists/sync?dryRun=true", expect.objectContaining({ method: "POST" }));
      expect(r.text).not.toContain("mk-secret");

      fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: "already running" }), { status: 409 }));
      expect((await post(runRoute, { actor: ACTOR, type: "warehouse" })).status).toBe(409);
      fetchMock.mockImplementationOnce(async () => new Response("boom", { status: 500 }));
      expect((await post(runRoute, { actor: ACTOR, type: "warehouse" })).status).toBe(502);

      expect((await post(runRoute, { actor: ACTOR, type: "everything" })).status).toBe(400);
      expect((await post(runRoute, { actor: ACTOR, type: "warehouse", dryRun: true })).status).toBe(400);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.MK_API_BASE;
      delete process.env.MK_API_TOKEN;
    }
  });

  it("502 when mk-automation is not configured", async () => {
    expect((await post(runRoute, { actor: ACTOR, type: "products" })).status).toBe(502);
  });
});

describe("POST /api/agent/customers/sync", () => {
  it("starts the directory sync (202), 409 while one is running", async () => {
    h.callMetakocka.mockResolvedValue({ ok: true, status: 200, data: { partner_list: [{ mk_id: "p5", name: "Five" }] } });
    const r = await post(customerSyncRoute, { actor: ACTOR });
    expect(r.status).toBe(202);
    expect(r.body.started).toBe(true);
    expect((await post(customerSyncRoute, { actor: ACTOR })).status).toBe(409);
    // let the background pull finish before Mongo is cleared
    for (let i = 0; i < 100 && global._mkCustomerSync?.running; i++) await new Promise((res) => setTimeout(res, 20));
    expect(h.callMetakocka).toHaveBeenCalledWith("get_partner", { partner_name: "" }, expect.anything());
  });
});

describe("POST /api/agent/customers/:partnerMkId", () => {
  it("sets / clears the manual country", async () => {
    await dir("p7", "Seven");
    const r = await post(customerRoute, { actor: ACTOR, countryIso: "hr" }, { partnerMkId: "p7" });
    expect(r.status).toBe(200);
    expect((await MkCustomer.findOne({ partnerMkId: "p7" }).lean())!.countryIsoManual).toBe("HR");
    await post(customerRoute, { actor: ACTOR, countryIso: null }, { partnerMkId: "p7" });
    expect((await MkCustomer.findOne({ partnerMkId: "p7" }).lean())!.countryIsoManual ?? null).toBeNull();
  });

  it("400 on a bad / missing country, 404 when not in the directory", async () => {
    await dir("p7", "Seven");
    expect((await post(customerRoute, { actor: ACTOR }, { partnerMkId: "p7" })).status).toBe(400);
    expect((await post(customerRoute, { actor: ACTOR, countryIso: "Croatia" }, { partnerMkId: "p7" })).status).toBe(400);
    expect((await post(customerRoute, { actor: ACTOR, countryIso: "HR" }, { partnerMkId: "nope" })).status).toBe(404);
  });
});

describe("POST /api/agent/portal-agents/:partnerMkId/clients", () => {
  it("adds and removes clients, keeps the rest, records the actor", async () => {
    await dir("c2", "Client Two");
    await dir("c3", "Client Three");
    await PortalAgent.create({ partnerMkId: "a1", partnerName: "Agent One", clients: [{ partnerMkId: "c1", partnerName: "Client One", addedBy: "boss@t4a.test", addedAt: new Date() }] });
    const r = await post(agentClientsRoute, { actor: ACTOR, add: ["c2", "c3"], note: "new region" }, { partnerMkId: "a1" });
    expect(r.status).toBe(200);
    expect(r.body.agent.clients.map((c: { partnerMkId: string }) => c.partnerMkId)).toEqual(["c1", "c2", "c3"]);
    expect(r.body.agent).toMatchObject({ updatedBy: LABEL, note: "new region" });
    const c1 = r.body.agent.clients[0];
    const c2 = r.body.agent.clients[1];
    expect(c1.addedBy).toBe("boss@t4a.test");
    expect(c2).toMatchObject({ partnerName: "Client Two", addedBy: LABEL });

    const rm = await post(agentClientsRoute, { actor: ACTOR, remove: ["c1"] }, { partnerMkId: "a1" });
    expect(rm.body.agent.clients.map((c: { partnerMkId: string }) => c.partnerMkId)).toEqual(["c2", "c3"]);
    expect(rm.body.agent.note).toBe("new region");
  });

  it("400 for unknown customers / empty change, 404 for a non-agent", async () => {
    await PortalAgent.create({ partnerMkId: "a1", partnerName: "Agent One", clients: [] });
    const u = await post(agentClientsRoute, { actor: ACTOR, add: ["ghost"] }, { partnerMkId: "a1" });
    expect(u.status).toBe(400);
    expect(u.body.details).toEqual({ unknown: ["ghost"] });
    expect((await post(agentClientsRoute, { actor: ACTOR }, { partnerMkId: "a1" })).status).toBe(400);
    expect((await post(agentClientsRoute, { actor: ACTOR, add: [1] }, { partnerMkId: "a1" })).status).toBe(400);
    expect((await post(agentClientsRoute, { actor: ACTOR, add: [] }, { partnerMkId: "zz" })).status).toBe(404);
  });
});
