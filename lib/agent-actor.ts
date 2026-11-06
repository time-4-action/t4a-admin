// lib/agent-actor.ts (no server-only / Auth0 Management imports: lib/auth.ts, and
// with it the middleware, imports this file; the Auth0 lookup is lib/agent-identity.ts)
//
// "Acting as" the staff member behind a T4A agent call (POST /api/agent/admin,
// lib/agent-bridge.ts). The bridge runs the admin page APIs' own route handlers;
// those read the caller through `auth0.getSession()` (who did it, which roles). While
// a bridge call runs, lib/auth.ts answers getSession() from this AsyncLocalStorage
// instead of a browser cookie, so a handler sees the staff member exactly as if they
// had clicked the button themselves — their Auth0 roles (lib/agent-identity.ts, never taken
// from the caller) and their e-mail, with the name marked "(T4A agent)".

import { AsyncLocalStorage } from "node:async_hooks";
import { ROLE_CLAIM } from "@/lib/access";

export type AgentIdentity = { sub: string; name: string; email: string | null; roles: string[] };

const store = new AsyncLocalStorage<AgentIdentity>();

/** Run `fn` with getSession() answering as `who`. */
export function runAsAgentActor<T>(who: AgentIdentity, fn: () => Promise<T>): Promise<T> {
  return store.run(who, fn);
}

/** The session a handler sees during a bridge call, or null outside one. */
export function agentActorSession() {
  const who = store.getStore();
  if (!who) return null;
  // Only the role claim is read from the ID token (lib/access.ts rolesFromIdToken);
  // it is never verified or sent anywhere, so an unsigned stand-in carries the roles.
  const payload = Buffer.from(JSON.stringify({ [ROLE_CLAIM]: who.roles, sub: who.sub })).toString("base64url");
  return {
    user: { sub: who.sub, name: `${who.name} (T4A agent)`, email: who.email ?? `${who.name} (T4A agent)` },
    tokenSet: { idToken: `agent.${payload}.agent`, accessToken: "", expiresAt: 0 },
    internal: { sid: "t4a-agent", createdAt: Math.floor(Date.now() / 1000) },
  };
}
