import { NextResponse } from "next/server";
import { grantCampaignAccess, revokeCampaignAccess } from "@/lib/preorder-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string; partnerMkId: string }> };

// Admin-side campaign access for ONE customer — the same grant the invite link
// creates (models/preorder-access.ts), given by hand. Logic: lib/preorder-admin.ts.

// POST — unlock the campaign for this customer (idempotent).
export async function POST(_req: Request, { params }: RouteParams) {
  const { id, partnerMkId: raw } = await params;
  const res = await grantCampaignAccess(id, decodeURIComponent(raw));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, access: true });
}

// DELETE — take the access away again. Refused once the customer has a preorder
// (a submission carries access by itself; unlock / delete the preorder first).
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id, partnerMkId: raw } = await params;
  const res = await revokeCampaignAccess(id, decodeURIComponent(raw));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, access: false });
}
