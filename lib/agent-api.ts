import "server-only";

// lib/agent-api.ts
//
// Machine auth + response helpers for the read-only agent API (`/api/agent/*`),
// used by the T4A AI agent (t4a-agent), a server-side app with no Auth0 session.
//
// The middleware (lib/proxy.ts) lets exactly `/api/agent` and `/api/agent/…`
// through without a session (see isAgentApiPath in lib/access.ts); every route
// under it MUST start with `agentAuth(req)`, which checks
// `Authorization: Bearer $AGENT_READ_TOKEN`:
//   - token not configured on this server → 503 (the surface is off)
//   - header missing / wrong              → 401
// Only GET handlers exist (Next answers 405 to anything else). Every response is
// `Cache-Control: no-store`. Responses never carry secrets: no campaign
// `shareToken`, no tokens / keys, no impersonation state.

import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store" };

export function agentJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function agentError(error: string, status: number): NextResponse {
  return agentJson({ error }, status);
}

// Compare two strings in constant time. Hashing first makes both sides the same
// length, so neither the length nor the content of the token leaks via timing.
export function tokensEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

// null = authorized; otherwise the response to return.
export function agentAuth(req: Request): NextResponse | null {
  const expected = process.env.AGENT_READ_TOKEN?.trim();
  if (!expected) return agentError("agent API not configured", 503);
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m || !tokensEqual(m[1].trim(), expected)) return agentError("unauthorized", 401);
  return null;
}

// Wrap a GET handler: auth first, then the handler; an unexpected throw becomes a
// 500 `{error}` (message only — never a stack) that is still no-store.
export function agentRoute<Ctx = unknown>(
  handler: (req: Request, ctx: Ctx) => Promise<NextResponse>,
): (req: Request, ctx: Ctx) => Promise<NextResponse> {
  return async (req, ctx) => {
    const denied = agentAuth(req);
    if (denied) return denied;
    try {
      return await handler(req, ctx);
    } catch (err) {
      console.error(`GET ${new URL(req.url).pathname} failed:`, err);
      return agentError("internal error", 500);
    }
  };
}

export type Paging = { limit: number; skip: number };

// `limit` default 50, max 200 (min 1); `skip` default 0.
export function parsePaging(sp: URLSearchParams): Paging {
  const rawLimit = Number.parseInt(sp.get("limit") ?? "", 10);
  const rawSkip = Number.parseInt(sp.get("skip") ?? "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(200, rawLimit) : 50;
  const skip = Number.isFinite(rawSkip) && rawSkip > 0 ? rawSkip : 0;
  return { limit, skip };
}

export function pageOf<T>(all: T[], { limit, skip }: Paging): { total: number; items: T[] } {
  return { total: all.length, items: all.slice(skip, skip + limit) };
}

// Defence in depth for data proxied from other services (partner portal,
// mk-automation): they already strip their secrets, but drop any key that looks
// like a credential before it leaves this server.
const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|credential|authorization|cookie)/i;

export function scrubSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => scrubSecrets(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) continue;
      out[k] = scrubSecrets(v);
    }
    return out as T;
  }
  return value;
}
