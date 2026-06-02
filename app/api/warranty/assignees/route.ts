import { NextResponse } from "next/server";
import { getUsersWithRole } from "@/lib/role-users";
import { WARRANTY_ADMIN_ROLE_NAME } from "@/lib/warranty-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lives under /api/warranty/* so it is gated to the "warranty" section
// (lib/access.ts ROUTE_RULES). A warranty-admin is NOT an access-admin, so this
// must NOT live under /api/admin/roles/* or they would be 403'd.
export async function GET() {
  try {
    const users = await getUsersWithRole(WARRANTY_ADMIN_ROLE_NAME);
    return NextResponse.json(users);
  } catch (err: any) {
    console.error("[GET /api/warranty/assignees]", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to fetch assignees" },
      { status: 500 },
    );
  }
}
