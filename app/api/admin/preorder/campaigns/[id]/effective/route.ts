import { NextResponse, type NextRequest } from "next/server";
import { connectDB, PreorderCampaign, toObjectId, loadEffectiveCampaignForPartner } from "@/lib/preorder";
import { getPartnerById } from "@/lib/metakocka";
import { getMkCustomer, effectiveCountryIso, upsertMkCustomer, customerKind } from "@/lib/mk-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/preorder/campaigns/[id]/effective?partnerMkId= — the campaign exactly
// as ONE partner sees it (admin preview / "fill for customer"). Uses the directory
// record when present (no MK call); falls back to a live partner read.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const partnerMkId = req.nextUrl.searchParams.get("partnerMkId")?.trim() ?? "";
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!partnerMkId) return NextResponse.json({ error: "partnerMkId required" }, { status: 400 });
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  let directory = await getMkCustomer(partnerMkId);
  let mk = null;
  if (!directory) {
    mk = await getPartnerById(partnerMkId);
    if (mk) {
      await upsertMkCustomer(mk);
      directory = await getMkCustomer(partnerMkId);
    }
  }
  const effective = await loadEffectiveCampaignForPartner(doc, {
    mkId: partnerMkId,
    countryIso: directory ? effectiveCountryIso(directory) : null,
    countrySource: directory?.countryIsoManual ? "manual" : directory?.countrySource ?? null,
    kind: directory ? customerKind(directory) : mk ? customerKind(mk) : null,
    mk,
  });
  return NextResponse.json({
    campaign: effective,
    partner: directory ? { mkId: directory.partnerMkId, name: directory.name, email: directory.emails?.[0] ?? null, city: directory.address?.city ?? null } : mk ? { mkId: mk.mkId, name: mk.name, email: mk.emails?.[0] ?? null, city: mk.city ?? null } : null,
  });
}
