import { NextResponse } from "next/server";
import { getSessionPartner } from "@/lib/portal";
import { connectDB, PreorderCampaign, PreorderAccess } from "@/lib/preorder";
import { upsertMkCustomer } from "@/lib/mk-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/portal/preorder/join { token } — unlock a campaign for the logged-in
// customer via its magic invite link. Boundary 1: requires a matched Metakocka
// partner (session email). Boundary 2: a valid, non-draft campaign token. Idempotent.
export async function POST(request: Request) {
  const partner = await getSessionPartner();
  if (!partner) return NextResponse.json({ error: "no-account" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const token = (body.token || "").trim();
  if (!token) return NextResponse.json({ error: "invalid" }, { status: 400 });

  await connectDB();
  const campaign = await PreorderCampaign.findOne({ shareToken: token }).exec();
  // A draft campaign isn't shareable yet; unknown token → invalid.
  if (!campaign || campaign.status === "draft") {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  // Grant access (idempotent — re-opening the link just refreshes the partner label).
  await PreorderAccess.updateOne(
    { campaignId: campaign._id, partnerMkId: partner.mkId },
    {
      $setOnInsert: { grantedAt: new Date() },
      $set: { partnerName: partner.name, partnerEmail: partner.emails?.[0] },
    },
    { upsert: true },
  ).exec();

  // Keep the customer directory warm (country for the markets view).
  void upsertMkCustomer(partner).catch(() => undefined);

  return NextResponse.json({ campaignId: String(campaign._id), title: campaign.title });
}
