import { NextResponse, type NextRequest } from "next/server";
import { connectDB, PreorderCampaign, toObjectId } from "@/lib/preorder";
import { listCampaignCustomers, type CustomersQuery } from "@/lib/preorder-customers";
import type { SubmissionStage } from "@/types/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/preorder/campaigns/[id]/customers?q=&kind=&country=&market=&access=&stage=&override=&page=
// The Customers view: directory rows joined with this campaign's access / submission /
// rule state and the resolved market. Mongo only.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await connectDB();
  const doc = await PreorderCampaign.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const sp = req.nextUrl.searchParams;
  const query: CustomersQuery = {
    q: sp.get("q") ?? undefined,
    kind: sp.get("kind") === "business" || sp.get("kind") === "person" ? (sp.get("kind") as "business" | "person") : null,
    countryIso: sp.get("country") || null,
    marketId: sp.get("market") || null,
    access: (sp.get("access") as CustomersQuery["access"]) ?? "all",
    stage: (sp.get("stage") as SubmissionStage | "all" | "any") ?? "all",
    override: (sp.get("override") as CustomersQuery["override"]) ?? "all",
    page: Number(sp.get("page") ?? 1) || 1,
    pageSize: Number(sp.get("pageSize") ?? 50) || 50,
  };
  const res = await listCampaignCustomers(doc, query);
  return NextResponse.json(res);
}
