import { NextResponse } from "next/server";
import { getPortalAccess, PORTAL_SCOPE_COOKIE } from "@/lib/portal";
import { resolvePortalScope } from "@/types/portal-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/portal/accounts — the accounts the portal user may act for (their own
// partner + an agent's assigned clients) and the current scope ("all" or one id).
// POST { scope } — remember a scope. The value is only a CHOICE among the accounts
// derived server-side; every request re-validates it (resolvePortalScope).
export async function GET() {
  const access = await getPortalAccess();
  if (!access.partner) return NextResponse.json({ error: "no-account", accounts: [], scope: "all" }, { status: 404 });
  return NextResponse.json({ accounts: access.accounts, scope: access.scope });
}

export async function POST(request: Request) {
  const access = await getPortalAccess();
  if (!access.partner) return NextResponse.json({ error: "no-account" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { scope?: string };
  const scope = resolvePortalScope(body.scope, access.accounts);
  const res = NextResponse.json({ scope, accounts: access.accounts });
  res.cookies.set(PORTAL_SCOPE_COOKIE, scope, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
