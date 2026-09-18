// What an admin is viewing the portal as (lib/portal-impersonation.ts): one
// Metakocka customer, or one Auth0 user (whose email then decides the identity).
// Client-safe — no server imports.

export type ViewingAs =
  | { kind: "customer"; partnerMkId: string; partnerName: string }
  | { kind: "user"; userId: string; email: string; name: string };

// The name to show for either kind.
export function viewingAsName(v: ViewingAs): string {
  return v.kind === "user" ? v.name || v.email : v.partnerName;
}
