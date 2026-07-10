import { getMgmtClient } from "@/lib/mgmt";
import { listAllRoles } from "@/lib/auth0-mgmt";
import { invalidateAuth0Cache } from "@/lib/auth0-cache";
import { isDevRole } from "@/lib/ai-role";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const roles = (await listAllRoles())
      .filter((r: any) => !isDevRole(r.name))
      .map((r: any) => ({ id: r.id, name: r.name, description: r.description ?? "" }));
    return NextResponse.json(roles);
  } catch (err: any) {
    console.error("[GET /api/admin/roles]", err);
    return NextResponse.json({ error: err?.message ?? "Failed to fetch roles" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, description } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    if (isDevRole(name.trim())) return NextResponse.json({ error: "This role name is reserved." }, { status: 400 });
    const mgmt = getMgmtClient();
    const data = await mgmt.roles.create({ name: name.trim(), description: description?.trim() ?? "" });
    invalidateAuth0Cache();
    return NextResponse.json({ id: (data as any).id, name: (data as any).name, description: (data as any).description ?? "" }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/admin/roles]", err);
    const status = err?.statusCode ?? 500;
    return NextResponse.json({ error: err?.body?.message ?? err?.message ?? "Failed to create role" }, { status });
  }
}
