import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { getMkCustomer, refreshMkCustomer, toMkCustomerView, updateMkCustomerManual } from "@/lib/mk-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ partnerMkId: string }> };

// GET /api/admin/preorder/customers/[partnerMkId] — one directory record.
export async function GET(_req: Request, { params }: RouteParams) {
  const { partnerMkId } = await params;
  const doc = await getMkCustomer(decodeURIComponent(partnerMkId));
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ customer: toMkCustomerView(doc) });
}

// PATCH — admin-owned fields: { manualGeo: {lat,lng} | null, countryIsoManual: "SI" | null }
export async function PATCH(request: Request, { params }: RouteParams) {
  const { partnerMkId } = await params;
  const body = (await request.json().catch(() => ({}))) as { manualGeo?: { lat?: number; lng?: number } | null; countryIsoManual?: string | null };
  const patch: Parameters<typeof updateMkCustomerManual>[1] = {};
  if ("manualGeo" in body) {
    if (body.manualGeo == null) patch.manualGeo = null;
    else {
      const lat = Number(body.manualGeo.lat);
      const lng = Number(body.manualGeo.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
      }
      patch.manualGeo = { lat, lng };
    }
  }
  if ("countryIsoManual" in body) patch.countryIsoManual = body.countryIsoManual ?? null;
  const session = await auth0.getSession();
  const doc = await updateMkCustomerManual(decodeURIComponent(partnerMkId), patch, session?.user?.email ?? null);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ customer: toMkCustomerView(doc) });
}

// POST — re-read this partner from Metakocka.
export async function POST(_req: Request, { params }: RouteParams) {
  const { partnerMkId } = await params;
  const doc = await refreshMkCustomer(decodeURIComponent(partnerMkId));
  if (!doc) return NextResponse.json({ error: "Partner not found in Metakocka" }, { status: 404 });
  return NextResponse.json({ customer: toMkCustomerView(doc) });
}
