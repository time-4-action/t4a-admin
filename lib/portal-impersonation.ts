import "server-only";

// "View the portal as this customer": an admin with the Preorder or Documents section
// opens /portal and sees exactly what ONE Metakocka partner would see — their
// preorders, invoices, orders — as if logged in as them.
//
// Mechanism: a signed, httpOnly cookie carrying the partner id + display name + the
// admin page to return to. lib/portal.ts getSessionPartner() honours it ONLY when the
// session actually holds an eligible admin role (the cookie alone grants nothing), so
// a customer can never impersonate anyone. Writes made while impersonating are made
// AS the customer (a submitted preorder reads exactly as if they had submitted it).

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { auth0 } from "@/lib/auth";
import { canSee, rolesFromIdToken } from "@/lib/access";

export const IMPERSONATION_COOKIE = "t4a_portal_as";
const TTL_MS = 4 * 60 * 60 * 1000; // 4 h

export type Impersonation = { partnerMkId: string; partnerName: string; returnTo: string; exp: number };

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
    const v = JSON.parse(Buffer.from(payload, "base64url").toString()) as Impersonation;
    if (!v || typeof v.partnerMkId !== "string" || !v.partnerMkId || typeof v.exp !== "number") return null;
    if (v.exp < Date.now()) return null;
    return { partnerMkId: v.partnerMkId, partnerName: String(v.partnerName ?? ""), returnTo: sanitizeReturnTo(v.returnTo), exp: v.exp };
  } catch {
    return null;
  }
}

// Only same-origin admin paths may be returned to.
function sanitizeReturnTo(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/portal") ? s : "/preorder";
}

// The roles that may view the portal as a customer.
export function canImpersonate(roles: string[]): boolean {
  return canSee(roles, "customers") || canSee(roles, "preorder") || canSee(roles, "documents");
}

// The active impersonation of THIS request, or null. Verified against the session:
// the caller must hold an eligible role right now.
export async function readImpersonation(): Promise<(Impersonation & { adminEmail: string | null }) | null> {
  const jar = await cookies();
  const v = decode(jar.get(IMPERSONATION_COOKIE)?.value);
  if (!v) return null;
  const session = await auth0.getSession();
  const roles = rolesFromIdToken(session?.tokenSet?.idToken);
  if (!canImpersonate(roles)) return null;
  return { ...v, adminEmail: session?.user?.email ?? null };
}

export async function startImpersonation(input: { partnerMkId: string; partnerName: string; returnTo?: string | null }): Promise<Impersonation> {
  const v: Impersonation = {
    partnerMkId: input.partnerMkId,
    partnerName: input.partnerName,
    returnTo: sanitizeReturnTo(input.returnTo),
    exp: Date.now() + TTL_MS,
  };
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
