// The Auth0 role that grants access to the Automation section (warehouse &
// products, catalogue sync). Mirrors the "automation-admin" entry in
// lib/access.ts SECTION_ROLES.automation. It is privileged, so only a
// super-admin may grant/revoke it.
export const AUTOMATION_ADMIN_ROLE_NAME =
  process.env.NEXT_PUBLIC_AUTOMATION_ADMIN_ROLE_NAME || "automation-admin";
