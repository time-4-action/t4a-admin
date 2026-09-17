import { NextResponse } from "next/server";
import { getCurrentRoles } from "@/lib/current-user";
import { canImpersonate, startImpersonation } from "@/lib/portal-impersonation";
import { getMkCustomer } from "@/lib/mk-customers";
import { getPartnerById } from "@/lib/metakocka";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/portal/impersonate { partnerMkId, returnTo? } — start viewing the
// portal as this customer. Preorder- and documents-admins only. Responds with where
// to go next (/portal).
export async function POST(request: Request) {
  const roles = await getCurrentRoles();
  if (!canImpersonate(roles)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { partnerMkId?: string; returnTo?: string };
  const partnerMkId = (body.partnerMkId ?? "").trim();
  if (!partnerMkId) return NextResponse.json({ error: "partnerMkId required" }, { status: 400 });
  // Confirm the partner exists (directory first, MK as the fallback) and take its name.
  const directory = await getMkCustomer(partnerMkId);
  const name = directory?.name ?? (await getPartnerById(partnerMkId))?.name;
  if (!name) return NextResponse.json({ error: "Partner not found in Metakocka" }, { status: 404 });
  const v = await startImpersonation({ partnerMkId, partnerName: name, returnTo: body.returnTo ?? null });
  return NextResponse.json({ ok: true, partnerMkId: v.partnerMkId, partnerName: v.partnerName, redirect: "/portal/preorders" });
}
