// lib/customers-role.ts
//
// The Auth0 role that grants the Customers section (the Metakocka directory, viewing
// the portal as a customer). Preorder-admins have it implicitly (SECTION_ROLES.customers
// in lib/access.ts); this role gives it on its own. The literal default must match
// the name listed there so isPrivilegedRoleName() catches it and only super-admins
// may grant/revoke it.
export const CUSTOMERS_ADMIN_ROLE_NAME =
  process.env.NEXT_PUBLIC_CUSTOMERS_ADMIN_ROLE_NAME || "customers-admin";
