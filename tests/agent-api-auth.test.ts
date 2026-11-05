// The agent API's gate: the middleware exclusion (lib/proxy.ts + isAgentApiPath),
// the bearer-token check (lib/agent-api.ts) and the GET-only surface.
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
import { agentAuth, parsePaging, scrubSecrets, tokensEqual } from "@/lib/agent-api";

const TOKEN = "a".repeat(64);

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
  afterEach(() => {
    if (prev === undefined) delete process.env.AGENT_READ_TOKEN;
    else process.env.AGENT_READ_TOKEN = prev;
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

describe("the agent API surface is GET-only", () => {
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

  it("has the expected routes", () => {
    const rel = routeFiles.map((f) => path.relative(root, path.dirname(f)).split(path.sep).join("/")).sort();
    expect(rel).toEqual([
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
    ]);
  });

  it("every route exports GET and no other method (Next answers 405 to the rest)", async () => {
    for (const f of routeFiles) {
      const mod = await import(f);
      const methods = Object.keys(mod).filter((k) => /^[A-Z]+$/.test(k));
      expect(methods, f).toEqual(["GET"]);
    }
  });

  it("every route rejects a request without the token before doing any work", async () => {
    process.env.AGENT_READ_TOKEN = TOKEN;
    for (const f of routeFiles) {
      const mod = await import(f);
      const res: Response = await mod.GET(new Request("http://admin.test/api/agent/x"), { params: Promise.resolve({ id: "x", sub: "x" }) });
      expect(res.status, f).toBe(401);
      expect(res.headers.get("cache-control"), f).toBe("no-store");
    }
    delete process.env.AGENT_READ_TOKEN;
  });
});
