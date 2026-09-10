import { NextResponse } from "next/server";
import { getSessionPartner } from "@/lib/portal";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  toCampaignView,
  toSubmissionView,
  toObjectId,
  partnerHasCampaignAccess,
} from "@/lib/preorder";
import { computeTotals, flattenRows } from "@/types/preorder";
import type { PreorderTerms } from "@/types/preorder";
import type { ISubmissionLine } from "@/models/preorder-submission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/portal/preorder/submissions — save draft or submit a partner's preorder.
// Body: { campaignId, quantities: {rowId: qty}, terms, action: "save" | "submit" }.
// The partner is resolved from the session; quantities are validated against the
// campaign's own rows; totals are computed server-side.
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
  // submission) may fill it — guards against filling a campaign id you weren't invited to.
  if (!(await partnerHasCampaignAccess(campaignDoc._id, partner.mkId))) {
    return NextResponse.json({ error: "no-access" }, { status: 403 });
  }

  const view = toCampaignView(campaignDoc);
  const quantities = body.quantities ?? {};

  // Keep only quantities for rows that actually exist in this campaign, and >0.
  const validRowIds = new Set(flattenRows(view).map(({ row }) => row.id));
  const codeByRow = new Map(flattenRows(view).map(({ row }) => [row.id, row.code]));
  const cleanQty: Record<string, number> = {};
  for (const [rowId, q] of Object.entries(quantities)) {
    const n = Math.max(0, Math.floor(Number(q) || 0));
    if (n > 0 && validRowIds.has(rowId)) cleanQty[rowId] = n;
  }

  const existing = await PreorderSubmission.findOne({
    campaignId: campaignDoc._id,
    partnerMkId: partner.mkId,
  }).exec();

  // Once submitted, a preorder is LOCKED — the customer can't change it. Only an admin
  // can unlock it (reverting the status to draft) to allow further edits.
  if (existing && (existing.status === "submitted" || existing.status === "confirmed")) {
    return NextResponse.json({ error: "locked" }, { status: 409 });
  }

  // Preserve any admin fulfilment fields already set on surviving rows.
  const prevByRow = new Map(
    (existing?.lines ?? []).map((l) => [l.rowId, l]),
  );
  const lines: ISubmissionLine[] = Object.entries(cleanQty).map(([rowId, qty]) => {
    const prev = prevByRow.get(rowId);
    return {
      rowId,
      code: codeByRow.get(rowId) ?? "",
      qty,
      confirmedQty: prev?.confirmedQty ?? null,
      lineStatus: prev?.lineStatus ?? "pending",
    };
  });

  const totals = computeTotals(view, cleanQty);
  const submit = body.action === "submit";

  const terms: PreorderTerms = {
    invoiceAddress: body.terms?.invoiceAddress,
    shippingAddress: body.terms?.shippingAddress,
    country: body.terms?.country,
    phone: body.terms?.phone,
    deliveryDate: body.terms?.deliveryDate ?? null,
    comment: body.terms?.comment,
  };

  const doc =
    existing ??
    new PreorderSubmission({
      campaignId: campaignDoc._id,
      partnerMkId: partner.mkId,
      partnerName: partner.name,
      partnerEmail: partner.emails?.[0],
    });

  doc.lines = lines;
  doc.totals = totals;
  doc.terms = {
    ...doc.terms,
    ...terms,
    deliveryDate: terms.deliveryDate ? new Date(terms.deliveryDate) : null,
  };
  doc.partnerName = partner.name;
  doc.partnerEmail = partner.emails?.[0];
  if (submit) {
    doc.status = "submitted";
    doc.submittedAt = doc.submittedAt ?? new Date();
  } else if (doc.status !== "submitted" && doc.status !== "confirmed") {
    doc.status = "draft";
  }
  await doc.save();

  return NextResponse.json({ submission: toSubmissionView(doc) });
}
