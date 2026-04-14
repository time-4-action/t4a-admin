import { getMgmtClient } from "@/lib/mgmt";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const mgmt = getMgmtClient();
    const result = await (mgmt.resourceServers as any).list();
    const data: any[] = (result as any).data ?? [];
    console.log("[resource-servers] raw count:", data.length, "first item keys:", data[0] ? Object.keys(data[0]) : []);
    const servers = data
      .filter((s) => s.identifier === "https://api.time-4-action.com")
      .map((s) => ({
        id: s.id,
        name: s.name ?? s.identifier,
        identifier: s.identifier,
        // Auth0 SDK may return `scopes` or `scope` depending on version
        scopes: (s.scopes ?? s.scope ?? []).map((sc: any) => ({
          value: sc.value,
          description: sc.description ?? "",
        })),
      }));
    console.log("[resource-servers] returning:", servers.map(s => ({ name: s.name, scopeCount: s.scopes.length })));
    return NextResponse.json(servers);
  } catch (err: any) {
    console.error("[resource-servers] error:", err?.statusCode, err?.message, err?.body);
    return NextResponse.json({ error: err?.message ?? "Failed to fetch APIs" }, { status: err?.statusCode ?? 500 });
  }
}
