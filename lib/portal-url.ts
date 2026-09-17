// lib/portal-url.ts
//
// The public origin of the B2B customer portal. Invite links handed to customers
// must point here — not at whatever host the admin happens to be using (the admin
// UI and the portal are one deployment, but customers know it by this domain).
export const PORTAL_BASE_URL = (process.env.PORTAL_BASE_URL || "https://b2b.time-4-action.com").replace(/\/+$/, "");

export function portalUrl(path: string): string {
  return `${PORTAL_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
