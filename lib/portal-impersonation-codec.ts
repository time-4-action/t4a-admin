// The signed "viewing as" cookie: encoding, verification and the subject types.
//
// Kept free of `next/headers` / Node-only crypto so the middleware (edge runtime,
// lib/proxy.ts) can verify the cookie with the same code the server components
// and route handlers use (lib/portal-impersonation.ts). HMAC-SHA256 over the
// base64url payload via Web Crypto, which exists in both runtimes.

import { canSee, isSuperAdmin } from "@/lib/access";

export const IMPERSONATION_COOKIE = "t4a_portal_as";

export type ImpersonationKind = "customer" | "user";

export type Impersonation =
  | { kind: "customer"; partnerMkId: string; partnerName: string; returnTo: string; exp: number }
  | {
      kind: "user";
      userId: string;
      email: string;
      name: string;
      // The user's Auth0 roles at the moment the view started. They decide what
      // the app shows: an admin user gets the admin sections they hold, a
      // role-less user gets the customer portal — exactly as a real login would.
      roles: string[];
      returnTo: string;
      exp: number;
    };

// The roles that may view the portal as a customer.
export function canImpersonate(roles: string[]): boolean {
  return canSee(roles, "customers") || canSee(roles, "preorder") || canSee(roles, "documents");
}

// The roles that may view the app as another Auth0 user: super-admins only —
// it means seeing the portal through anyone's email, admins included.
export function canImpersonateUser(roles: string[]): boolean {
  return isSuperAdmin(roles);
}

export function canImpersonateKind(roles: string[], kind: ImpersonationKind): boolean {
  return kind === "user" ? canImpersonateUser(roles) : canImpersonate(roles);
}

// The roles a request should be judged by: the impersonated user's while a
// super-admin views as a user, otherwise the session's own. The one rule shared
// by the middleware (lib/proxy.ts) and every server-side role read
// (lib/current-user.ts getCurrentRoles). Only a super-admin — who already holds
// every section — may view as a user, so the swap can only narrow access.
export function effectiveRoles(sessionRoles: string[], imp: Impersonation | null): string[] {
  if (imp?.kind === "user" && canImpersonateUser(sessionRoles)) return imp.roles;
  return sessionRoles;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(payload: string, secret: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payload));
  return Buffer.from(sig).toString("base64url");
}

export async function encodeImpersonation(v: Impersonation, secret: string): Promise<string> {
  const payload = Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${payload}.${await sign(payload, secret)}`;
}

export async function decodeImpersonation(raw: string | undefined, secret: string): Promise<Impersonation | null> {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const want = await sign(payload, secret);
  if (!constantTimeEqual(sig, want)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
    if (!v || typeof v.exp !== "number" || v.exp < Date.now()) return null;
    const exp = v.exp;
    if (v.kind === "user") {
      if (typeof v.userId !== "string" || !v.userId || typeof v.email !== "string" || !v.email) return null;
      const roles = Array.isArray(v.roles) ? v.roles.filter((r): r is string => typeof r === "string") : [];
      return { kind: "user", userId: v.userId, email: v.email, name: String(v.name ?? ""), roles, returnTo: sanitizeReturnTo(v.returnTo, "/users"), exp };
    }
    // Cookies written before the `kind` field existed carry a customer subject.
    if (typeof v.partnerMkId !== "string" || !v.partnerMkId) return null;
    return { kind: "customer", partnerMkId: v.partnerMkId, partnerName: String(v.partnerName ?? ""), returnTo: sanitizeReturnTo(v.returnTo, "/preorder"), exp };
  } catch {
    return null;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Only same-origin admin paths may be returned to.
export function sanitizeReturnTo(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/portal") ? s : fallback;
}
