// lib/preorder-role.ts
//
// The Auth0 role that grants access to the Preorder section. The literal default
// ("preorder-admin") must match the name listed in SECTION_ROLES.preorder in
// lib/access.ts, so isPrivilegedRoleName() catches it and only super-admins may
// grant/revoke it.
export const PREORDER_ADMIN_ROLE_NAME =
  process.env.NEXT_PUBLIC_PREORDER_ADMIN_ROLE_NAME || "preorder-admin";
