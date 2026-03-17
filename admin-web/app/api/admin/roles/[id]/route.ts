import { getMgmtClient } from "@/lib/mgmt";
import { isDevRole } from "@/lib/ai-role";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const mgmt = getMgmtClient();
    const roleId = decodeURIComponent(id);
    const { data: role } = await mgmt.roles.get(roleId);
    if (isDevRole((role as any).name)) {
      return NextResponse.json({ error: "This role cannot be modified." }, { status: 403 });
    }
    await mgmt.roles.delete(roleId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[DELETE /api/admin/roles]", err);
    const status = err?.statusCode ?? 500;
    return NextResponse.json({ error: err?.body?.message ?? err?.message ?? "Failed to delete role" }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { name, description } = await req.json();
    const mgmt = getMgmtClient();
    const roleId = decodeURIComponent(id);
    const { data: role } = await mgmt.roles.get(roleId);
    if (isDevRole((role as any).name)) {
      return NextResponse.json({ error: "This role cannot be modified." }, { status: 403 });
    }
    if (name && isDevRole(name)) {
      return NextResponse.json({ error: "This role name is reserved." }, { status: 400 });
    }
    const { data } = await mgmt.roles.update(roleId, { name, description });
    return NextResponse.json({ id: (data as any).id, name: (data as any).name, description: (data as any).description ?? "" });
  } catch (err: any) {
    console.error("[PATCH /api/admin/roles]", err);
    const status = err?.statusCode ?? 500;
    return NextResponse.json({ error: err?.body?.message ?? err?.message ?? "Failed to update role" }, { status });
  }
}
