// lib/proxy.ts
import { auth0 } from "@/lib/auth";
import {
  rolesFromIdToken,
  hasAnyAccess,
  sectionForPath,
  canSee,
  isPortalPath,
} from "@/lib/access";
import type { NextRequest } from "next/server";
import { IMPERSONATION_COOKIE, decodeImpersonation, effectiveRoles } from "@/lib/portal-impersonation-codec";

export async function proxy(req: NextRequest) {
  const res = await auth0.middleware(req);

  const isAuthRoute = req.nextUrl.pathname.startsWith("/auth");
  if (isAuthRoute) return res;

  const isPublicPage =
    req.nextUrl.pathname === "/forbidden" ||
    req.nextUrl.pathname === "/unauthorized";
  if (isPublicPage) return res;

  const session = await auth0.getSession(req);
  if (!session) {
    const pathname = req.nextUrl.pathname;
    // The B2B portal has a public landing page: a logged-out visitor should
    // learn what they are signing in for (preorders, orders, invoices) instead
    // of being thrown straight at Auth0. Deep links (invite links, bookmarked
    // documents) go to the landing too, carrying the destination so the sign-in
    // button returns there.
    if (pathname === "/portal") return res;
    // The app root is the admin home, but a stranger landing on the bare domain
    // is far more likely a customer: show them the B2B landing, not Auth0.
    if (pathname === "/") return Response.redirect(new URL("/portal", req.nextUrl.origin));
    if (isPortalPath(pathname) && !pathname.startsWith("/api/")) {
      const landing = new URL("/portal", req.nextUrl.origin);
      landing.searchParams.set("returnTo", pathname + req.nextUrl.search);
      return Response.redirect(landing);
    }
    const loginUrl = new URL("/auth/login", req.nextUrl.origin);
    loginUrl.searchParams.set("returnTo", pathname);
    return Response.redirect(loginUrl);
  }

  // Decode roles from the ID token directly (custom claims are in the JWT
  // payload but not forwarded through the userinfo endpoint).
  // A super-admin "viewing as" an Auth0 user (lib/portal-impersonation.ts) is
  // gated by THAT user's roles — the same rule every page and API applies — so
  // they hit /forbidden or the portal exactly where that user would.
  const sessionRoles = rolesFromIdToken(session.tokenSet?.idToken);
  const roles = effectiveRoles(sessionRoles, await readImpersonationCookie(req));
  const admin = hasAnyAccess(roles);

  // The B2B customer portal is open to any authenticated user. A customer holds
  // no role — their identity is the session email, matched to a Metakocka
  // partner inside the portal (unmatched → /portal/no-account).
  if (isPortalPath(req.nextUrl.pathname)) {
    return res;
  }

  // No admin role of any kind — this is a customer. Send them to their portal
  // instead of bouncing to /forbidden.
  if (!admin) {
    return Response.redirect(new URL("/portal", req.nextUrl.origin));
  }

  // Admin, but lacks the role this specific section requires.
  const section = sectionForPath(req.nextUrl.pathname);
  if (section && !canSee(roles, section)) {
    return Response.redirect(new URL("/forbidden", req.nextUrl.origin));
  }

  return res;
}

async function readImpersonationCookie(req: NextRequest) {
  const raw = req.cookies.get(IMPERSONATION_COOKIE)?.value;
  const secret = process.env.AUTH0_SECRET;
  if (!raw || !secret) return null;
  return decodeImpersonation(raw, secret);
}
