import { NextResponse } from "next/server";
import { getPortalViewer } from "@/lib/portal";
import { stopImpersonation } from "@/lib/portal-impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/portal/impersonation — is this portal view an admin "viewing as"? (banner)
export async function GET() {
  const v = await getPortalViewer();
  return NextResponse.json({ impersonating: v.impersonating });
}

// DELETE — stop viewing as the customer; answers where the admin came from.
export async function DELETE() {
  const v = await getPortalViewer();
  await stopImpersonation();
  return NextResponse.json({ ok: true, redirect: v.impersonating?.returnTo ?? "/" });
}
