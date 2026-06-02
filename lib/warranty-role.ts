// The Auth0 role whose members are offered as warranty assignees. Mirrors the
// "warranty-admin" entry in lib/access.ts SECTION_ROLES.warranty.
export const WARRANTY_ADMIN_ROLE_NAME =
  process.env.NEXT_PUBLIC_WARRANTY_ADMIN_ROLE_NAME || "warranty-admin";

export const isWarrantyAdminRole = (name: string) =>
  name.toLowerCase() === WARRANTY_ADMIN_ROLE_NAME.toLowerCase();
