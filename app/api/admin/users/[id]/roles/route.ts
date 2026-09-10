import { getMgmtClient } from "@/lib/mgmt";
import { listAllRoles } from "@/lib/auth0-mgmt";
import { invalidateAuth0Cache } from "@/lib/auth0-cache";
import { isDevRole } from "@/lib/ai-role";
import { isSuperAdmin, isPrivilegedRoleName } from "@/lib/access";
import { getCurrentRoles, getCurrentUserId } from "@/lib/current-user";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = decodeURIComponent(id);
  const mgmt = getMgmtClient();
  const rolesPage = await mgmt.users.roles.list(userId);
  const data = (rolesPage as any).data as any[];
  return NextResponse.json(data.filter((r: any) => !isDevRole(r.name)));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { assign, remove }: { assign?: string[]; remove?: string[] } = await req.json();
  const { id } = await params;
  const userId = decodeURIComponent(id);
  const mgmt = getMgmtClient();

  // Resolve role IDs to names to filter out the dev role. Must see ALL roles —
  // the privilege-escalation guard below relies on recognizing every admin-level
  // role, so a truncated (first-page-only) list could let one slip through.
  const allRoles = assign?.length || remove?.length ? await listAllRoles() : [];
  const devRoleIds = new Set(allRoles.filter((r: any) => isDevRole(r.name)).map((r: any) => r.id));

  const safeAssign = (assign ?? []).filter((rid) => !devRoleIds.has(rid));
  const safeRemove = (remove ?? []).filter((rid) => !devRoleIds.has(rid));

  // Privilege-escalation guard: only a super-admin may grant or revoke
  // admin-level roles. Without this, an access-admin could assign "admin" to
  // themselves via this shared endpoint.
  const privilegedRoleIds = new Set(
    allRoles.filter((r: any) => isPrivilegedRoleName(r.name)).map((r: any) => r.id)
  );
  const touchesPrivileged = [...safeAssign, ...safeRemove].some((rid) =>
    privilegedRoleIds.has(rid)
  );
  if (touchesPrivileged && !isSuperAdmin(await getCurrentRoles())) {
    return NextResponse.json(
      { error: "Only an admin can assign or remove admin-level roles." },
      { status: 403 }
    );
  }

  // Self-lockout guard: a super-admin cannot remove the "admin" role from
  // themselves (it would drop them out of the portal). They must keep at least
  // their own super-admin status; another admin can revoke it instead.
  const adminRoleIds = new Set(
    allRoles.filter((r: any) => r.name?.toLowerCase() === "admin").map((r: any) => r.id)
  );
  const removingOwnAdmin =
    safeRemove.some((rid) => adminRoleIds.has(rid)) &&
    userId === (await getCurrentUserId());
  if (removingOwnAdmin) {
    return NextResponse.json(
      { error: "You can't remove your own super-admin role." },
      { status: 400 }
    );
  }

  if (safeAssign.length) {
    await mgmt.users.roles.assign(userId, { roles: safeAssign });
  }
  if (safeRemove.length) {
    await mgmt.users.roles.delete(userId, { roles: safeRemove });
  }
  if (safeAssign.length || safeRemove.length) invalidateAuth0Cache();
  return NextResponse.json({ ok: true });
}
