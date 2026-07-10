import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import {
  connectDB,
  PreorderCampaign,
  submissionCountsByCampaign,
  toCampaignSummary,
  toCampaignView,
} from "@/lib/preorder";
import type { IPreorderCampaign } from "@/models/preorder-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/preorder/campaigns — list all campaigns (newest first) with counts.
export async function GET() {
  await connectDB();
  const docs = (await PreorderCampaign.find()
    .sort({ updatedAt: -1 })
    .exec()) as IPreorderCampaign[];
  const counts = await submissionCountsByCampaign(docs.map((d) => String(d._id)));
  const campaigns = docs.map((d) => toCampaignSummary(d, counts[String(d._id)] ?? 0));
  return NextResponse.json({ campaigns });
}

// POST /api/admin/preorder/campaigns — create a new (draft) campaign.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    season?: string;
    currency?: string;
    deadline?: string | null;
  };
  const title = (body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  await connectDB();
  const session = await auth0.getSession();
  const doc = await PreorderCampaign.create({
    title,
    season: body.season?.trim() || null,
    currency: body.currency?.trim() || "EUR",
    deadline: body.deadline ? new Date(body.deadline) : null,
    status: "draft",
    tabs: [],
    createdBy: session?.user?.email ?? null,
  });
  return NextResponse.json({ campaign: toCampaignView(doc) }, { status: 201 });
}
