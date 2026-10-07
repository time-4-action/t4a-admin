import { NextResponse } from "next/server";
import { getPortalAccess, isAgentAccess, resolvePortalAccount } from "@/lib/portal";
import { connectDB, PreorderCampaign, PreorderAccess } from "@/lib/preorder";
import { upsertMkCustomer } from "@/lib/mk-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/portal/preorder/join { token } — unlock a campaign for the logged-in
// customer via its magic invite link. Boundary 1: requires a matched Metakocka
// partner (session email). Boundary 2: a valid, non-draft campaign token. Idempotent.
// A portal agent first picks which of their accounts to unlock it for: without an
// `account` the route answers `{ choose: true, accounts }` and grants nothing.
export async function POST(request: Request) {
  const access = await getPortalAccess();
  if (!access.partner) return NextResponse.json({ error: "no-account" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { token?: string; account?: string };
  const token = (body.token || "").trim();
  if (!token) return NextResponse.json({ error: "invalid" }, { status: 400 });

  await connectDB();
  const campaign = await PreorderCampaign.findOne({ shareToken: token }).exec();
  // A draft campaign isn't shareable yet; unknown token → invalid.
  if (!campaign || campaign.status === "draft") {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  if (isAgentAccess(access) && !body.account) {
    return NextResponse.json({ choose: true, campaignId: String(campaign._id), title: campaign.title, accounts: access.accounts });
  }
  const resolved = await resolvePortalAccount(body.account, access);
  if (!resolved) return NextResponse.json({ error: "no-account" }, { status: 403 });
  const { partner } = resolved;

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

  return NextResponse.json({ campaignId: String(campaign._id), title: campaign.title, account: resolved.account });
}
