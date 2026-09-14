import { NextResponse } from "next/server";
import { connectDB, PreorderCampaign, toCampaignAdminView, toObjectId } from "@/lib/preorder";
import { assignCountries, replaceMarkets, upsertMarket } from "@/lib/preorder-markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!toObjectId(id)) return null;
  await connectDB();
  return PreorderCampaign.findById(id).exec();
}

// GET /api/admin/preorder/campaigns/[id]/markets — the campaign's markets + rules.
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const doc = await load(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const view = toCampaignAdminView(doc);
  return NextResponse.json({ markets: view.markets, customerRules: view.customerRules, priceBooks: view.priceBooks });
}

// PUT /api/admin/preorder/campaigns/[id]/markets { markets } — replace all markets.
export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const doc = await load(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { markets?: unknown };
  const res = await replaceMarkets(doc, body.markets);
  if (!Array.isArray(res)) return NextResponse.json(res, { status: res.status });
  return NextResponse.json({ markets: res });
}

// POST /api/admin/preorder/campaigns/[id]/markets — create one market
//   { name, color?, countries?, config? }
// or move countries: { assign: { marketId: string | null, countries: string[] } }
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const doc = await load(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as {
    assign?: { marketId?: string | null; countries?: string[] };
    name?: string;
    color?: string;
    countries?: string[];
    config?: unknown;
  };
  if (body.assign) {
    const res = await assignCountries(doc, body.assign.marketId ?? null, body.assign.countries ?? []);
    if (res !== true) return NextResponse.json(res, { status: res.status });
    return NextResponse.json({ markets: toCampaignAdminView(doc).markets });
  }
  const res = await upsertMarket(doc, body);
  if ("error" in res) return NextResponse.json(res, { status: res.status });
  return NextResponse.json({ market: res, markets: toCampaignAdminView(doc).markets }, { status: 201 });
}
