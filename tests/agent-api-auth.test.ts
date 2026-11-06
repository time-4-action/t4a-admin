// The agent API's gate: the middleware exclusion (lib/proxy.ts + isAgentApiPath),
// the bearer-token checks (lib/agent-api.ts) and the exact GET / POST surface.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

const auth0Mock = vi.hoisted(() => ({
  middleware: vi.fn(async () => new Response(null, { status: 200, headers: { "x-auth0": "1" } })),
  getSession: vi.fn(async () => null),
}));
vi.mock("@/lib/auth", () => ({ auth0: auth0Mock }));

import { proxy } from "@/lib/proxy";
import { isAgentApiPath } from "@/lib/access";
import { agentAuth, agentWriteAuth, parseActor, parsePaging, scrubSecrets, tokensEqual } from "@/lib/agent-api";

const TOKEN = "a".repeat(64);
const WRITE_TOKEN = "b".repeat(64);

describe("isAgentApiPath (exact segment match)", () => {
  it("matches /api/agent and everything below it", () => {
    for (const p of ["/api/agent", "/api/agent/", "/api/agent/customers", "/api/agent/preorders/campaigns/123"]) {
      expect(isAgentApiPath(p), p).toBe(true);
    }
  });

  it("does not match look-alikes or other APIs", () => {
    for (const p of ["/api/agents", "/api/agents/x", "/api/agent-x", "/api/agentx/customers", "/api/agen", "/api/admin/users", "/agent", "/api/Agent/customers", "/x/api/agent/customers", "/api", "/"]) {
      expect(isAgentApiPath(p), p).toBe(false);
    }
  });
});

describe("middleware (lib/proxy.ts)", () => {
  beforeEach(() => {
    auth0Mock.middleware.mockClear();
    auth0Mock.getSession.mockClear();
  });

  it("passes /api/agent/* straight to the route without touching Auth0", async () => {
    const res = await proxy(new NextRequest("http://admin.test/api/agent/customers"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(auth0Mock.middleware).not.toHaveBeenCalled();
    expect(auth0Mock.getSession).not.toHaveBeenCalled();
  });

  it("keeps every other path behind the session gate", async () => {
    for (const p of ["/api/agents", "/api/agent-x", "/api/agentx/customers", "/api/admin/users", "/api/admin/preorder/campaigns", "/users"]) {
      const res = await proxy(new NextRequest(`http://admin.test${p}`));
      expect(res.status, p).toBe(302);
      expect(res.headers.get("location"), p).toContain("/auth/login");
      expect(res.headers.get("x-middleware-next"), p).toBeNull();
    }
    expect(auth0Mock.middleware).toHaveBeenCalled();
  });

  it("dot segments cannot climb out of /api/agent (the URL is normalized first)", async () => {
    for (const p of ["/api/agent/../admin/users", "/api/agent/%2e%2e/admin/users", "/api/agent/./../../users"]) {
      const req = new NextRequest(`http://admin.test${p}`);
      expect(isAgentApiPath(req.nextUrl.pathname), p).toBe(false);
      const res = await proxy(req);
      expect(res.status, p).toBe(302);
    }
  });
});

describe("agentAuth (bearer token)", () => {
  const prev = process.env.AGENT_READ_TOKEN;
  const prevWrite = process.env.AGENT_WRITE_TOKEN;
  beforeEach(() => {
    delete process.env.AGENT_WRITE_TOKEN;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.AGENT_READ_TOKEN;
    else process.env.AGENT_READ_TOKEN = prev;
    if (prevWrite === undefined) delete process.env.AGENT_WRITE_TOKEN;
    else process.env.AGENT_WRITE_TOKEN = prevWrite;
  });
  const req = (auth?: string) => new Request("http://admin.test/api/agent/customers", { headers: auth ? { authorization: auth } : {} });

  it("503 when AGENT_READ_TOKEN is not configured (even with a header)", async () => {
    delete process.env.AGENT_READ_TOKEN;
    const res = agentAuth(req(`Bearer ${TOKEN}`))!;
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: expect.any(String) });
    process.env.AGENT_READ_TOKEN = "   ";
    expect(agentAuth(req(`Bearer ${TOKEN}`))!.status).toBe(503);
  });

  it("401 on a missing, malformed or wrong token", () => {
    process.env.AGENT_READ_TOKEN = TOKEN;
    for (const h of [undefined, "", TOKEN, `Basic ${TOKEN}`, "Bearer ", `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(1)}`, "Bearer wrong"]) {
      const res = agentAuth(req(h));
      expect(res?.status, String(h)).toBe(401);
      expect(res?.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("lets the right token through", () => {
    process.env.AGENT_READ_TOKEN = TOKEN;
    expect(agentAuth(req(`Bearer ${TOKEN}`))).toBeNull();
    expect(agentAuth(req(`bearer  ${TOKEN}`))).toBeNull();
  });

  it("GET also accepts the write token; either one alone is enough", () => {
    process.env.AGENT_READ_TOKEN = TOKEN;
    process.env.AGENT_WRITE_TOKEN = WRITE_TOKEN;
    expect(agentAuth(req(`Bearer ${TOKEN}`))).toBeNull();
    expect(agentAuth(req(`Bearer ${WRITE_TOKEN}`))).toBeNull();
    expect(agentAuth(req("Bearer wrong"))?.status).toBe(401);
    delete process.env.AGENT_READ_TOKEN;
    expect(agentAuth(req(`Bearer ${WRITE_TOKEN}`))).toBeNull();
    expect(agentAuth(req(`Bearer ${TOKEN}`))?.status).toBe(401);
  });

  it("POST (agentWriteAuth) accepts ONLY the write token: read token → 401, unset → 503", () => {
    process.env.AGENT_READ_TOKEN = TOKEN;
    expect(agentWriteAuth(req(`Bearer ${TOKEN}`))?.status).toBe(503);
    process.env.AGENT_WRITE_TOKEN = WRITE_TOKEN;
    expect(agentWriteAuth(req(`Bearer ${TOKEN}`))?.status).toBe(401);
    for (const h of [undefined, "", WRITE_TOKEN, `Bearer ${WRITE_TOKEN}x`, "Bearer "]) {
      expect(agentWriteAuth(req(h))?.status, String(h)).toBe(401);
    }
    expect(agentWriteAuth(req(`Bearer ${WRITE_TOKEN}`))).toBeNull();
  });

  it("parseActor requires sub, name and a valid email", () => {
    expect(parseActor({ sub: "auth0|1", name: " Maja ", email: "maja@t4a.test" })).toEqual({ ok: true, actor: { sub: "auth0|1", name: "Maja", email: "maja@t4a.test" } });
    for (const a of [undefined, null, "x", [], {}, { sub: "s", name: "n" }, { sub: "s", name: "", email: "e@x.y" }, { sub: "s", name: "n", email: "nope" }, { sub: 1, name: "n", email: "e@x.y" }]) {
      expect(parseActor(a).ok, JSON.stringify(a)).toBe(false);
    }
  });

  it("tokensEqual compares exactly", () => {
    expect(tokensEqual("abc", "abc")).toBe(true);
    expect(tokensEqual("abc", "abd")).toBe(false);
    expect(tokensEqual("abc", "abcd")).toBe(false);
  });
});

describe("helpers", () => {
  it("parsePaging: limit default 50, max 200; skip default 0", () => {
    expect(parsePaging(new URLSearchParams())).toEqual({ limit: 50, skip: 0 });
    expect(parsePaging(new URLSearchParams("limit=500&skip=20"))).toEqual({ limit: 200, skip: 20 });
    expect(parsePaging(new URLSearchParams("limit=0&skip=-4"))).toEqual({ limit: 50, skip: 0 });
    expect(parsePaging(new URLSearchParams("limit=abc&skip=x"))).toEqual({ limit: 50, skip: 0 });
  });

  it("scrubSecrets drops credential-looking keys at any depth", () => {
    const out = scrubSecrets({ a: 1, accessTokenEnc: "x", nested: [{ apiKey: "k", api_key: "k", password: "p", ok: true }], feed: { authToken: "t", name: "n" } });
    expect(out).toEqual({ a: 1, nested: [{ ok: true }], feed: { name: "n" } });
  });
});

describe("the agent API surface: reads are GET-only, writes are POST-only", () => {
  const root = path.resolve(__dirname, "../app/api/agent");
  const routeFiles: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "route.ts") routeFiles.push(p);
    }
  };
  walk(root);
  const rel = (f: string) => path.relative(root, path.dirname(f)).split(path.sep).join("/");

  const READ_ROUTES = [
    "ai-usage",
    "automation",
    "builder-presets",
    "customers",
    "partners",
    "partners/[sub]",
    "portal-agents",
    "preorders/campaigns",
    "preorders/campaigns/[id]",
    "preorders/submissions",
    "preorders/submissions/[id]",
  ];
  const WRITE_ROUTES = [
    "automation/run",
    "customers/[partnerMkId]",
    "customers/sync",
    "portal-agents/[partnerMkId]/clients",
    "preorders/access",
    "preorders/campaigns/[id]/status",
    "preorders/submissions/[id]/action",
  ];

  it("has exactly the expected routes", () => {
    expect(routeFiles.map(rel).sort()).toEqual([...READ_ROUTES, ...WRITE_ROUTES].sort());
  });

  it("read routes export GET only, write routes POST only (no DELETE / PUT / PATCH anywhere)", async () => {
    for (const f of routeFiles) {
      const mod = await import(f);
      const methods = Object.keys(mod).filter((k) => /^[A-Z]+$/.test(k));
      expect(methods, f).toEqual(WRITE_ROUTES.includes(rel(f)) ? ["POST"] : ["GET"]);
    }
  });

  it("every route rejects a request without the token before doing any work", async () => {
    process.env.AGENT_READ_TOKEN = TOKEN;
    process.env.AGENT_WRITE_TOKEN = WRITE_TOKEN;
    for (const f of routeFiles) {
      const mod = await import(f);
      const handler = mod.GET ?? mod.POST;
      const init = mod.POST ? { method: "POST", body: "{}" } : {};
      const res: Response = await handler(new Request("http://admin.test/api/agent/x", init), { params: Promise.resolve({ id: "x", sub: "x", partnerMkId: "x" }) });
      expect(res.status, f).toBe(401);
      expect(res.headers.get("cache-control"), f).toBe("no-store");
    }
    delete process.env.AGENT_READ_TOKEN;
    delete process.env.AGENT_WRITE_TOKEN;
  });

  it("write routes refuse the read token (401)", async () => {
    process.env.AGENT_READ_TOKEN = TOKEN;
    process.env.AGENT_WRITE_TOKEN = WRITE_TOKEN;
    for (const f of routeFiles.filter((x) => WRITE_ROUTES.includes(rel(x)))) {
      const mod = await import(f);
      const res: Response = await mod.POST(
        new Request("http://admin.test/api/agent/x", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: "{}" }),
        { params: Promise.resolve({ id: "x", partnerMkId: "x" }) },
      );
      expect(res.status, f).toBe(401);
    }
    delete process.env.AGENT_READ_TOKEN;
    delete process.env.AGENT_WRITE_TOKEN;
  });
});
