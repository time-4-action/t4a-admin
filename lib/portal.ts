import "server-only";

// Server-side helper for the B2B customer portal: resolve the logged-in user to
// their Metakocka partner via the session EMAIL. Never trust a partner id from
// the client — this is the single source of "whose documents am I allowed to
// see" for every /portal page and /api/portal route.

import { auth0 } from "@/lib/auth";
import { getPartnerById, resolvePartnerByEmail } from "@/lib/metakocka";
import { readImpersonation } from "@/lib/portal-impersonation";
import { cached } from "@/lib/auth0-cache";
import type { DocKind, MkPartner } from "@/types/documents";

// The document families a customer may see in the portal. Offers are internal
// (admins still browse them under /documents) and are never exposed here — not
// as a page, a nav link, an API `type`, or a PDF.
export const PORTAL_DOC_KINDS: readonly DocKind[] = ["invoice", "credit-note", "order"];

export function isPortalDocKind(kind: DocKind | null | undefined): kind is DocKind {
  return !!kind && PORTAL_DOC_KINDS.includes(kind);
}

// The partner the portal shows. Normally the session email's partner; for an admin
// who is "viewing the portal as" a customer (lib/portal-impersonation.ts — a signed
// cookie honoured only with an eligible admin role) it is that customer.
export async function getSessionPartner(): Promise<MkPartner | null> {
  return (await getPortalViewer()).partner;
}

export type PortalViewer = {
  partner: MkPartner | null;
  // Set while an admin views the portal as a customer: who they really are.
  impersonating: { partnerMkId: string; partnerName: string; adminEmail: string | null; returnTo: string } | null;
};

export async function getPortalViewer(): Promise<PortalViewer> {
  const imp = await readImpersonation();
  if (imp) {
    const partner = await cached(`portal-as:${imp.partnerMkId}`, 60_000, () => getPartnerById(imp.partnerMkId));
    return {
      partner,
      impersonating: { partnerMkId: imp.partnerMkId, partnerName: partner?.name ?? imp.partnerName, adminEmail: imp.adminEmail, returnTo: imp.returnTo },
    };
  }
  const session = await auth0.getSession();
  return { partner: await resolvePartnerByEmail(session?.user?.email), impersonating: null };
}
