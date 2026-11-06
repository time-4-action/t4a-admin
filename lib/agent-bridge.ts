import "server-only";

// lib/agent-bridge.ts
//
// The T4A agent can do whatever the admin pages can, for the staff member who asked
// it, and nothing more. Instead of one agent route per button, the bridge
// (POST /api/agent/admin) runs the admin pages' OWN API route handlers
// (lib/agent-bridge-routes.generated.ts), so every validation, side effect and audit
// field is the one the page uses.
//
//   { actor: {sub, name}, method, path: "/api/admin/…", query?, body? }
//
// Security, in order:
//   1. Token: GET calls accept the read or the write token, every other method only
//      the write token (lib/agent-api.ts). The agent app asks a human to approve every
//      change before it sends it.
//   2. Route: only the generated list (admin page APIs; never /api/portal, /api/agent,
//      cookie or secret-token routes, see scripts/gen-agent-bridge.mjs EXCLUDED), and
//      only a method that route exports.
//   3. Who: the actor's roles come from Auth0 (lib/agent-identity.ts), never from the
//      caller, and are checked with the same rules as the middleware (lib/access.ts):
//      any admin role at all, and the section that guards the path.
//   4. The handler then runs as that person (lib/agent-actor.ts): its own role checks
//      (e.g. only a super-admin grants admin roles) and its "who did it" fields see
//      them, named "<name> (T4A agent)".
//   5. The answer is JSON only (files are refused), credentials are scrubbed, and one
//      log line per call names the method, route, actor and status.

import { NextRequest } from "next/server";
import { canSee, hasAnyAccess, sectionForPath, SECTION_ROLES, type SectionKey } from "@/lib/access";
import { runAsAgentActor } from "@/lib/agent-actor";
import { agentAuth, agentError, agentJson, agentWriteAuth, parseActor, scrubSecrets } from "@/lib/agent-api";
import { lookupAgentIdentity } from "@/lib/agent-identity";
import { BRIDGE_ROUTES } from "@/lib/agent-bridge-routes.generated";
import type { BridgeMethod, BridgeRoute } from "@/lib/agent-bridge-types";

const METHODS: BridgeMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const SEGMENT = /^[A-Za-z0-9_.|:@%+=,~-]{1,200}$/;
const MAX_BODY = 1_000_000;

const SECTION_NAMES: Record<SectionKey, string> = {
  general: "Users", access: "Access", ai: "AI", warranty: "Warranty", partners: "Partners",
  automation: "Automation", builder: "Builder", documents: "Documents", preorder: "Preorder",
  customers: "Customers", system: "System (super-admin)",
};

/** The route a concrete path belongs to, with its params, or null. */
export function matchRoute(path: string): { route: BridgeRoute; params: Record<string, string> } | null {
  const segs = path.split("/").slice(1);
  if (segs.some((s) => !SEGMENT.test(s) || s === "." || s === "..")) return null;
  for (const route of BRIDGE_ROUTES) {
    const pat = route.pattern.split("/").slice(1);
    if (pat.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pat.length && ok; i++) {
      const m = /^\[([A-Za-z0-9_]+)\]$/.exec(pat[i]);
      if (m) {
        try { params[m[1]] = decodeURIComponent(segs[i]); } catch { ok = false; }
      } else ok = pat[i] === segs[i];
    }
    // A literal segment beats a [param] at the same place (".../customers/sync" vs ".../customers/[id]").
    if (ok) return { route, params };
  }
  return null;
}

// Literal routes first, so "/api/admin/preorder/customers/sync" never matches "[partnerMkId]".
BRIDGE_ROUTES.sort((a, b) => (a.pattern.match(/\[/g)?.length ?? 0) - (b.pattern.match(/\[/g)?.length ?? 0));

/** GET /api/agent/admin: what the agent may call, with each handler's documentation. */
export function bridgeCatalog() {
  return {
    howTo:
      "POST /api/agent/admin { actor, method, path, query?, body? } runs the admin page's own API. " +
      "Paths use the pattern with real ids in place of [param]. PUT and PATCH bodies that are described as " +
      "'replace' replace the whole thing: GET it first and send it back changed.",
    routes: BRIDGE_ROUTES.map((r) => ({
      path: r.pattern,
      section: sectionForPath(r.pattern),
      about: r.header || undefined,
      methods: r.methods,
    })),
  };
}

type Log = { method: string; path: string; actor: string; status: number };
const log = (l: Log) => console.info(`[agent-bridge] ${l.method} ${l.path} actor=${l.actor} status=${l.status}`);

export async function handleBridge(req: Request): Promise<Response> {
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY) return agentError("request too large", 413);
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return agentError("body must be a JSON object", 400);
  }

  const method = typeof body.method === "string" ? body.method.toUpperCase() : "";
  if (!(METHODS as string[]).includes(method)) return agentError(`method must be one of ${METHODS.join(", ")}`, 400);
  const denied = method === "GET" ? agentAuth(req) : agentWriteAuth(req);
  if (denied) return denied;

  const actorParsed = parseActor(body.actor);
  if (!actorParsed.ok) return agentError("invalid actor", 400, actorParsed.details);
  const actor = actorParsed.actor;

  const path = typeof body.path === "string" ? body.path.trim() : "";
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) return agentError("path must be an admin API path like /api/admin/…, without a query", 400);
  const hit = matchRoute(path);
  if (!hit) return agentError("no such admin API route for the agent (see GET /api/agent/admin)", 404);
  const handler = hit.route.mod[method as BridgeMethod];
  if (!handler || !(method in hit.route.methods)) {
    return agentError(`${path} does not take ${method}; it takes ${Object.keys(hit.route.methods).join(", ")}`, 405);
  }

  const who = await lookupAgentIdentity(actor.sub).catch(() => undefined);
  if (who === undefined) return agentError("could not look up the person's roles in Auth0, try again", 503);
  if (who === null) return agentError("this person has no account in the admin", 403);
  const section = sectionForPath(path);
  if (!hasAnyAccess(who.roles)) return agentError(`${actor.name} has no access to the admin`, 403);
  if (section && !canSee(who.roles, section)) {
    return agentError(`${actor.name} has no access to the ${SECTION_NAMES[section]} section (needs one of: ${SECTION_ROLES[section].join(", ")})`, 403);
  }

  // The inner request: the same path, the agent's query and JSON body, no cookies.
  const url = new URL(path, new URL(req.url).origin);
  if (body.query && typeof body.query === "object" && !Array.isArray(body.query)) {
    for (const [k, v] of Object.entries(body.query as Record<string, unknown>)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const hasBody = method !== "GET" && body.body !== undefined;
  const inner = new NextRequest(url, {
    method,
    headers: hasBody ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
    body: hasBody ? JSON.stringify(body.body) : undefined,
  });

  const identity = { sub: actor.sub, name: actor.name, email: who.email ?? actor.email, roles: who.roles };
  let res: Response;
  try {
    res = await runAsAgentActor(identity, async () => handler(inner, { params: Promise.resolve(hit.params) }));
  } catch (err) {
    console.error(`[agent-bridge] ${method} ${path} failed:`, err);
    log({ method, path, actor: actor.sub, status: 500 });
    return agentError("internal error", 500);
  }

  const type = res.headers.get("content-type") ?? "";
  let out: Response;
  if (res.status === 204 || res.headers.get("content-length") === "0") out = agentJson({ ok: true }, res.status === 204 ? 200 : res.status);
  else if (!type.includes("json")) {
    out = res.ok
      ? agentError(`${path} answers with a file (${type.split(";")[0] || "unknown type"}), which the agent can't read through the bridge`, 415)
      : agentError(`the admin answered HTTP ${res.status}`, res.status);
  } else {
    const data = await res.json().catch(() => null);
    out = agentJson(scrubSecrets(data), res.status);
  }
  log({ method, path, actor: actor.sub, status: out.status });
  return out;
}

