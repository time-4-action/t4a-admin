// lib/current-user.ts
//
// Server-only helper to read the calling user's roles inside API route
// handlers. Kept separate from lib/access.ts so the (server-only) auth0 client
// is never pulled into client bundles that import lib/access.ts.
import { auth0 } from "@/lib/auth";
import { rolesFromIdToken } from "@/lib/access";

export async function getCurrentRoles(): Promise<string[]> {
  const session = await auth0.getSession();
  return rolesFromIdToken(session?.tokenSet?.idToken);
}

// The calling user's Auth0 id (sub), or null if unauthenticated.
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth0.getSession();
  return (session?.user?.sub as string | undefined) ?? null;
}
