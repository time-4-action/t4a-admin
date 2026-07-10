import "server-only";

// Server-side helper for the B2B customer portal: resolve the logged-in user to
// their Metakocka partner via the session EMAIL. Never trust a partner id from
// the client — this is the single source of "whose documents am I allowed to
// see" for every /portal page and /api/portal route.

import { auth0 } from "@/lib/auth";
import { resolvePartnerByEmail } from "@/lib/metakocka";
import type { MkPartner } from "@/types/documents";

export async function getSessionPartner(): Promise<MkPartner | null> {
  const session = await auth0.getSession();
  return resolvePartnerByEmail(session?.user?.email);
}
