import { getMgmtClient } from "@/lib/mgmt";

export type RoleUser = {
  id: string;
  name: string;
  email: string;
  picture?: string;
};

/**
 * Returns the users that hold the named Auth0 role, sorted by display name.
 * Uses 2 API calls (list roles → list role users) regardless of user count —
 * the same pattern as lib/dev-users.ts.
 *
 * Returns [] if no role with that name exists.
 */
export async function getUsersWithRole(roleName: string): Promise<RoleUser[]> {
  const mgmt = getMgmtClient();
  const wanted = roleName.toLowerCase();
  const allRoles = ((await mgmt.roles.list()) as any).data as any[];
  const role = allRoles.find((r: any) => r.name?.toLowerCase() === wanted);
  if (!role) return [];

  const users = ((await mgmt.roles.users.list(role.id)) as any).data as any[];
  return users
    .map((u: any) => ({
      id: u.user_id as string,
      name: (u.name as string) || (u.email as string) || (u.user_id as string),
      email: (u.email as string) ?? "",
      picture: u.picture as string | undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns a single user holding the named role, by Auth0 user id (sub), or null.
 * Reuses {@link getUsersWithRole} so the identity matches the Partners list
 * exactly (same name/email/picture resolution) — avoids a separate
 * `users.get` call whose result shape/scopes can differ.
 */
export async function getRoleUser(
  roleName: string,
  userId: string,
): Promise<RoleUser | null> {
  const users = await getUsersWithRole(roleName);
  return users.find((u) => u.id === userId) ?? null;
}
