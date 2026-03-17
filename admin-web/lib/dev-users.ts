import { getMgmtClient } from "@/lib/mgmt";
import { isDevRole } from "@/lib/ai-role";

/**
 * Returns the set of Auth0 user IDs that have the dev role.
 * Uses 2 API calls (list roles → list role users) instead of N per-user calls.
 */
export async function getDevUserIds(): Promise<Set<string>> {
  const mgmt = getMgmtClient();
  const { data: allRoles } = await mgmt.roles.list();
  const devRole = (allRoles ?? []).find((r: any) => isDevRole(r.name));
  if (!devRole) return new Set();

  const { data: devUsers } = await mgmt.roles.users.list(devRole.id);
  return new Set((devUsers ?? []).map((u: any) => u.user_id as string));
}
