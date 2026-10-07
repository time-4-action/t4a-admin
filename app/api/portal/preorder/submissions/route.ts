import { NextResponse } from "next/server";
import { resolvePortalAccount } from "@/lib/portal";
import { connectDB, PreorderCampaign, toObjectId, toPortalSubmissionView, partnerHasCampaignAccess } from "@/lib/preorder";
import { saveOrSubmitPreorder } from "@/lib/preorder-submit";
import { defaultTermsFromPartner } from "@/lib/preorder-terms";
import type { PreorderTerms } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/portal/preorder/submissions — save draft or submit a partner's preorder.
// Body: { campaignId, quantities: {rowId: qty}, terms, action: "save" | "submit" }.
// The partner is resolved from the session; quantities are validated against the
// partner's EFFECTIVE campaign; on submit the Metakocka sales order is registered
// immediately (lib/preorder-submit.ts). The response never carries MK identifiers.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    account?: string;
    campaignId?: string;
    quantities?: Record<string, number>;
    terms?: PreorderTerms;
    action?: "save" | "submit";
  };
  // A portal agent acting for a client names the account; it must be one of theirs.
  const resolved = await resolvePortalAccount(body.account);
  if (!resolved) return NextResponse.json({ error: "no-account" }, { status: 404 });
  const { partner, account } = resolved;

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
    // Identity + addresses are Metakocka's, never the browser's: only the requested
    // delivery date and the comment are the customer's to set.
    terms: { ...defaultTermsFromPartner(partner), deliveryDate: body.terms?.deliveryDate ?? null, comment: body.terms?.comment },
    action: body.action === "submit" ? "submit" : "save",
    // An admin "viewing as" the customer acts AS the customer — the submission reads
    // exactly as if the customer had made it.
    // An agent acting for a client submits AS that client too; who placed it is kept.
    actor: account.own
      ? { source: "customer" }
      : {
          source: "customer",
          agent: { partnerMkId: resolved.access.partner!.mkId, name: resolved.access.partner!.name, email: resolved.access.partner!.emails?.[0] ?? null },
        },
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message, submission: result.doc ? toPortalSubmissionView(result.doc) : null },
      { status: result.status },
    );
  }
  return NextResponse.json({ submission: toPortalSubmissionView(result.doc), dropped: result.dropped });
}
