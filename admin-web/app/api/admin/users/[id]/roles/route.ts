import { getMgmtClient } from "@/lib/mgmt";
import { isDevRole } from "@/lib/ai-role";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = decodeURIComponent(id);
  const mgmt = getMgmtClient();
  const { data } = await mgmt.users.roles.list(userId);
  return NextResponse.json((data ?? []).filter((r: any) => !isDevRole(r.name)));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { assign, remove }: { assign?: string[]; remove?: string[] } = await req.json();
  const { id } = await params;
  const userId = decodeURIComponent(id);
  const mgmt = getMgmtClient();

  // Resolve role IDs to names to filter out the dev role
  const allRoles = assign?.length || remove?.length
    ? await mgmt.roles.list().then((p) => p.data ?? [])
    : [];
  const devRoleIds = new Set(allRoles.filter((r: any) => isDevRole(r.name)).map((r: any) => r.id));

  const safeAssign = (assign ?? []).filter((rid) => !devRoleIds.has(rid));
  const safeRemove = (remove ?? []).filter((rid) => !devRoleIds.has(rid));

  if (safeAssign.length) {
    await mgmt.users.roles.assign(userId, { roles: safeAssign });
  }
  if (safeRemove.length) {
    await mgmt.users.roles.delete(userId, { roles: safeRemove });
  }
  return NextResponse.json({ ok: true });
}
