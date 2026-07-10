// Roles for the Partners section.
//
// PARTNERS_ADMIN_ROLE_NAME — grants access to the Partners section itself
// (mirrors the "partners-admin" entry in lib/access.ts SECTION_ROLES.partners).
// It is privileged, so only a super-admin may grant/revoke it.
//
// PARTNER_ROLE_NAME — the Auth0 role that *identifies a partner*. The partner
// portal gates export access on this role (requireExportRole.js checks the
// literal "export"); the Partners list is the set of Auth0 users holding it.
export const PARTNERS_ADMIN_ROLE_NAME =
  process.env.NEXT_PUBLIC_PARTNERS_ADMIN_ROLE_NAME || "partners-admin";

export const PARTNER_ROLE_NAME =
  process.env.NEXT_PUBLIC_PARTNER_ROLE_NAME || "export";
