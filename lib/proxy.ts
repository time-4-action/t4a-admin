// lib/proxy.ts
import { auth0 } from "@/lib/auth";
import {
  rolesFromIdToken,
  hasAnyAccess,
  sectionForPath,
  canSee,
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

  // No admin role of any kind — not allowed into the portal at all.
  if (!hasAnyAccess(roles)) {
    return Response.redirect(new URL("/forbidden", req.nextUrl.origin));
  }

  // Has some access, but lacks the role this specific section requires.
  const section = sectionForPath(req.nextUrl.pathname);
  if (section && !canSee(roles, section)) {
    return Response.redirect(new URL("/forbidden", req.nextUrl.origin));
  }

  return res;
}
