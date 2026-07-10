// lib/auth0-mgmt.ts
//
// Paginated, rate-limit-friendly helpers over the Auth0 Management API (v5 SDK).
//
// Two problems these solve, shared by every page that lists users/roles:
//
//   1. The v5 list endpoints return a `Page` — only the FIRST page of results
//      (users/roles default to 50 per page, role members to a 50-item checkpoint
//      "take"). Reading `.data` once silently drops everyone past that first
//      page. The Page object knows how to fetch the rest (offset paging for
//      users/roles, checkpoint/cursor paging for role members); iterating it
//      with `for await` drains every page. We must NOT force `include_totals`
//      off — the SDK's item extractor reads `response.users` / `response.roles`,
//      which only exist when totals are included (the default).
//
//   2. Fetching each user's roles with a per-user call (N calls for N users) hits
//      the Management API's rate limit the moment there are more than a handful
//      of users: the SDK retries with backoff (slow) and, once retries are
//      exhausted, the caller is left with missing data. `getRolesByUserId`
//      inverts the query — it walks the (few) roles instead, so the number of
//      calls scales with role count, not user count.

import { getMgmtClient } from "@/lib/mgmt";

// Drains an Auth0 v5 `Page` (any endpoint's pagination scheme) into one array.
async function drain<T>(page: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const item of page) all.push(item);
  return all;
}

// Runs `fn` over `items` with at most `limit` in flight at once — keeps the
// inverted role walk from bursting the whole role list at Auth0 concurrently.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/** Every Auth0 user, across all pages (offset paging, 100 per request). */
export async function listAllUsers(): Promise<any[]> {
  const mgmt = getMgmtClient();
  return drain((await mgmt.users.list({ per_page: 100 })) as AsyncIterable<any>);
}

/** Every Auth0 role, across all pages (offset paging, 100 per request). */
export async function listAllRoles(): Promise<any[]> {
  const mgmt = getMgmtClient();
  return drain((await mgmt.roles.list({ per_page: 100 })) as AsyncIterable<any>);
}

/** Every user holding the given role id, across all pages (checkpoint paging). */
export async function listUsersInRole(roleId: string): Promise<any[]> {
  const mgmt = getMgmtClient();
  return drain(
    (await mgmt.roles.users.list(roleId, { take: 100 })) as AsyncIterable<any>,
  );
}

/**
 * Builds a `userId -> role names` map by walking roles (not users), so the
 * number of Management API calls scales with role count instead of user count.
 * Also returns the raw role list so callers can avoid a second `roles.list`.
 */
export async function getRolesByUserId(): Promise<{
  rolesByUser: Map<string, string[]>;
  roles: any[];
}> {
  const roles = await listAllRoles();
  const rolesByUser = new Map<string, string[]>();

  await mapLimit(roles, 4, async (role: any) => {
    const members = await listUsersInRole(role.id);
    for (const u of members) {
      const arr = rolesByUser.get(u.user_id);
      if (arr) arr.push(role.name);
      else rolesByUser.set(u.user_id, [role.name]);
    }
  });

  return { rolesByUser, roles };
}
