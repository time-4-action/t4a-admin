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
    const loginUrl = new URL("/auth/login", req.nextUrl.origin);
    loginUrl.searchParams.set("returnTo", req.nextUrl.pathname);
    return Response.redirect(loginUrl);
  }

  // Decode roles from the ID token directly (custom claims are in the JWT
  // payload but not forwarded through the userinfo endpoint).
  const roles = rolesFromIdToken(session.tokenSet?.idToken);
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
