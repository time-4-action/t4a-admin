import "server-only";

// "View the portal as …": an admin opens /portal and sees exactly what someone
// else would see — their preorders, invoices, orders — as if logged in as them.
// Two kinds of subject:
//
//   customer — ONE Metakocka partner, by partner id. Available to any admin with
//              the Customers / Preorder / Documents section.
//   user     — ONE Auth0 user (e.g. another admin), by user id. The portal is then
//              resolved from THAT user's email, exactly the way it is for a real
//              login (no matching partner ⇒ the no-account page they would get).
//              Super-admin only.
//
// Mechanism: a signed, httpOnly cookie carrying the subject + display name + the
// admin page to return to. lib/portal.ts getSessionPartner() honours it ONLY when
// the session actually holds the role the kind requires (the cookie alone grants
// nothing), so a customer can never impersonate anyone. Writes made while
// impersonating are made AS the subject (a submitted preorder reads exactly as if
// they had submitted it).

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { auth0 } from "@/lib/auth";
import { canSee, isSuperAdmin, rolesFromIdToken } from "@/lib/access";

export const IMPERSONATION_COOKIE = "t4a_portal_as";
const TTL_MS = 4 * 60 * 60 * 1000; // 4 h

export type ImpersonationKind = "customer" | "user";

export type Impersonation =
  | { kind: "customer"; partnerMkId: string; partnerName: string; returnTo: string; exp: number }
  | { kind: "user"; userId: string; email: string; name: string; returnTo: string; exp: number };

function secret(): string {
  const s = process.env.AUTH0_SECRET;
  if (!s) throw new Error("AUTH0_SECRET is not set");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(v: Impersonation): string {
  const payload = Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(raw: string | undefined): Impersonation | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const want = sign(payload);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
    if (!v || typeof v.exp !== "number" || v.exp < Date.now()) return null;
    const exp = v.exp;
    if (v.kind === "user") {
      if (typeof v.userId !== "string" || !v.userId || typeof v.email !== "string" || !v.email) return null;
      return { kind: "user", userId: v.userId, email: v.email, name: String(v.name ?? ""), returnTo: sanitizeReturnTo(v.returnTo, "/users"), exp };
    }
    // Cookies written before the `kind` field existed carry a customer subject.
    if (typeof v.partnerMkId !== "string" || !v.partnerMkId) return null;
    return { kind: "customer", partnerMkId: v.partnerMkId, partnerName: String(v.partnerName ?? ""), returnTo: sanitizeReturnTo(v.returnTo, "/preorder"), exp };
  } catch {
    return null;
  }
}

// Only same-origin admin paths may be returned to.
function sanitizeReturnTo(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/portal") ? s : fallback;
}

// The roles that may view the portal as a customer.
export function canImpersonate(roles: string[]): boolean {
  return canSee(roles, "customers") || canSee(roles, "preorder") || canSee(roles, "documents");
}

// The roles that may view the portal as another Auth0 user: super-admins only —
// it means seeing the portal through anyone's email, admins included.
export function canImpersonateUser(roles: string[]): boolean {
  return isSuperAdmin(roles);
}

export function canImpersonateKind(roles: string[], kind: ImpersonationKind): boolean {
  return kind === "user" ? canImpersonateUser(roles) : canImpersonate(roles);
}

// The active impersonation of THIS request, or null. Verified against the session:
// the caller must hold the role the kind requires right now.
export async function readImpersonation(): Promise<(Impersonation & { adminEmail: string | null }) | null> {
  const jar = await cookies();
  const v = decode(jar.get(IMPERSONATION_COOKIE)?.value);
  if (!v) return null;
  const session = await auth0.getSession();
  const roles = rolesFromIdToken(session?.tokenSet?.idToken);
  if (!canImpersonateKind(roles, v.kind)) return null;
  return { ...v, adminEmail: session?.user?.email ?? null };
}

export async function startImpersonation(
  input:
    | { kind?: "customer"; partnerMkId: string; partnerName: string; returnTo?: string | null }
    | { kind: "user"; userId: string; email: string; name: string; returnTo?: string | null },
): Promise<Impersonation> {
  const exp = Date.now() + TTL_MS;
  const v: Impersonation =
    input.kind === "user"
      ? { kind: "user", userId: input.userId, email: input.email, name: input.name, returnTo: sanitizeReturnTo(input.returnTo, "/users"), exp }
      : { kind: "customer", partnerMkId: input.partnerMkId, partnerName: input.partnerName, returnTo: sanitizeReturnTo(input.returnTo, "/preorder"), exp };
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, encode(v), {
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
