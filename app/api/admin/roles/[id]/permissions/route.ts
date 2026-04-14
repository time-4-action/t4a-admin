import { getMgmtClient } from "@/lib/mgmt";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const mgmt = getMgmtClient();
    const result = await (mgmt.roles.permissions as any).list(decodeURIComponent(id));
    const data: any[] = (result as any).data ?? [];
    return NextResponse.json(data.map((p) => ({
      permission_name: p.permission_name,
      description: p.description ?? "",
      resource_server_identifier: p.resource_server_identifier,
      resource_server_name: p.resource_server_name ?? "",
    })));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to fetch permissions" }, { status: err?.statusCode ?? 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { permissions } = await req.json();
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json({ error: "permissions array required" }, { status: 400 });
    }
    const mgmt = getMgmtClient();
    await (mgmt.roles.permissions as any).add(decodeURIComponent(id), { permissions });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to add permissions" }, { status: err?.statusCode ?? 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { permissions } = await req.json();
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json({ error: "permissions array required" }, { status: 400 });
    }
    const mgmt = getMgmtClient();
    await (mgmt.roles.permissions as any).delete(decodeURIComponent(id), { permissions });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to remove permissions" }, { status: err?.statusCode ?? 500 });
  }
}
