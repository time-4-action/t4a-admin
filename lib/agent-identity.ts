import "server-only";

// lib/agent-identity.ts — the Auth0 e-mail and roles of the staff member behind a
// T4A agent bridge call (lib/agent-bridge.ts, lib/agent-actor.ts).
import { cached } from "@/lib/auth0-cache";
import { getMgmtClient } from "@/lib/mgmt";

// The staff member's e-mail and roles from Auth0 (the agent sends only sub + name).
// Cached for a minute like the rest of the Auth0 lookups. Overridable in tests.
let lookup = async (sub: string): Promise<{ email: string | null; roles: string[] } | null> => {
  const mgmt = getMgmtClient();
  try {
    const [u, rolesRes] = await Promise.all([mgmt.users.get(sub), mgmt.users.roles.list(sub)]);
    const email = (u as { email?: string }).email ?? null;
    const roles = (((rolesRes as { data?: unknown }).data ?? []) as { name?: string }[])
      .map((r) => r.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
    return { email, roles };
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
};

export function setAgentIdentityLookupForTests(fn: typeof lookup) {
  lookup = fn;
}

export function lookupAgentIdentity(sub: string) {
  return cached(`agent-identity:${sub}`, 60_000, () => lookup(sub));
}
