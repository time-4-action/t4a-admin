// What an admin is viewing the app as (lib/portal-impersonation.ts): one
// Metakocka customer (portal only), or one Auth0 user — whose roles then decide
// what is shown (`admin`: the admin sections they hold; otherwise the portal,
// their email deciding the identity). Client-safe — no server imports.

export type ViewingAs =
  | { kind: "customer"; partnerMkId: string; partnerName: string }
  | { kind: "user"; userId: string; email: string; name: string; roles: string[]; admin: boolean };

// The name to show for either kind.
export function viewingAsName(v: ViewingAs): string {
  return v.kind === "user" ? v.name || v.email : v.partnerName;
}
