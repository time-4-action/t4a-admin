import "server-only";

// lib/agent-api.ts
//
// Machine auth + response helpers for the agent API (`/api/agent/*`), used by the
// T4A AI agent (t4a-agent), a server-side app with no Auth0 session.
//
// The middleware (lib/proxy.ts) lets exactly `/api/agent` and `/api/agent/…`
// through without a session (see isAgentApiPath in lib/access.ts); every route
// under it MUST be wrapped in `agentRoute()` (GET) or `agentWriteRoute()` (POST).
//   - GET  accepts `Authorization: Bearer $AGENT_READ_TOKEN` or `$AGENT_WRITE_TOKEN`
//          (503 when neither is configured, 401 when missing / wrong).
//   - POST accepts ONLY `$AGENT_WRITE_TOKEN` (503 when it is not configured, 401
//          when missing / wrong — the read token is wrong here). Every POST body
//          carries `actor: {sub, name, email}`, the staff member who asked for and
//          approved the change in the agent app; it is recorded as
//          "<name> (T4A agent)" where the admin UI records its acting user, and one
//          log line per write names the route, target and actor sub.
// Every response is `Cache-Control: no-store`. Responses never carry secrets: no
// campaign `shareToken`, no tokens / keys, no impersonation state.

import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store" };

export function agentJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function agentError(error: string, status: number, details?: unknown): NextResponse {
  return agentJson(details === undefined ? { error } : { error, details }, status);
}

// Compare two strings in constant time. Hashing first makes both sides the same
// length, so neither the length nor the content of the token leaks via timing.
export function tokensEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

// Check the bearer against the configured tokens (unset / blank ones are skipped;
// every configured one is compared, so timing does not tell which matched).
function checkTokens(req: Request, envNames: string[]): NextResponse | null {
  const expected = envNames.map((n) => process.env[n]?.trim()).filter((t): t is string => !!t);
  if (expected.length === 0) return agentError("agent API not configured", 503);
  const got = bearer(req);
  if (!got) return agentError("unauthorized", 401);
  let ok = false;
  for (const t of expected) ok = tokensEqual(got, t) || ok;
  return ok ? null : agentError("unauthorized", 401);
}

// Reads: the read token or the write token. null = authorized; otherwise the
// response to return.
export function agentAuth(req: Request): NextResponse | null {
  return checkTokens(req, ["AGENT_READ_TOKEN", "AGENT_WRITE_TOKEN"]);
}

// Writes: the write token only.
export function agentWriteAuth(req: Request): NextResponse | null {
  return checkTokens(req, ["AGENT_WRITE_TOKEN"]);
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

// ── writes ────────────────────────────────────────────────────────────────────

// The person in the agent app who asked for (and approved) the write.
export type AgentActor = { sub: string; name: string; email: string };

// How the actor is recorded in the admin's own audit fields.
export function agentActorLabel(actor: AgentActor): string {
  return `${actor.name} (T4A agent)`;
}

const EMAIL = /^[^\s@]+@[^\s@]+$/;

export function parseActor(raw: unknown): { ok: true; actor: AgentActor } | { ok: false; details: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, details: ["actor is required: {sub, name, email}"] };
  const r = raw as Record<string, unknown>;
  const details: string[] = [];
  const str = (k: string, max: number) => {
    const v = typeof r[k] === "string" ? (r[k] as string).trim() : "";
    if (!v) details.push(`actor.${k} is required`);
    else if (v.length > max) details.push(`actor.${k} is too long`);
    return v;
  };
  const sub = str("sub", 200);
  const name = str("name", 200);
  const email = str("email", 320);
  if (email && !EMAIL.test(email)) details.push("actor.email is not an email address");
  return details.length ? { ok: false, details } : { ok: true, actor: { sub, name, email } };
}

export type AgentWrite = {
  body: Record<string, unknown>;
  actor: AgentActor;
  // What the write acted on, for the audit log line (set by the handler).
  target: string | null;
};

// Wrap a POST handler: write-token auth, JSON object body with a valid `actor`
// (400 otherwise), then the handler. Logs one line per write with the route, the
// target, the actor sub and the response status. An unexpected throw becomes a 500
// `{error}` (no stack), still no-store.
export function agentWriteRoute<Ctx = unknown>(
  handler: (w: AgentWrite, ctx: Ctx, req: Request) => Promise<NextResponse>,
): (req: Request, ctx: Ctx) => Promise<NextResponse> {
  return async (req, ctx) => {
    const denied = agentWriteAuth(req);
    if (denied) return denied;
    const route = new URL(req.url).pathname;
    const body = await req.json().catch(() => undefined);
    if (!body || typeof body !== "object" || Array.isArray(body)) return agentError("body must be a JSON object", 400);
    const parsed = parseActor((body as Record<string, unknown>).actor);
    if (!parsed.ok) return agentError("invalid actor", 400, parsed.details);
    const w: AgentWrite = { body: body as Record<string, unknown>, actor: parsed.actor, target: null };
    let res: NextResponse;
    try {
      res = await handler(w, ctx, req);
    } catch (err) {
      console.error(`POST ${route} failed:`, err);
      res = agentError("internal error", 500);
    }
    console.info(
      `[agent-write] POST ${route} target=${w.target ?? "-"} actor=${parsed.actor.sub} status=${res.status}`,
    );
    return res;
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
