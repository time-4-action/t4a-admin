// The agent bridge (GET/POST /api/agent/admin, lib/agent-bridge.ts): the agent runs the
// admin pages' own API handlers as the staff member who asked, with that person's
// Auth0 roles (faked here), against seeded Mongo.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { startMongo, stopMongo, clearMongo } from "./helpers/mongo";
import { baseCampaign } from "./helpers/fixtures";
import { invalidateAuth0Cache } from "@/lib/auth0-cache";
import { setAgentIdentityLookupForTests } from "@/lib/agent-identity";
import { auth0 } from "@/lib/auth";
import { PreorderCampaign } from "@/models/preorder-campaign";
import { getVatSettings } from "@/lib/vat-settings";
import * as bridge from "@/app/api/agent/admin/route";

const WRITE = "w".repeat(64);
const READ = "r".repeat(64);
const ACTOR = { sub: "auth0|staff-1", name: "Maja Novak" };
const people: Record<string, { email: string | null; roles: string[] }> = {
  "auth0|staff-1": { email: "maja@t4a.test", roles: ["preorder-admin"] },
  "auth0|warranty": { email: "w@t4a.test", roles: ["warranty-admin"] },
  "auth0|customer": { email: "c@t4a.test", roles: [] },
};

async function call(body: unknown, token = WRITE) {
  const res = await bridge.POST(
    new Request("http://admin.test/api/agent/admin", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  expect(res.headers.get("cache-control")).toBe("no-store");
  return { status: res.status, body: await res.json() };
}

async function makeCampaign() {
  const c = baseCampaign();
  return PreorderCampaign.create({
    title: c.title, season: c.season, currency: c.currency, status: "open", partnerPricelist: c.partnerPricelist, rrpPricelist: c.rrpPricelist,
    tabs: c.tabs, markets: [], customerRules: [], priceBooks: [], vatOverrides: [], shareToken: "SECRET-share",
  });
}

vi.spyOn(console, "info").mockImplementation(() => undefined);

beforeAll(async () => {
  process.env.AGENT_WRITE_TOKEN = WRITE;
  process.env.AGENT_READ_TOKEN = READ;
  setAgentIdentityLookupForTests(async (sub) => people[sub] ?? null);
  await startMongo();
});
afterAll(async () => {
  delete process.env.AGENT_WRITE_TOKEN;
  delete process.env.AGENT_READ_TOKEN;
  await stopMongo();
});
beforeEach(async () => {
  await clearMongo();
  invalidateAuth0Cache();
});

describe("route list", () => {
  it("lib/agent-bridge-routes.generated.ts is up to date", () => {
    const root = path.resolve(__dirname, "..");
    expect(() => execFileSync("node", [path.join(root, "scripts/gen-agent-bridge.mjs"), "--check"], { cwd: root, stdio: "pipe" })).not.toThrow();
  });

  it("GET lists the admin APIs with their docs, never portal, agent or secret routes", async () => {
    const res = await bridge.GET(new Request("http://admin.test/api/agent/admin", { headers: { authorization: `Bearer ${READ}` } }), undefined);
    const cat = await res.json();
    const paths = (cat.routes as { path: string }[]).map((r) => r.path);
    expect(paths).toContain("/api/admin/preorder/campaigns/[id]");
    expect(paths).toContain("/api/warranty/submissions/[submissionId]");
    expect(paths.some((p) => p.startsWith("/api/portal") || p.startsWith("/api/agent"))).toBe(false);
    expect(paths).not.toContain("/api/admin/preorder/campaigns/[id]/invite");
    expect(paths).not.toContain("/api/admin/portal/impersonate");
    const campaign = cat.routes.find((r: { path: string }) => r.path === "/api/admin/preorder/campaigns/[id]");
    expect(campaign.section).toBe("preorder");
    expect(campaign.methods.PATCH).toMatch(/builder's save/);
  });
});

describe("guards", () => {
  it("changes need the write token; reads take the read token", async () => {
    const c = await makeCampaign();
    expect((await call({ actor: ACTOR, method: "PATCH", path: `/api/admin/preorder/campaigns/${c.id}`, body: { title: "x" } }, READ)).status).toBe(401);
    expect((await call({ actor: ACTOR, method: "GET", path: `/api/admin/preorder/campaigns/${c.id}` }, READ)).status).toBe(200);
    expect((await call({ actor: ACTOR, method: "GET", path: `/api/admin/preorder/campaigns/${c.id}` }, "nope")).status).toBe(401);
  });

  it("unknown routes, excluded routes, wrong methods and odd paths are refused", async () => {
    expect((await call({ actor: ACTOR, method: "GET", path: "/api/portal/preorder/campaigns" })).status).toBe(404);
    expect((await call({ actor: ACTOR, method: "GET", path: "/api/admin/preorder/campaigns/abc/invite" })).status).toBe(404);
    expect((await call({ actor: ACTOR, method: "GET", path: "/api/admin/preorder/campaigns/../../portal/x" })).status).toBe(404);
    expect((await call({ actor: ACTOR, method: "GET", path: "/api/admin/preorder/vat?x=1" })).status).toBe(400);
    expect((await call({ actor: ACTOR, method: "DELETE", path: "/api/admin/preorder/vat" })).status).toBe(405);
    expect((await call({ actor: ACTOR, method: "TRACE", path: "/api/admin/preorder/vat" })).status).toBe(400);
    expect((await call({ method: "GET", path: "/api/admin/preorder/vat" })).status).toBe(400);
  });

  it("the person's own Auth0 roles decide, per section", async () => {
    expect((await call({ actor: { sub: "auth0|warranty", name: "W" }, method: "GET", path: "/api/admin/preorder/vat" })).status).toBe(403);
    expect((await call({ actor: { sub: "auth0|customer", name: "C" }, method: "GET", path: "/api/admin/preorder/vat" })).status).toBe(403);
    expect((await call({ actor: { sub: "auth0|nobody", name: "N" }, method: "GET", path: "/api/admin/preorder/vat" })).status).toBe(403);
    expect((await call({ actor: ACTOR, method: "GET", path: "/api/admin/preorder/vat" })).status).toBe(200);
  });
});

describe("runs the page's own handler as the person", () => {
  it("PATCH a campaign's volume discount tiers, like the builder's save", async () => {
    const c = await makeCampaign();
    const got = await call({ actor: ACTOR, method: "GET", path: `/api/admin/preorder/campaigns/${c.id}` });
    expect(got.status).toBe(200);
    expect(JSON.stringify(got.body)).not.toContain("SECRET-share");
    const tabs = got.body.campaign.tabs;
    tabs[0].tiers = [{ id: "t2", name: "Gold", minAmount: 5000, discountPct: 12 }, { id: "t1", name: "Silver", minAmount: 1000, discountPct: 5 }];
    const saved = await call({ actor: ACTOR, method: "PATCH", path: `/api/admin/preorder/campaigns/${c.id}`, body: { tabs } });
    expect(saved.status).toBe(200);
    const doc = await PreorderCampaign.findById(c.id).lean();
    expect(JSON.parse(JSON.stringify(doc!.tabs[0]))).toMatchObject({ tiers: [{ name: "Silver", minAmount: 1000, discountPct: 5 }, { name: "Gold", minAmount: 5000, discountPct: 12 }] });
  });

  it("records the person's e-mail where the page records the signed-in user", async () => {
    const r = await call({ actor: ACTOR, method: "PUT", path: "/api/admin/preorder/vat", body: { rates: { SI: 22 }, fallbackRate: null } });
    expect(r.status).toBe(200);
    expect((await getVatSettings()).updatedBy).toBe("maja@t4a.test");
  });

  it("outside a bridge call getSession() is the browser's again", async () => {
    await call({ actor: ACTOR, method: "GET", path: "/api/admin/preorder/vat" });
    await expect(auth0.getSession()).rejects.toThrow(); // no request scope in a test: the real Auth0 method ran
  });
});
