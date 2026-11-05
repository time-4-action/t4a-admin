// The agent API's read models against seeded Mongo data (mongodb-memory-server)
// and mocked upstreams (Auth0 management, partner portal, mk-automation).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

const mocks = vi.hoisted(() => ({
  listAllUsers: vi.fn(),
  getDevUserIds: vi.fn(),
  callMkAutomation: vi.fn(),
  callPartnerPortal: vi.fn(),
  getUsersWithRole: vi.fn(),
  getRoleUser: vi.fn(),
}));
vi.mock("@/lib/auth0-mgmt", () => ({ listAllUsers: mocks.listAllUsers, listAllRoles: vi.fn(), listUsersInRole: vi.fn() }));
vi.mock("@/lib/dev-users", () => ({ getDevUserIds: mocks.getDevUserIds }));
vi.mock("@/lib/mk-api", () => ({ callMkAutomation: mocks.callMkAutomation }));
vi.mock("@/lib/partner-api", () => ({ callPartnerPortal: mocks.callPartnerPortal }));
vi.mock("@/lib/role-users", () => ({ getUsersWithRole: mocks.getUsersWithRole, getRoleUser: mocks.getRoleUser }));

import { startMongo, stopMongo, clearMongo } from "./helpers/mongo";
import { baseCampaign } from "./helpers/fixtures";
import { PreorderCampaign } from "@/models/preorder-campaign";
import { PreorderSubmission } from "@/models/preorder-submission";
import { PreorderAccess } from "@/models/preorder-access";
import { MkCustomer } from "@/models/mk-customer";
import { PortalAgent } from "@/models/portal-agent";
import { UserUsage } from "@/models/user-usage";
import { UserLimit } from "@/models/user-limit";
import { Conversation } from "@/models/conversation";
import { BuilderPreset } from "@/models/builder-preset";

import * as campaignsRoute from "@/app/api/agent/preorders/campaigns/route";
import * as campaignRoute from "@/app/api/agent/preorders/campaigns/[id]/route";
import * as submissionsRoute from "@/app/api/agent/preorders/submissions/route";
import * as submissionRoute from "@/app/api/agent/preorders/submissions/[id]/route";
import * as customersRoute from "@/app/api/agent/customers/route";
import * as portalAgentsRoute from "@/app/api/agent/portal-agents/route";
import * as aiUsageRoute from "@/app/api/agent/ai-usage/route";
import * as automationRoute from "@/app/api/agent/automation/route";
import * as partnersRoute from "@/app/api/agent/partners/route";
import * as partnerRoute from "@/app/api/agent/partners/[sub]/route";
import * as presetsRoute from "@/app/api/agent/builder-presets/route";

const TOKEN = "t".repeat(64);
const SHARE_TOKEN = "SECRET-share-token-do-not-leak";

// Route handlers type their own `params`; the tests pass whichever one applies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = { GET: (req: Request, ctx: any) => Promise<Response> };

async function call(mod: Handler, url: string, params: Record<string, string> = {}) {
  const res = await mod.GET(new Request(`http://admin.test${url}`, { headers: { authorization: `Bearer ${TOKEN}` } }), {
    params: Promise.resolve(params),
  });
  const text = await res.text();
  expect(res.headers.get("cache-control")).toBe("no-store");
  return { status: res.status, body: JSON.parse(text), text };
}

beforeAll(async () => {
  process.env.AGENT_READ_TOKEN = TOKEN;
  await startMongo();
});
afterAll(async () => {
  delete process.env.AGENT_READ_TOKEN;
  await stopMongo();
});
beforeEach(async () => {
  await clearMongo();
  vi.clearAllMocks();
});

function snapshot(net: number) {
  return {
    resolvedAt: new Date(),
    countryIso: "SI",
    market: { id: "m1", name: "Slovenia" },
    marketSource: "country",
    partnerPricelist: "Partner",
    currency: "EUR",
    sources: { pricelist: "campaign", currency: "campaign", deadline: "campaign", note: "campaign", minOrderAmount: "campaign", tiers: {} },
    tabs: [{ tabId: "tab-sails", tabName: "Sails", tiers: [{ id: "t1", name: "Silver", minAmount: 1000, discountPct: 5 }] }],
    lines: [
      {
        rowId: "s1", code: "SKU-s1", name: "Product s1", variantLabel: "5.3", tabId: "tab-sails", tabName: "Sails", groupId: "grp-a", groupName: "Sail A",
        qty: 2, unitPrice: net / 2, rrp: 200, partnerPrice: net / 2, priceSource: "sheet", tierPct: 0, unitNet: net / 2, unitVat: 0, unitGross: net / 2, lineNet: net, lineVat: 0, lineGross: net,
      },
    ],
    pricing: { kind: "business", basis: "partner", countryIso: "SI", vatRate: 0, vatSource: "zero-rated", totals: { net, vat: 0, gross: net } },
  };
}

async function seedPreorders() {
  const c = baseCampaign();
  const open = await PreorderCampaign.create({
    title: "Season 27", season: "SS27", currency: "EUR", status: "open", deadline: new Date("2027-01-31"), rrpPricelist: "RRP", partnerPricelist: "Partner",
    tabs: c.tabs, shareToken: SHARE_TOKEN,
    markets: [{ id: "m1", name: "Slovenia", color: "emerald", countries: ["SI"], kinds: [], config: { currency: "EUR" } }],
    customerRules: [{ partnerMkId: "p2", partnerName: "Beta d.o.o.", marketId: "m1", config: { minOrderAmount: 500 }, note: "VIP" }],
    vatOverrides: [{ iso: "SI", rate: 22 }],
  });
  const draftCampaign = await PreorderCampaign.create({ title: "Old draft", currency: "EUR", status: "draft", tabs: [], shareToken: "another-secret" });
  const base = { campaignId: open._id, status: "submitted" as const };
  const s1 = await PreorderSubmission.create({
    ...base, partnerMkId: "p1", partnerName: "Alpha Surf", partnerEmail: "alpha@example.com", lines: [{ rowId: "s1", code: "SKU-s1", qty: 2 }],
    totals: { qty: 2, amount: 200, discount: 0 }, submittedAt: new Date("2026-10-01"), submitSource: "customer",
    snapshot: snapshot(200) as never, mkSalesOrder: { mkId: "mk-1", countCode: "PP-1" }, mkOrder: { state: "created", buyerOrder: "T4Ax.1", attempts: 1 }, resultPublishedToCustomer: true,
  });
  await PreorderSubmission.create({
    ...base, status: "confirmed", partnerMkId: "p2", partnerName: "Beta d.o.o.", partnerEmail: "beta@example.com", lines: [{ rowId: "s1", code: "SKU-s1", qty: 3 }],
    totals: { qty: 3, amount: 300, discount: 15 }, submittedAt: new Date("2026-10-02"), snapshot: snapshot(285) as never,
    mkOrder: { state: "failed", attempts: 2, lastError: "MK down" },
  });
  await PreorderSubmission.create({
    ...base, status: "draft", partnerMkId: "p3", partnerName: "Gamma", lines: [{ rowId: "m1", code: "SKU-m1", qty: 4 }], totals: { qty: 4, amount: 200, discount: 0 },
  });
  await PreorderAccess.create({ campaignId: open._id, partnerMkId: "p4", partnerName: "Delta", grantedAt: new Date() });
  return { open, draftCampaign, s1 };
}

describe("GET /api/agent/preorders/campaigns", () => {
  it("lists campaigns with counts and totalNet, never the shareToken", async () => {
    const { open } = await seedPreorders();
    const { status, body, text } = await call(campaignsRoute, "/api/agent/preorders/campaigns");
    expect(status).toBe(200);
    expect(body.total).toBe(2);
    expect(text).not.toContain(SHARE_TOKEN);
    expect(text).not.toContain("another-secret");
    expect(text).not.toContain("shareToken");
    const item = body.items.find((i: { id: string }) => i.id === String(open._id));
    expect(item).toMatchObject({
      title: "Season 27", season: "SS27", status: "open", currency: "EUR", deadline: "2027-01-31T00:00:00.000Z",
      rrpPricelist: "RRP", partnerPricelist: "Partner", marketCount: 1, customerRuleCount: 1, rowCount: 4,
      counts: { draft: 1, submitted: 1, confirmed: 1, closed: 0, mkCreated: 1, mkFailed: 1, published: 1 },
      totalNet: 485, // 200 + (300 − 15); the draft is not counted
    });
  });

  it("filters by status and pages", async () => {
    await seedPreorders();
    const drafts = await call(campaignsRoute, "/api/agent/preorders/campaigns?status=draft");
    expect(drafts.body.total).toBe(1);
    expect(drafts.body.items[0].title).toBe("Old draft");
    const page = await call(campaignsRoute, "/api/agent/preorders/campaigns?limit=1&skip=1");
    expect(page.body.total).toBe(2);
    expect(page.body.items).toHaveLength(1);
  });
});

describe("GET /api/agent/preorders/campaigns/:id", () => {
  it("returns campaign, tabs, markets, rules and VAT overrides", async () => {
    const { open } = await seedPreorders();
    const { status, body, text } = await call(campaignRoute, `/api/agent/preorders/campaigns/${open._id}`, { id: String(open._id) });
    expect(status).toBe(200);
    expect(text).not.toContain(SHARE_TOKEN);
    expect(body.campaign.id).toBe(String(open._id));
    expect(body.tabs).toEqual([
      { id: "tab-sails", name: "Sails", groupCount: 2, rowCount: 3, tiers: [{ name: "Silver", minAmount: 1000, discountPct: 5 }, { name: "Gold", minAmount: 5000, discountPct: 10 }] },
      { id: "tab-masts", name: "Masts", groupCount: 1, rowCount: 1, tiers: [] },
    ]);
    expect(body.markets).toEqual([{ id: "m1", name: "Slovenia", countries: ["SI"], kinds: [], config: { currency: "EUR" } }]);
    expect(body.customerRules[0]).toMatchObject({ partnerMkId: "p2", partnerName: "Beta d.o.o.", marketId: "m1", countryIso: null, config: { minOrderAmount: 500 }, note: "VIP" });
    expect(body.vatOverrides).toEqual([{ iso: "SI", rate: 22 }]);
  });

  it("404 {error} for an unknown or invalid id", async () => {
    const a = await call(campaignRoute, "/x", { id: String(new Types.ObjectId()) });
    expect(a.status).toBe(404);
    expect(a.body).toEqual({ error: expect.any(String) });
    expect((await call(campaignRoute, "/x", { id: "nope" })).status).toBe(404);
  });
});

describe("GET /api/agent/preorders/submissions", () => {
  it("lists newest first with MK state and publication", async () => {
    const { open } = await seedPreorders();
    const { body } = await call(submissionsRoute, "/api/agent/preorders/submissions");
    expect(body.total).toBe(3);
    expect(body.items.map((i: { partnerMkId: string }) => i.partnerMkId)).toEqual(["p2", "p1", "p3"]);
    const alpha = body.items.find((i: { partnerMkId: string }) => i.partnerMkId === "p1");
    expect(alpha).toMatchObject({
      campaignId: String(open._id), campaignTitle: "Season 27", partnerName: "Alpha Surf", partnerEmail: "alpha@example.com",
      status: "submitted", currency: "EUR", totals: { qty: 2, amount: 200, discount: 0, net: 200 }, submittedAt: "2026-10-01T00:00:00.000Z",
      submitSource: "customer", mkSalesOrder: { countCode: "PP-1", mkId: "mk-1" }, mkOrder: { state: "created", attempts: 1, lastError: null },
      published: true, unlockRequestedAt: null,
    });
    const beta = body.items.find((i: { partnerMkId: string }) => i.partnerMkId === "p2");
    expect(beta.mkSalesOrder).toBeNull();
    expect(beta.mkOrder).toEqual({ state: "failed", attempts: 2, lastError: "MK down" });
  });

  it("filters by campaignId, partnerMkId, q, status and mkState", async () => {
    const { open, draftCampaign } = await seedPreorders();
    const q = async (qs: string) => (await call(submissionsRoute, `/api/agent/preorders/submissions?${qs}`)).body;
    expect((await q(`campaignId=${open._id}`)).total).toBe(3);
    expect((await q(`campaignId=${draftCampaign._id}`)).total).toBe(0);
    expect((await q("campaignId=garbage")).total).toBe(0);
    expect((await q("partnerMkId=p2")).items[0].partnerName).toBe("Beta d.o.o.");
    expect((await q("q=BETA@")).items.map((i: { partnerMkId: string }) => i.partnerMkId)).toEqual(["p2"]);
    expect((await q("q=surf")).items.map((i: { partnerMkId: string }) => i.partnerMkId)).toEqual(["p1"]);
    expect((await q("status=draft")).items.map((i: { partnerMkId: string }) => i.partnerMkId)).toEqual(["p3"]);
    expect((await q("mkState=failed")).items.map((i: { partnerMkId: string }) => i.partnerMkId)).toEqual(["p2"]);
    expect((await q("mkState=none")).items.map((i: { partnerMkId: string }) => i.partnerMkId)).toEqual(["p3"]);
    expect((await q("limit=1&skip=1")).items).toHaveLength(1);
  });
});

describe("GET /api/agent/preorders/submissions/:id", () => {
  it("returns terms, snapshot lines and pricing", async () => {
    const { s1 } = await seedPreorders();
    const { status, body } = await call(submissionRoute, "/x", { id: String(s1._id) });
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: String(s1._id), partnerMkId: "p1", campaignTitle: "Season 27", status: "submitted" });
    expect(body.terms).toBeTypeOf("object");
    expect(body.lines).toEqual([
      expect.objectContaining({ code: "SKU-s1", name: "Product s1", variantLabel: "5.3", qty: 2, unitPrice: 100, partnerPrice: 100, rrp: 200, unitNet: 100, lineNet: 200 }),
    ]);
    expect(body.pricing).toMatchObject({ currency: "EUR", kind: "business", vatRate: 0, totals: { net: 200, vat: 0, gross: 200 } });
  });

  it("a draft without a snapshot is priced from the current sheet", async () => {
    await seedPreorders();
    const draft = await PreorderSubmission.findOne({ partnerMkId: "p3" }).exec();
    const { body } = await call(submissionRoute, "/x", { id: String(draft!._id) });
    expect(body.lines).toEqual([expect.objectContaining({ code: "SKU-m1", name: "Product m1", qty: 4, unitPrice: 50, lineNet: 200, priceSource: "current-sheet" })]);
    expect(body.pricing.source).toBe("none");
  });

  it("404 for an unknown id", async () => {
    expect((await call(submissionRoute, "/x", { id: String(new Types.ObjectId()) })).status).toBe(404);
  });
});

describe("GET /api/agent/customers and /portal-agents", () => {
  beforeEach(async () => {
    await seedPreorders();
    const now = new Date();
    const cust = (partnerMkId: string, name: string, extra: Record<string, unknown> = {}) => ({
      partnerMkId, name, emails: [`${partnerMkId}@example.com`], address: { city: "Ljubljana", countryRaw: "Slovenija" }, countryIso: "SI", countrySource: "mk",
      countryResolverVersion: 999, mkSyncedAt: now, lastSeenInMk: now, stale: false, ...extra,
    });
    for (const c of [
      cust("p1", "Alpha Surf", { taxId: "SI123", countCode: "K-1", phone: "+386 1" }),
      cust("p2", "Beta d.o.o."),
      cust("p9", "Zulu GmbH", { countryIso: "DE", address: { city: "Berlin", countryRaw: "Nemčija" } }),
    ]) {
      await MkCustomer.create(c as never);
    }
    await PortalAgent.create({ partnerMkId: "p1", partnerName: "Alpha Surf", clients: [{ partnerMkId: "p2", partnerName: "Beta d.o.o." }], note: "rep for Beta" });
  });

  it("joins agents and preorder activity, with the sync state", async () => {
    const { body } = await call(customersRoute, "/api/agent/customers");
    expect(body.total).toBe(3);
    expect(body.syncState).toEqual({ running: false, finishedAt: null, ok: null, count: 0 });
    const alpha = body.items.find((c: { partnerMkId: string }) => c.partnerMkId === "p1");
    expect(alpha).toMatchObject({
      countCode: "K-1", name: "Alpha Surf", emails: ["p1@example.com"], phone: "+386 1", taxId: "SI123", countryIso: "SI", kind: "business",
      isPortalAgent: true, agentClients: [{ partnerMkId: "p2", partnerName: "Beta d.o.o." }],
      address: { city: "Ljubljana", country: "Slovenija" },
    });
    expect(alpha.preorderActivity).toEqual([expect.objectContaining({ campaignTitle: "Season 27", status: "submitted", totalNet: 200, currency: "EUR" })]);
    const beta = body.items.find((c: { partnerMkId: string }) => c.partnerMkId === "p2");
    expect(beta).toMatchObject({ kind: "person", isPortalAgent: false, agentClients: [], servedByAgents: [{ partnerMkId: "p1", partnerName: "Alpha Surf" }] });
    expect(beta.preorderActivity[0]).toMatchObject({ status: "confirmed", totalNet: 285 });
  });

  it("filters by q and country, pages with skip", async () => {
    expect((await call(customersRoute, "/api/agent/customers?country=DE")).body.items.map((c: { name: string }) => c.name)).toEqual(["Zulu GmbH"]);
    expect((await call(customersRoute, "/api/agent/customers?q=beta")).body.total).toBe(1);
    const page = (await call(customersRoute, "/api/agent/customers?limit=1&skip=1")).body;
    expect(page.total).toBe(3);
    expect(page.items.map((c: { name: string }) => c.name)).toEqual(["Beta d.o.o."]);
  });

  it("lists portal agents", async () => {
    const { body } = await call(portalAgentsRoute, "/api/agent/portal-agents");
    expect(body).toEqual({
      total: 1,
      items: [{ partnerMkId: "p1", partnerName: "Alpha Surf", clients: [{ partnerMkId: "p2", partnerName: "Beta d.o.o." }], note: "rep for Beta", updatedAt: expect.any(String) }],
    });
  });
});

describe("GET /api/agent/ai-usage", () => {
  beforeEach(async () => {
    mocks.getDevUserIds.mockResolvedValue(new Set(["dev|1"]));
    mocks.listAllUsers.mockResolvedValue([
      { user_id: "u|1", email: "ana@example.com", name: "Ana" },
      { user_id: "u|2", email: "bor@example.com", name: "Bor" },
      { user_id: "dev|1", email: "dev@example.com", name: "Dev" },
    ]);
    await UserUsage.create([
      { userId: "u|1", modelId: "claude-a", inputTokens: 100, outputTokens: 10, conversationCount: 2, totalCostUsd: 1.5 },
      { userId: "u|1", modelId: "claude-b", inputTokens: 50, outputTokens: 5, conversationCount: 1, totalCostUsd: 0.5 },
      { userId: "u|2", modelId: "claude-a", inputTokens: 10, outputTokens: 1, conversationCount: 1, totalCostUsd: 0.25 },
      { userId: "dev|1", modelId: "claude-a", inputTokens: 9999, outputTokens: 9999, conversationCount: 99, totalCostUsd: 99 },
    ]);
    await UserLimit.create({ userId: "u|1", limitUsd: 20, period: "monthly", currentSpendUsd: 2 });
    await Conversation.create([{ userId: "u|1" }, { userId: "u|2" }]);
  });

  it("totals, by model and by user without dev users", async () => {
    const { body } = await call(aiUsageRoute, "/api/agent/ai-usage");
    expect(body.totals).toMatchObject({ costUsd: 2.25, inputTokens: 160, outputTokens: 16, conversations: 4 });
    expect(body.byModel.map((m: { modelId: string; costUsd: number }) => [m.modelId, m.costUsd])).toEqual([["claude-a", 1.75], ["claude-b", 0.5]]);
    expect(body.byUser).toEqual([
      expect.objectContaining({ userId: "u|1", email: "ana@example.com", name: "Ana", costUsd: 2, conversations: 3, limit: expect.objectContaining({ limitUsd: 20, period: "monthly", currentSpendUsd: 2 }) }),
      expect.objectContaining({ userId: "u|2", email: "bor@example.com", costUsd: 0.25, limit: null }),
    ]);
    expect(JSON.stringify(body)).not.toContain("dev|1");
    expect(body.conversationsToday).toBe(2);
  });

  it("scopes to one user", async () => {
    const { body } = await call(aiUsageRoute, "/api/agent/ai-usage?userId=u%7C2");
    expect(body.totals.costUsd).toBe(0.25);
    expect(body.byUser.map((u: { userId: string }) => u.userId)).toEqual(["u|2"]);
    expect(body.conversationsToday).toBe(1);
  });
});

describe("GET /api/agent/automation", () => {
  it("passes status + last 20 runs through", async () => {
    mocks.callMkAutomation.mockImplementation(async (p: string) =>
      p === "/api/v1/status"
        ? { ok: true, status: 200, data: { warehouse: { running: false, cron: "0 * * * *" } } }
        : { ok: true, status: 200, data: [{ id: 1, type: "warehouse", status: "ok" }] },
    );
    const { status, body } = await call(automationRoute, "/api/agent/automation");
    expect(status).toBe(200);
    expect(body).toEqual({ status: { warehouse: { running: false, cron: "0 * * * *" } }, runs: [{ id: 1, type: "warehouse", status: "ok" }] });
    expect(mocks.callMkAutomation).toHaveBeenCalledWith("/api/v1/runs?limit=20");
  });

  it("502 {error} when the service fails or is not configured", async () => {
    mocks.callMkAutomation.mockResolvedValue({ ok: false, status: 502, error: "unreachable" });
    const a = await call(automationRoute, "/api/agent/automation");
    expect(a.status).toBe(502);
    expect(a.body).toEqual({ error: expect.stringContaining("unreachable") });
    mocks.callMkAutomation.mockRejectedValue(new Error("MK_API_BASE not configured"));
    expect((await call(automationRoute, "/api/agent/automation")).status).toBe(502);
  });
});

describe("GET /api/agent/partners", () => {
  it("joins Auth0 partners with the portal overview and adds the sync status", async () => {
    mocks.getUsersWithRole.mockResolvedValue([{ id: "auth0|a", name: "Ana", email: "ana@example.com" }, { id: "auth0|b", name: "Bor", email: "bor@example.com" }]);
    mocks.callPartnerPortal.mockImplementation(async (p: string) => {
      if (p.startsWith("/api/admin/partners/overview")) return { ok: true, status: 200, data: { partners: [{ ownerSub: "auth0|a", loginCount: 7, accessTokenEnc: "leak" }] } };
      if (p === "/api/admin/system/sync") return { ok: true, status: 200, data: { pnv: { running: false }, feedAuthToken: "leak" } };
      throw new Error(`unexpected ${p}`);
    });
    const { body, text } = await call(partnersRoute, "/api/agent/partners");
    expect(body.total).toBe(2);
    expect(body.items[0]).toMatchObject({ sub: "auth0|a", name: "Ana", email: "ana@example.com", loginCount: 7 });
    expect(body.items[1]).toMatchObject({ sub: "auth0|b", loginCount: 0 });
    expect(body.sync).toEqual({ pnv: { running: false } });
    expect(body.portalReachable).toBe(true);
    expect(text).not.toContain("leak");
  });

  it("one partner: portal detail + activity + identity; 404 passes through", async () => {
    mocks.getRoleUser.mockResolvedValue({ id: "auth0|a", name: "Ana", email: "ana@example.com" });
    mocks.callPartnerPortal.mockImplementation(async (p: string) => {
      if (p === "/api/admin/partners/auth0%7Ca") return { ok: true, status: 200, data: { partner: { ownerSub: "auth0|a", loginCount: 7, connections: [] } } };
      if (p === "/api/admin/partners/auth0%7Ca/activity?limit=100") return { ok: true, status: 200, data: { events: [{ eventType: "login" }] } };
      return { ok: false, status: 404, error: "not found" };
    });
    const { status, body } = await call(partnerRoute, "/x", { sub: "auth0%7Ca" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ sub: "auth0|a", name: "Ana", email: "ana@example.com", partner: { loginCount: 7 }, activity: { events: [{ eventType: "login" }] } });
    expect((await call(partnerRoute, "/x", { sub: "auth0|zzz" })).status).toBe(404);
  });
});

describe("GET /api/agent/builder-presets", () => {
  it("returns configs with parsed ratings, without notes / history", async () => {
    const actor = { id: "auth0|x", name: "X", email: "x@example.com" };
    await BuilderPreset.create({
      userId: "auth0|x", builder: "radar-chart", name: "4Wave 2027", updatedBy: actor,
      notes: [{ author: actor, text: "internal note" }],
      config: { mode: "compare", axes: ["Lowend", "Highend", "Control"], values: [1, 2, 3], datasets: [{ name: "4Wave FLOW HD", values: [90, 70, 80] }, { name: "4Wave FLASH HD", values: [60, 100, 75] }] },
    });
    await BuilderPreset.create({
      userId: "auth0|x", builder: "range-bars", name: "Feel 2027", updatedBy: actor,
      config: {
        mode: "compare",
        bars: [
          { mode: "two", title: "Power delivery", left: "Direct", right: "Smooth", min: 20, max: 60 },
          { mode: "scale", title: "Rider level", scale: "Entry,Intermediate,Pro", min: 30, max: 90, marker: true, value: 70 },
        ],
        models: [{ name: "4Wave FLOW HD", bands: [{ min: 25, max: 62 }, { min: 45, max: 80 }] }],
      },
    });

    const all = (await call(presetsRoute, "/api/agent/builder-presets")).body;
    expect(all.total).toBe(2);
    expect(JSON.stringify(all)).not.toContain("internal note");
    expect(JSON.stringify(all)).not.toContain("x@example.com");

    const radar = (await call(presetsRoute, "/api/agent/builder-presets?builder=radar-chart")).body;
    expect(radar.total).toBe(1);
    expect(radar.items[0]).toMatchObject({ builder: "radar-chart", name: "4Wave 2027", config: expect.any(Object), updatedAt: expect.any(String) });
    expect(radar.items[0].ratings).toEqual([
      { product: "4Wave FLOW HD", axes: { Lowend: 90, Highend: 70, Control: 80 } },
      { product: "4Wave FLASH HD", axes: { Lowend: 60, Highend: 100, Control: 75 } },
    ]);

    const bars = (await call(presetsRoute, "/api/agent/builder-presets?builder=range-bars")).body;
    expect(bars.items[0].ratings).toEqual([
      {
        label: "4Wave FLOW HD",
        bars: [
          { title: "Power delivery", kind: "two", left: "Direct", right: "Smooth", scale: null, min: 25, max: 62, value: null },
          { title: "Rider level", kind: "scale", left: null, right: null, scale: ["Entry", "Intermediate", "Pro"], min: 45, max: 80, value: 70 },
        ],
      },
    ]);
    expect((await call(presetsRoute, "/api/agent/builder-presets?builder=nope")).body).toEqual({ total: 0, items: [] });
  });
});
