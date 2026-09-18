import { NextResponse } from "next/server";
import { getCurrentRoles } from "@/lib/current-user";
import { canImpersonate, canImpersonateUser, startImpersonation } from "@/lib/portal-impersonation";
import { getMkCustomer } from "@/lib/mk-customers";
import { getPartnerById } from "@/lib/metakocka";
import { getMgmtClient } from "@/lib/mgmt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/portal/impersonate — start viewing the portal as someone else.
//   { partnerMkId, returnTo? } — as this customer. Preorder- and documents-admins.
//   { userId, returnTo? }      — as this Auth0 user (their email decides the portal
//                                identity, like a real login). Super-admins only.
// Responds with where to go next.
export async function POST(request: Request) {
  const roles = await getCurrentRoles();
  const body = (await request.json().catch(() => ({}))) as { partnerMkId?: string; userId?: string; returnTo?: string };

  const userId = (body.userId ?? "").trim();
  if (userId) {
    if (!canImpersonateUser(roles)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    let user: { email?: string; name?: string } | null = null;
    try {
      user = (await getMgmtClient().users.get(userId)) as { email?: string; name?: string };
    } catch {
      user = null;
    }
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!user.email) return NextResponse.json({ error: "This user has no email — the portal identity is the email" }, { status: 422 });
    const v = await startImpersonation({ kind: "user", userId, email: user.email, name: user.name ?? user.email, returnTo: body.returnTo ?? null });
    return NextResponse.json({ ok: true, kind: "user", userId, email: user.email, name: v.kind === "user" ? v.name : null, redirect: "/portal/invoices" });
  }

  if (!canImpersonate(roles)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const partnerMkId = (body.partnerMkId ?? "").trim();
  if (!partnerMkId) return NextResponse.json({ error: "partnerMkId or userId required" }, { status: 400 });
  // Confirm the partner exists (directory first, MK as the fallback) and take its name.
  const directory = await getMkCustomer(partnerMkId);
  const name = directory?.name ?? (await getPartnerById(partnerMkId))?.name;
  if (!name) return NextResponse.json({ error: "Partner not found in Metakocka" }, { status: 404 });
  await startImpersonation({ partnerMkId, partnerName: name, returnTo: body.returnTo ?? null });
  return NextResponse.json({ ok: true, kind: "customer", partnerMkId, partnerName: name, redirect: "/portal/preorders" });
}
