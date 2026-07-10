import { NextResponse } from "next/server";
import { callPartnerPortal } from "@/lib/partner-api";
import { getUsersWithRole } from "@/lib/role-users";
import { PARTNER_ROLE_NAME } from "@/lib/partner-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zeroed rollup for a partner that holds the role but has no portal activity yet.
function emptyRollup() {
  return {
    shopifyConnections: { total: 0, active: 0, lastSyncAt: null, lastSyncStatus: null },
    exports: { configs: 0, downloads30d: 0 },
    feeds: { total: 0, active: 0, lastImportAt: null, lastResult: null },
    lastActiveAt: null,
    loginCount: 0,
    topEvents: [] as { eventType: string; count: number }[],
  };
}

type Overview = {
  ownerSub: string;
  email?: string | null;
  shopifyConnections?: unknown;
  exports?: unknown;
  feeds?: unknown;
  lastActiveAt?: string | null;
  loginCount?: number;
  topEvents?: { eventType: string; count: number }[];
};

/**
 * Partners list. A "partner" is an Auth0 user holding PARTNER_ROLE_NAME; we
 * left-join the portal's per-sub activity rollup onto that identity list so
 * dormant partners still appear (with zeros).
 */
export async function GET() {
  const users = await getUsersWithRole(PARTNER_ROLE_NAME);

  // Ask the portal only about the subs we actually show.
  const subs = users.map((u) => u.id).filter(Boolean);
  const qs = subs.length
    ? `?subs=${encodeURIComponent(subs.join(","))}`
    : "";
  const result = await callPartnerPortal(`/api/admin/partners/overview${qs}`);

  let bySub = new Map<string, Overview>();
  let portalReachable = true;
  if (result.ok) {
    const partners = ((result.data as { partners?: Overview[] })?.partners) ?? [];
    bySub = new Map(partners.map((p) => [p.ownerSub, p]));
  } else {
    portalReachable = false;
  }

  const partners = users.map((u) => {
    const r = bySub.get(u.id);
    // Rollup first, identity last — so the Auth0 identity (and our resolved
    // email) always wins over any null fields carried on the portal rollup.
    return {
      ...emptyRollup(),
      ...(r ?? {}),
      sub: u.id,
      name: u.name,
      email: u.email || r?.email || "",
      picture: u.picture,
    };
  });

  return NextResponse.json({ partners, portalReachable });
}
