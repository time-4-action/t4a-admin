// lib/access.ts
//
// Single source of truth for section-level access control.
//
// Each admin user holds one or more Auth0 roles. "admin" is the super-admin
// that sees everything; the per-section roles below grant access to only their
// own section. Add a user to "warranty-admin" and they see only Warranty, etc.
//
// Three consumers share this file:
//   - lib/proxy.ts (middleware) — server-side route gate (the real security).
//   - components/nav.tsx        — hides menu sections the user cannot enter.
//   - app/page.tsx              — home page only shows allowed sections.

export const SECTION_ROLES = {
  general: ["admin", "user-admin"],
  access: ["admin", "access-admin"],
  ai: ["admin", "ai-admin"],
  warranty: ["admin", "warranty-admin"],
  partners: ["admin", "partners-admin"],
  automation: ["admin", "automation-admin"],
  builder: ["admin", "builder-admin"],
  documents: ["admin", "documents-admin"],
  preorder: ["admin", "preorder-admin"],
  system: ["admin"],
} as const;

export type SectionKey = keyof typeof SECTION_ROLES;

// Custom claim that carries the user's roles inside the Auth0 ID token.
// The userinfo endpoint does not forward custom claims, so we decode the JWT.
export const ROLE_CLAIM = "https://time-4-action.com/roles";

// Every role that grants any admin access at all.
export const ALL_ADMIN_ROLES: string[] = [
  ...new Set(Object.values(SECTION_ROLES).flat()),
];

export function rolesFromIdToken(idToken?: string | null): string[] {
  if (!idToken) return [];
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString()
    );
    return payload[ROLE_CLAIM] ?? [];
  } catch {
    return [];
  }
}

export function hasAnyAccess(roles: string[]): boolean {
  return roles.some((r) => ALL_ADMIN_ROLES.includes(r));
}

export function canSee(roles: string[], section: SectionKey): boolean {
  return SECTION_ROLES[section].some((r) => roles.includes(r));
}

// Only the super-admin may grant or revoke admin-level roles.
export function isSuperAdmin(roles: string[]): boolean {
  return roles.includes("admin");
}

// A role is "privileged" if holding it grants any admin-portal access. These
// roles may only be assigned/removed by a super-admin — otherwise an
// access-admin could grant themselves "admin" and escalate. Matched by name so
// a freshly-created role with one of these names is caught too.
export function isPrivilegedRoleName(name: string): boolean {
  return ALL_ADMIN_ROLES.includes(name);
}

// Maps a request path to the section that guards it. Pages and the clearly
// section-specific API routes are listed; shared endpoints (e.g.
// /api/admin/users, used by Users / Assign Access / AI Access alike) are left
// unmapped so any admin role may call them — page gating already hides them.
// Order is most-specific-first.
export const ROUTE_RULES: { prefix: string; section: SectionKey }[] = [
  // Access-management pages are STRICT super-admin only — mapped to the
  // admin-only "system" section. These must precede the broader section
  // prefixes below so the more-specific /<section>/access path wins.
  { prefix: "/roles/super-admins", section: "system" },
  { prefix: "/ai/access", section: "system" },
  { prefix: "/warranty/access", section: "system" },
  { prefix: "/partners/access", section: "system" },
  { prefix: "/automation/access", section: "system" },
  { prefix: "/builder/access", section: "system" },
  { prefix: "/documents/access", section: "system" },
  { prefix: "/preorder/access", section: "system" },
  // pages
  { prefix: "/warranty", section: "warranty" },
  { prefix: "/partners", section: "partners" },
  { prefix: "/automation", section: "automation" },
  { prefix: "/builder", section: "builder" },
  { prefix: "/documents", section: "documents" },
  { prefix: "/preorder", section: "preorder" },
  { prefix: "/roles", section: "access" },
  { prefix: "/ai", section: "ai" },
  { prefix: "/users", section: "general" },
  { prefix: "/settings", section: "system" },
  // section-specific API routes
  { prefix: "/api/builder", section: "builder" },
  { prefix: "/api/warranty", section: "warranty" },
  { prefix: "/api/partners", section: "partners" },
  { prefix: "/api/automation", section: "automation" },
  { prefix: "/api/admin/documents", section: "documents" },
  { prefix: "/api/admin/preorder", section: "preorder" },
  { prefix: "/api/admin/roles", section: "access" },
  { prefix: "/api/admin/resource-servers", section: "access" },
  { prefix: "/api/admin/stats", section: "ai" },
  { prefix: "/api/admin/usage", section: "ai" },
];

export function sectionForPath(pathname: string): SectionKey | null {
  const rule = ROUTE_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/")
  );
  return rule ? rule.section : null;
}

// The B2B customer portal. These paths are open to ANY authenticated user (they
// are not admin-gated): a customer's identity is their email, matched to a
// Metakocka partner inside the portal itself. Not listed in ROUTE_RULES.
export function isPortalPath(pathname: string): boolean {
  return (
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/api/portal" ||
    pathname.startsWith("/api/portal/")
  );
}
