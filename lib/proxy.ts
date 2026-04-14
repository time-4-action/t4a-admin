// lib/proxy.ts
import { auth0 } from "@/lib/auth";
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

  // Require the "admin" role — decode ID token directly (custom claims
  // are in the JWT payload but not forwarded through the userinfo endpoint)
  let roles: string[] = [];
  const idToken = session.tokenSet?.idToken;
  if (idToken) {
    try {
      const payload = JSON.parse(
        Buffer.from(idToken.split(".")[1], "base64url").toString()
      );
      roles = payload["https://time-4-action.com/roles"] ?? [];
    } catch {
      // malformed token — leave roles empty
    }
  }

  if (!roles.includes("admin")) {
    return Response.redirect(new URL("/forbidden", req.nextUrl.origin));
  }

  return res;
}
