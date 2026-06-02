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
