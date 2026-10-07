import "server-only";

// "View as …": an admin sees the app exactly the way someone else would — their
// preorders, invoices, orders, or, for a user who holds admin roles, the admin
// sections those roles open. Two kinds of subject:
//
//   customer — ONE Metakocka partner, by partner id. Portal only. Available to any
//              admin with the Customers / Preorder / Documents section.
//   user     — ONE Auth0 user, by user id. Super-admin only. The user's Auth0 roles
//              are loaded when the view starts and become the EFFECTIVE roles of
//              every request (`effectiveRoles()`): middleware gating, the nav, the
//              home page and every role check see the impersonated user's roles.
//              A role-less user therefore gets the customer portal, resolved from
//              THEIR email exactly the way a real login is (no matching partner ⇒
//              the no-account page they would get); an admin user gets the admin
//              home with only their sections.
//
// Mechanism: a signed, httpOnly cookie carrying the subject + display name + the
// admin page to return to (lib/portal-impersonation-codec.ts). It is honoured ONLY
// when the session actually holds the role the kind requires (the cookie alone
// grants nothing), so a customer can never impersonate anyone — and because only
// a super-admin (who already sees everything) may view as a user, swapping in
// that user's roles can only ever narrow access, never widen it. Writes made
// while impersonating are made AS the subject (a submitted preorder reads exactly
// as if they had submitted it).

import { cookies } from "next/headers";
import { auth0 } from "@/lib/auth";
import { rolesFromIdToken } from "@/lib/access";
import {
  IMPERSONATION_COOKIE,
  canImpersonateKind,
  decodeImpersonation,
  encodeImpersonation,
  sanitizeReturnTo,
  type Impersonation,
} from "@/lib/portal-impersonation-codec";

export {
  IMPERSONATION_COOKIE,
  canImpersonate,
  canImpersonateKind,
  canImpersonateUser,
  effectiveRoles,
  type Impersonation,
  type ImpersonationKind,
} from "@/lib/portal-impersonation-codec";

const TTL_MS = 4 * 60 * 60 * 1000; // 4 h

function secret(): string {
  const s = process.env.AUTH0_SECRET;
  if (!s) throw new Error("AUTH0_SECRET is not set");
  return s;
}

// The active impersonation of THIS request, or null. Verified against the session:
// the caller must hold the role the kind requires right now (their REAL roles —
// the impersonated roles never decide whether the impersonation itself stands).
export async function readImpersonation(): Promise<(Impersonation & { adminEmail: string | null }) | null> {
  const jar = await cookies();
  const v = await decodeImpersonation(jar.get(IMPERSONATION_COOKIE)?.value, secret());
  if (!v) return null;
  const session = await auth0.getSession();
  const roles = rolesFromIdToken(session?.tokenSet?.idToken);
  if (!canImpersonateKind(roles, v.kind)) return null;
  return { ...v, adminEmail: session?.user?.email ?? null };
}

export async function startImpersonation(
  input:
    | { kind?: "customer"; partnerMkId: string; partnerName: string; returnTo?: string | null }
    | { kind: "user"; userId: string; email: string; name: string; roles: string[]; returnTo?: string | null },
): Promise<Impersonation> {
  const exp = Date.now() + TTL_MS;
  const v: Impersonation =
    input.kind === "user"
      ? { kind: "user", userId: input.userId, email: input.email, name: input.name, roles: input.roles, returnTo: sanitizeReturnTo(input.returnTo, "/users"), exp }
      : { kind: "customer", partnerMkId: input.partnerMkId, partnerName: input.partnerName, returnTo: sanitizeReturnTo(input.returnTo, "/preorder"), exp };
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, await encodeImpersonation(v, secret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  });
  return v;
}

export async function stopImpersonation(): Promise<void> {
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}
