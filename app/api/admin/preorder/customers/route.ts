import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { listMkCustomers, toMkCustomerView } from "@/lib/mk-customers";
import { PreorderAccess } from "@/models/preorder-access";
import { PreorderSubmission } from "@/models/preorder-submission";
import { PreorderCampaign } from "@/models/preorder-campaign";
import { submissionStage } from "@/types/preorder";
import type { CustomerActivity } from "@/lib/preorder-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/preorder/customers?q=&kind=&country=&page=&pageSize=&activity=1 —
// the Metakocka partner directory (campaign-independent). Used by the "add customer
// override" picker and, with `activity=1`, by Preorder → Customers (which campaigns
// each customer unlocked / submitted).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const res = await listMkCustomers({
    q: sp.get("q") ?? undefined,
    kind: sp.get("kind") === "business" || sp.get("kind") === "person" ? (sp.get("kind") as "business" | "person") : null,
    countryIso: sp.get("country") || null,
    page: Number(sp.get("page") ?? 1) || 1,
    pageSize: Number(sp.get("pageSize") ?? 30) || 30,
  });
  const items = res.items.map(toMkCustomerView);
  if (sp.get("activity") !== "1" || items.length === 0) {
    return NextResponse.json({ items, total: res.total, page: res.page, pageSize: res.pageSize });
  }

  const ids = items.map((c) => c.partnerMkId);
  const [access, subs] = await Promise.all([
    PreorderAccess.find({ partnerMkId: { $in: ids } }).select("campaignId partnerMkId").lean().exec(),
    PreorderSubmission.find({ partnerMkId: { $in: ids } }).select("campaignId partnerMkId status mkOrder mkSalesOrder resultPublishedToCustomer").lean().exec(),
  ]);
  const campaignIds = Array.from(new Set([...access, ...subs].map((x) => String(x.campaignId))));
  const campaigns = campaignIds.length
    ? await PreorderCampaign.find({ _id: { $in: campaignIds.map((id) => new Types.ObjectId(id)) } }).select("title season status").lean().exec()
    : [];
  const campaignById = new Map(campaigns.map((c) => [String(c._id), c]));

  const activity: Record<string, CustomerActivity> = {};
  const entry = (pid: string, cid: string) => {
    const a = (activity[pid] ??= { campaigns: [], unlocked: 0, submitted: 0 });
    let row = a.campaigns.find((c) => c.id === cid);
    if (!row) {
      const c = campaignById.get(cid);
      row = { id: cid, title: c?.title ?? "Deleted campaign", season: c?.season ?? null, status: c?.status ?? "closed", unlocked: false, stage: null };
      a.campaigns.push(row);
    }
    return { a, row };
  };
  for (const g of access) {
    const { a, row } = entry(g.partnerMkId, String(g.campaignId));
    if (!row.unlocked) {
      row.unlocked = true;
      a.unlocked += 1;
    }
  }
  for (const s of subs) {
    const { a, row } = entry(s.partnerMkId, String(s.campaignId));
    row.stage = submissionStage({
      status: s.status,
      mkOrder: s.mkOrder?.state ? { state: s.mkOrder.state, buyerOrder: s.mkOrder.buyerOrder ?? "", attempts: s.mkOrder.attempts ?? 0 } : null,
      mkSalesOrder: s.mkSalesOrder?.mkId ? { mkId: s.mkSalesOrder.mkId, countCode: s.mkSalesOrder.countCode } : null,
      resultPublishedToCustomer: !!s.resultPublishedToCustomer,
    });
    if (s.status !== "draft") a.submitted += 1;
  }
  return NextResponse.json({ items, total: res.total, page: res.page, pageSize: res.pageSize, activity });
}
