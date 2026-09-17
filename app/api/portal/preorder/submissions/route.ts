import { NextResponse } from "next/server";
import { getSessionPartner } from "@/lib/portal";
import { connectDB, PreorderCampaign, toObjectId, toPortalSubmissionView, partnerHasCampaignAccess } from "@/lib/preorder";
import { saveOrSubmitPreorder } from "@/lib/preorder-submit";
import type { PreorderTerms } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/portal/preorder/submissions — save draft or submit a partner's preorder.
// Body: { campaignId, quantities: {rowId: qty}, terms, action: "save" | "submit" }.
// The partner is resolved from the session; quantities are validated against the
// partner's EFFECTIVE campaign; on submit the Metakocka sales order is registered
// immediately (lib/preorder-submit.ts). The response never carries MK identifiers.
export async function POST(request: Request) {
  const partner = await getSessionPartner();
  if (!partner) return NextResponse.json({ error: "no-account" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    campaignId?: string;
    quantities?: Record<string, number>;
    terms?: PreorderTerms;
    action?: "save" | "submit";
  };
  const campaignId = (body.campaignId || "").trim();
  if (!toObjectId(campaignId)) {
    return NextResponse.json({ error: "invalid campaign" }, { status: 400 });
  }

  await connectDB();
  const campaignDoc = await PreorderCampaign.findById(campaignId).exec();
  if (!campaignDoc || campaignDoc.status !== "open") {
    return NextResponse.json({ error: "campaign not open" }, { status: 404 });
  }

  // Invite boundary: only a partner who unlocked the campaign (or already has a
  // submission) may fill it — guards against filling a campaign id they were not invited to.
  if (!(await partnerHasCampaignAccess(campaignDoc._id, partner.mkId))) {
    return NextResponse.json({ error: "no-access" }, { status: 403 });
  }

  const result = await saveOrSubmitPreorder({
    campaignDoc,
    partner: { mkId: partner.mkId, name: partner.name, email: partner.emails?.[0], mk: partner },
    quantities: body.quantities ?? {},
    terms: body.terms,
    action: body.action === "submit" ? "submit" : "save",
    actor: { source: "customer" },
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message, submission: result.doc ? toPortalSubmissionView(result.doc) : null },
      { status: result.status },
    );
  }
  return NextResponse.json({ submission: toPortalSubmissionView(result.doc), dropped: result.dropped });
}
