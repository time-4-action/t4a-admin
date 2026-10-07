import "server-only";

// Server-side helper for the B2B customer portal: resolve the logged-in user to
// their Metakocka partner via the session EMAIL. Never trust a partner id from
// the client — this is the single source of "whose documents am I allowed to
// see" for every /portal page and /api/portal route. A portal AGENT additionally
// acts for assigned client partners (getPortalAccess below); a partner id from the
// browser is then only a choice among those server-derived accounts.

import { cookies } from "next/headers";
import { auth0 } from "@/lib/auth";
import { getPartnerById, resolvePartnerByEmail } from "@/lib/metakocka";
import { readImpersonation } from "@/lib/portal-impersonation";
import { cached } from "@/lib/auth0-cache";
import { getMkCustomer, partnerFromDirectory } from "@/lib/mk-customers";
import { getAgentClients } from "@/lib/portal-agents";
import type { DocKind, MkPartner } from "@/types/documents";
import {
  ALL_ACCOUNTS,
  portalAccountsFor,
  resolvePortalScope,
  type AgentClient,
  type PortalAccount,
  type PortalScope,
} from "@/types/portal-agent";

// The document families a customer may see in the portal. Offers are internal
// (admins still browse them under /documents) and are never exposed here — not
// as a page, a nav link, an API `type`, or a PDF.
export const PORTAL_DOC_KINDS: readonly DocKind[] = ["invoice", "credit-note", "order"];

export function isPortalDocKind(kind: DocKind | null | undefined): kind is DocKind {
  return !!kind && PORTAL_DOC_KINDS.includes(kind);
}

// The partner the portal shows. Normally the session email's partner; for an admin
// who is "viewing the portal as" someone (lib/portal-impersonation.ts — a signed
// cookie honoured only with an eligible admin role) it is that customer, or the
// partner the impersonated Auth0 user's email resolves to.
export async function getSessionPartner(): Promise<MkPartner | null> {
  return (await getPortalViewer()).partner;
}

// Set while an admin views the portal as someone else: who that is + who they really are.
export type PortalImpersonating =
  | { kind: "customer"; partnerMkId: string; partnerName: string; adminEmail: string | null; returnTo: string }
  | {
      kind: "user";
      userId: string;
      email: string;
      name: string;
      // The partner that user's email resolves to — null means they would see no-account.
      partnerMkId: string | null;
      partnerName: string | null;
      adminEmail: string | null;
      returnTo: string;
    };

export type PortalViewer = {
  partner: MkPartner | null;
  impersonating: PortalImpersonating | null;
};

export async function getPortalViewer(): Promise<PortalViewer> {
  const imp = await readImpersonation();
  if (imp?.kind === "user") {
    // Exactly the resolution a real login by that user gets.
    const partner = await resolvePartnerByEmail(imp.email);
    return {
      partner,
      impersonating: {
        kind: "user",
        userId: imp.userId,
        email: imp.email,
        name: imp.name,
        partnerMkId: partner?.mkId ?? null,
        partnerName: partner?.name ?? null,
        adminEmail: imp.adminEmail,
        returnTo: imp.returnTo,
      },
    };
  }
  if (imp) {
    // Live Metakocka partner, else the directory record (MK unreachable / partner not
    // returned by id) — an admin viewing as a customer must not land on "no account".
    const partner = await loadPartner(imp.partnerMkId);
    return {
      partner,
      impersonating: { kind: "customer", partnerMkId: imp.partnerMkId, partnerName: partner?.name ?? imp.partnerName, adminEmail: imp.adminEmail, returnTo: imp.returnTo },
    };
  }
  const session = await auth0.getSession();
  return { partner: await resolvePartnerByEmail(session?.user?.email), impersonating: null };
}

// The email the portal identity is derived from: the impersonated user's while a
// super-admin views as them, otherwise the session's. For the no-account page.
export async function getPortalIdentityEmail(): Promise<string | null> {
  const imp = await readImpersonation();
  if (imp?.kind === "user") return imp.email;
  const session = await auth0.getSession();
  return session?.user?.email ?? null;
}

// A partner by id: live Metakocka, else the directory record (MK unreachable /
// partner not returned by id). Cached briefly — used for impersonation and for an
// agent's client accounts, never with an id the caller has not authorised.
export function loadPartner(partnerMkId: string): Promise<MkPartner | null> {
  return cached(`portal-partner:${partnerMkId}`, 60_000, async () => {
    const live = await getPartnerById(partnerMkId).catch(() => null);
    if (live) return live;
    const dir = await getMkCustomer(partnerMkId).catch(() => null);
    return dir ? partnerFromDirectory(dir) : null;
  });
}

// ── agents: several accounts per portal user ─────────────────────────────────
//
// A portal user is normally exactly ONE partner. An AGENT (lib/portal-agents.ts)
// additionally acts for assigned client partners. The accounts are always derived
// server-side from the session partner — a partner id from the browser is only
// ever a CHOICE among them, re-checked on every request:
//   - document pages / lists follow the remembered scope (cookie below — "all" or
//     one account id; a stale or foreign value falls back to "all");
//   - preorder routes take an explicit `account` (URL / body), so two tabs on two
//     clients can never submit for the wrong one.

export const PORTAL_SCOPE_COOKIE = "t4a_portal_scope";

export type PortalAccess = {
  // The user's own partner (null ⇒ no-account).
  partner: MkPartner | null;
  // Own partner first, then clients. Empty without a partner.
  accounts: PortalAccount[];
  scope: PortalScope;
  impersonating: PortalImpersonating | null;
};

export async function getPortalAccess(): Promise<PortalAccess> {
  const viewer = await getPortalViewer();
  if (!viewer.partner) return { partner: null, accounts: [], scope: ALL_ACCOUNTS, impersonating: viewer.impersonating };
  // A Mongo hiccup must not take the plain customer portal down with it.
  const clients: AgentClient[] = await getAgentClients(viewer.partner.mkId).catch(() => []);
  const accounts = portalAccountsFor(viewer.partner, clients);
  const raw = (await cookies()).get(PORTAL_SCOPE_COOKIE)?.value;
  return { partner: viewer.partner, accounts, scope: resolvePortalScope(raw, accounts), impersonating: viewer.impersonating };
}

export function isAgentAccess(access: Pick<PortalAccess, "accounts">): boolean {
  return access.accounts.length > 1;
}

// The account ids the current scope covers (every account for "all").
export function scopedAccounts(access: Pick<PortalAccess, "accounts" | "scope">): PortalAccount[] {
  if (access.scope === ALL_ACCOUNTS) return access.accounts;
  return access.accounts.filter((a) => a.mkId === access.scope);
}

export function accountOf(access: Pick<PortalAccess, "accounts">, partnerMkId: string | null | undefined): PortalAccount | null {
  if (!partnerMkId) return null;
  return access.accounts.find((a) => a.mkId === partnerMkId) ?? null;
}

// The partner to act for on an explicit account choice (preorders): no choice ⇒ the
// user's own partner; otherwise it must be one of their accounts, else null (the
// route answers 404 exactly as for a foreign document).
export async function resolvePortalAccount(
  requested: string | null | undefined,
  access?: PortalAccess,
): Promise<{ partner: MkPartner; account: PortalAccount; access: PortalAccess } | null> {
  const a = access ?? (await getPortalAccess());
  if (!a.partner) return null;
  const id = (requested ?? "").trim();
  if (!id || id === a.partner.mkId) return { partner: a.partner, account: a.accounts[0], access: a };
  const account = accountOf(a, id);
  if (!account) return null;
  const partner = await loadPartner(account.mkId);
  return partner ? { partner, account, access: a } : null;
}

// The partner the scope shows when it is ONE account (null for "all").
export async function scopedPartner(access: PortalAccess): Promise<MkPartner | null> {
  if (!access.partner || access.scope === ALL_ACCOUNTS) return null;
  if (access.scope === access.partner.mkId) return access.partner;
  return loadPartner(access.scope);
}
