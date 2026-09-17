import "server-only";

// Server-side helper for the B2B customer portal: resolve the logged-in user to
// their Metakocka partner via the session EMAIL. Never trust a partner id from
// the client — this is the single source of "whose documents am I allowed to
// see" for every /portal page and /api/portal route.

import { auth0 } from "@/lib/auth";
import { resolvePartnerByEmail } from "@/lib/metakocka";
import type { DocKind, MkPartner } from "@/types/documents";

// The document families a customer may see in the portal. Offers are internal
// (admins still browse them under /documents) and are never exposed here — not
// as a page, a nav link, an API `type`, or a PDF.
export const PORTAL_DOC_KINDS: readonly DocKind[] = ["invoice", "credit-note", "order"];

export function isPortalDocKind(kind: DocKind | null | undefined): kind is DocKind {
  return !!kind && PORTAL_DOC_KINDS.includes(kind);
}

export async function getSessionPartner(): Promise<MkPartner | null> {
  const session = await auth0.getSession();
  return resolvePartnerByEmail(session?.user?.email);
}
