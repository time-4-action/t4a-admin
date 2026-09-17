import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { connectDB, PreorderCampaign, PreorderSubmission, toSubmissionView, toObjectId } from "@/lib/preorder";
import { saveOrSubmitPreorder } from "@/lib/preorder-submit";
import { getPartnerById } from "@/lib/metakocka";
import { getMkCustomer, upsertMkCustomer } from "@/lib/mk-customers";
import type { PreorderTerms } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/preorder/submissions?campaignId=&partnerMkId= — one partner's submission
// for a campaign (for prefill when an admin fills on their behalf), or null.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaignId") ?? "";
  const partnerMkId = url.searchParams.get("partnerMkId") ?? "";
  const oid = toObjectId(campaignId);
  if (!oid || !partnerMkId) return NextResponse.json({ submission: null });
  await connectDB();
  const doc = await PreorderSubmission.findOne({ campaignId: oid, partnerMkId }).exec();
  return NextResponse.json({ submission: doc ? toSubmissionView(doc) : null });
}

// POST /api/admin/preorder/submissions — an admin creates/updates a preorder ON BEHALF of
// a partner (same service as the portal flow, but the partner is chosen by the admin, not
// the session). The partner's effective campaign is applied and, on submit, the
// Metakocka sales order is registered immediately. Body: { campaignId, partnerMkId,
// partnerName, partnerEmail?, quantities, terms, action: "save" | "submit" }.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    campaignId?: string;
    partnerMkId?: string;
    partnerName?: string;
    partnerEmail?: string;
    quantities?: Record<string, number>;
    terms?: PreorderTerms;
    action?: "save" | "submit";
  };
  const campaignId = (body.campaignId || "").trim();
  const partnerMkId = (body.partnerMkId || "").trim();
  if (!toObjectId(campaignId)) return NextResponse.json({ error: "invalid campaign" }, { status: 400 });
  if (!partnerMkId) return NextResponse.json({ error: "partner required" }, { status: 400 });

  await connectDB();
  const campaignDoc = await PreorderCampaign.findById(campaignId).exec();
  if (!campaignDoc) return NextResponse.json({ error: "campaign not found" }, { status: 404 });

  // Resolve the partner in MK (needed for the country and the order's partner block);
  // fall back to the directory record when MK is unreachable.
  const mk = await getPartnerById(partnerMkId);
  if (mk) void upsertMkCustomer(mk).catch(() => undefined);
  const cached = mk ? null : await getMkCustomer(partnerMkId);
  const name = body.partnerName?.trim() || mk?.name || cached?.name || partnerMkId;
  const email = body.partnerEmail ?? mk?.emails?.[0] ?? cached?.emails?.[0] ?? undefined;

  const session = await auth0.getSession();
  const result = await saveOrSubmitPreorder({
    campaignDoc,
    partner: {
      mkId: partnerMkId,
      name,
      email,
      mk,
      countryIso: cached ? (cached.countryIsoManual ?? cached.countryIso ?? null) : null,
      countrySource: cached?.countrySource ?? null,
    },
    quantities: body.quantities ?? {},
    terms: body.terms,
    action: body.action === "submit" ? "submit" : "save",
    actor: { source: "admin", email: session?.user?.email ?? null },
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.error }, { status: result.status });
  }
  return NextResponse.json({ submission: toSubmissionView(result.doc), dropped: result.dropped, register: result.register });
}
