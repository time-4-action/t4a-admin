// types/portal-agent.ts
//
// Portal agents: a customer who also sees the documents and preorders of assigned
// client partners. Wire types + the pure account / scope rules (shared by the
// server helpers in lib/portal.ts, the routes and the tests).

export type AgentClient = { partnerMkId: string; partnerName: string };

export type PortalAgentView = {
  partnerMkId: string;
  partnerName: string;
  clients: (AgentClient & { addedAt: string | null; addedBy: string | null })[];
  note: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

// One account the portal user may act for: their own partner, or a client.
export type PortalAccount = { mkId: string; name: string; own: boolean };

// The portal's current view: every account together, or one of them.
export const ALL_ACCOUNTS = "all";
export type PortalScope = typeof ALL_ACCOUNTS | string;

export const MAX_AGENT_CLIENTS = 500;

// Trim, dedupe, and drop the agent itself — an agent's own partner is always an
// account of theirs, never a client of theirs.
export function normalizeAgentClients(agentMkId: string, input: unknown): AgentClient[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>([agentMkId]);
  const out: AgentClient[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.partnerMkId === "string" ? r.partnerMkId.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof r.partnerName === "string" && r.partnerName.trim() ? r.partnerName.trim() : id;
    out.push({ partnerMkId: id, partnerName: name.slice(0, 300) });
    if (out.length >= MAX_AGENT_CLIENTS) break;
  }
  return out;
}

// The accounts a portal user may act for: their own partner first, then the
// clients (A→Z). Without an agent record this is just their own partner.
export function portalAccountsFor(own: { mkId: string; name: string }, clients: AgentClient[]): PortalAccount[] {
  const rest = normalizeAgentClients(own.mkId, clients)
    .map((c) => ({ mkId: c.partnerMkId, name: c.partnerName, own: false }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [{ mkId: own.mkId, name: own.name, own: true }, ...rest];
}

// The effective scope for a remembered choice. A plain customer (one account) is
// always scoped to it; an agent defaults to "all" and a choice that is no longer
// one of their accounts (client unassigned) falls back to "all" too.
export function resolvePortalScope(raw: string | null | undefined, accounts: PortalAccount[]): PortalScope {
  if (accounts.length <= 1) return accounts[0]?.mkId ?? ALL_ACCOUNTS;
  const v = (raw ?? "").trim();
  if (v && v !== ALL_ACCOUNTS && accounts.some((a) => a.mkId === v)) return v;
  return ALL_ACCOUNTS;
}
