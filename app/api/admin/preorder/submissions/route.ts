import { NextResponse } from "next/server";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  toCampaignView,
  toSubmissionView,
  toObjectId,
} from "@/lib/preorder";
import { computeTotals, flattenRows } from "@/types/preorder";
import type { PreorderTerms } from "@/types/preorder";
import type { ISubmissionLine } from "@/models/preorder-submission";

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
// a partner (same as the portal flow, but the partner is chosen by the admin, not the
// session). Body: { campaignId, partnerMkId, partnerName, partnerEmail?, quantities, terms,
// action: "save" | "submit" }.
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

  const view = toCampaignView(campaignDoc);
  const quantities = body.quantities ?? {};
  const validRowIds = new Set(flattenRows(view).map(({ row }) => row.id));
  const codeByRow = new Map(flattenRows(view).map(({ row }) => [row.id, row.code]));
  const cleanQty: Record<string, number> = {};
  for (const [rowId, q] of Object.entries(quantities)) {
    const n = Math.max(0, Math.floor(Number(q) || 0));
    if (n > 0 && validRowIds.has(rowId)) cleanQty[rowId] = n;
  }

  const existing = await PreorderSubmission.findOne({
    campaignId: campaignDoc._id,
    partnerMkId,
  }).exec();
  const prevByRow = new Map((existing?.lines ?? []).map((l) => [l.rowId, l]));

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
      partnerMkId,
      partnerName: body.partnerName || partnerMkId,
      partnerEmail: body.partnerEmail,
    });

  doc.lines = lines;
  doc.totals = totals;
  doc.terms = {
    ...doc.terms,
    ...terms,
    deliveryDate: terms.deliveryDate ? new Date(terms.deliveryDate) : null,
  };
  if (body.partnerName) doc.partnerName = body.partnerName;
  if (body.partnerEmail !== undefined) doc.partnerEmail = body.partnerEmail;
  if (submit) {
    doc.status = "submitted";
    doc.submittedAt = doc.submittedAt ?? new Date();
  } else if (doc.status !== "submitted" && doc.status !== "confirmed") {
    doc.status = "draft";
  }
  await doc.save();

  return NextResponse.json({ submission: toSubmissionView(doc) });
}
