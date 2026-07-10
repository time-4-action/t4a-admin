import { isDevRole } from "@/lib/ai-role";
import { listAllRoles, listUsersInRole } from "@/lib/auth0-mgmt";

/**
 * Returns the set of Auth0 user IDs that have the dev role.
 * Uses 2 (paginated) API calls — list roles → list role users — instead of N
 * per-user calls, and pages through every member so none are truncated.
 */
export async function getDevUserIds(): Promise<Set<string>> {
  const allRoles = await listAllRoles();
  const devRole = allRoles.find((r: any) => isDevRole(r.name));
  if (!devRole) return new Set();

  const devUsers = await listUsersInRole(devRole.id);
  return new Set(devUsers.map((u: any) => u.user_id as string));
}
