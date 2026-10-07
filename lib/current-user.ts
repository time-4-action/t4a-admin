// lib/current-user.ts
//
// Server-only helper to read the calling user's roles inside API route
// handlers and server components. Kept separate from lib/access.ts so the
// (server-only) auth0 client is never pulled into client bundles that import
// lib/access.ts.
import { auth0 } from "@/lib/auth";
import { rolesFromIdToken } from "@/lib/access";
import { effectiveRoles, readImpersonation } from "@/lib/portal-impersonation";

// The roles this request is judged by. While a super-admin is "viewing as" an
// Auth0 user (lib/portal-impersonation.ts) these are THAT user's roles, so every
// page, nav and API check answers exactly as it would for them. Use
// `getSessionRoles()` for the roles the signed-in person really holds.
export async function getCurrentRoles(): Promise<string[]> {
  const [session, imp] = await Promise.all([auth0.getSession(), readImpersonation()]);
  return effectiveRoles(rolesFromIdToken(session?.tokenSet?.idToken), imp);
}

// The signed-in person's own roles, impersonation ignored.
export async function getSessionRoles(): Promise<string[]> {
  const session = await auth0.getSession();
  return rolesFromIdToken(session?.tokenSet?.idToken);
}

// The calling user's Auth0 id (sub), or null if unauthenticated.
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth0.getSession();
  return (session?.user?.sub as string | undefined) ?? null;
}
