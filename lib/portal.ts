import "server-only";

// Server-side helper for the B2B customer portal: resolve the logged-in user to
// their Metakocka partner via the session EMAIL. Never trust a partner id from
// the client — this is the single source of "whose documents am I allowed to
// see" for every /portal page and /api/portal route.

import { auth0 } from "@/lib/auth";
import { getPartnerById, resolvePartnerByEmail } from "@/lib/metakocka";
import { readImpersonation } from "@/lib/portal-impersonation";
import { cached } from "@/lib/auth0-cache";
import { getMkCustomer, partnerFromDirectory } from "@/lib/mk-customers";
import type { DocKind, MkPartner } from "@/types/documents";

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
    const partner = await cached(`portal-as:${imp.partnerMkId}`, 60_000, async () => {
      const live = await getPartnerById(imp.partnerMkId).catch(() => null);
      if (live) return live;
      const dir = await getMkCustomer(imp.partnerMkId);
      return dir ? partnerFromDirectory(dir) : null;
    });
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
