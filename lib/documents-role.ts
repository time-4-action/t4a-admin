// lib/documents-role.ts
//
// Role that grants access to the admin-side "Documents" browse section (view any
// customer's Metakocka offers/orders/invoices). Mirrors lib/partner-role.ts.
//
// Note: B2B *customers* hold NO role — they are identified by matching their
// login email to a Metakocka partner (see lib/metakocka.ts resolvePartnerByEmail).
// This role only gates the admin browse tool.

export const DOCUMENTS_ADMIN_ROLE_NAME =
  process.env.NEXT_PUBLIC_DOCUMENTS_ADMIN_ROLE_NAME || "documents-admin";
