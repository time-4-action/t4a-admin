import { NextResponse } from "next/server";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  toCampaignView,
  toSubmissionView,
  toObjectId,
} from "@/lib/preorder";
import {
  createSalesOrder,
  getPartnerById,
  getMkProductPrices,
  productTaxCode,
  pickMkListGrossPrice,
} from "@/lib/metakocka";
import { auth0 } from "@/lib/auth";
import { flattenRows, rowUnitPrice } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/preorder/submissions/[id]/sales-order — push the submission's
// admin-CONFIRMED lines to Metakocka as a sales order. Manual, one-shot: guarded
// against double-creation (409 if an order already exists). Title = campaign season.
export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();

  const doc = await PreorderSubmission.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (doc.mkSalesOrder?.mkId) {
    return NextResponse.json(
      { error: "A sales order already exists for this submission.", submission: toSubmissionView(doc) },
      { status: 409 },
    );
  }

  const campaignDoc = await PreorderCampaign.findById(doc.campaignId).exec();
  if (!campaignDoc) return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  const campaign = toCampaignView(campaignDoc);

  // Map rowId → row so we can read code + the unit price the partner ordered at.
  const rowById = new Map(flattenRows(campaign).map(({ row }) => [row.id, row]));

  // Only lines the admin explicitly CONFIRMED, at their confirmed quantity
  // (falling back to the ordered qty when left blank).
  const confirmed = doc.lines
    .filter((l) => l.lineStatus === "confirmed")
    .map((l) => {
      const row = rowById.get(l.rowId);
      const amount = l.confirmedQty ?? l.qty;
      return { code: l.code, amount, price: row ? rowUnitPrice(row) : 0 };
    })
    .filter((l) => l.amount > 0 && l.code);

  if (confirmed.length === 0) {
    return NextResponse.json(
      { error: "No confirmed lines to order. Confirm at least one line first." },
      { status: 400 },
    );
  }

  // Price each line explicitly from the campaign's PARTNER price list, read straight
  // from MK as the GROSS price (discount + VAT included — same "real" price shown in
  // the sheet) and locked onto the line as price_with_tax — we do NOT put a price list
  // on the order document. Tax gives MK the rate to back out net. Falls back to the
  // snapshotted (already gross) partner price if MK has no price for that list/product.
  const mkPrices = await getMkProductPrices(confirmed.map((l) => l.code));
  const lines = confirmed.map((l) => {
    const listPrice = pickMkListGrossPrice(mkPrices[l.code], campaign.partnerPricelist, {
      untaxedIsNet: true,
    });
    return {
      code: l.code,
      amount: l.amount,
      priceWithTax: listPrice ?? l.price,
      tax: productTaxCode(mkPrices[l.code]),
    };
  });

  const partner = await getPartnerById(doc.partnerMkId);
  if (!partner) {
    return NextResponse.json(
      { error: "Could not resolve this partner in Metakocka." },
      { status: 400 },
    );
  }

  const title = campaign.season?.trim() || campaign.title;
  const result = await createSalesOrder({
    partner,
    title,
    currencyCode: campaign.currency || "EUR",
    notes: doc.terms?.comment || undefined,
    lines,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const session = await auth0.getSession();
  doc.mkSalesOrder = {
    mkId: result.order.mkId,
    countCode: result.order.countCode,
    totalPrice: result.order.totalPrice ?? null,
    createdAt: new Date(),
    createdBy: session?.user?.name ?? session?.user?.email ?? null,
  };
  await doc.save();

  return NextResponse.json({ submission: toSubmissionView(doc) });
}
