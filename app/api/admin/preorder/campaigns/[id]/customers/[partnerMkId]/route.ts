import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { connectDB, PreorderCampaign, toCampaignAdminView, toObjectId, loadEffectiveCampaignForPartner } from "@/lib/preorder";
import { deleteCustomerRule, upsertCustomerRule } from "@/lib/preorder-markets";
import { getCampaignCustomer } from "@/lib/preorder-customers";
import { getMkCustomer, effectiveCountryIso } from "@/lib/mk-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string; partnerMkId: string }> };

async function load(id: string) {
  if (!toObjectId(id)) return null;
  await connectDB();
  return PreorderCampaign.findById(id).exec();
}

// GET /api/admin/preorder/campaigns/[id]/customers/[partnerMkId] — one customer's row,
// their rule (if any) and their effective campaign summary for the drawer.
export async function GET(_req: Request, { params }: RouteParams) {
  const { id, partnerMkId } = await params;
  const doc = await load(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pid = decodeURIComponent(partnerMkId);
  const row = await getCampaignCustomer(doc, pid);
  const admin = toCampaignAdminView(doc);
  const rule = admin.customerRules.find((r) => r.partnerMkId === pid) ?? null;
  const directory = await getMkCustomer(pid);
  const effective = loadEffectiveCampaignForPartner(doc, {
    mkId: pid,
    countryIso: directory ? effectiveCountryIso(directory) : null,
    countrySource: directory?.countryIsoManual ? "manual" : directory?.countrySource ?? null,
  });
  return NextResponse.json({ customer: row, rule, effective: effective.effective, effectiveTabs: effective.tabs.map((t) => ({ id: t.id, name: t.name, rows: t.groups.reduce((n, g) => n + g.rows.length, 0), tiers: t.tiers ?? [] })) });
}

// PUT — upsert this customer's rule: { partnerName?, marketId?, countryIso?, config, note? }
export async function PUT(request: Request, { params }: RouteParams) {
  const { id, partnerMkId } = await params;
  const doc = await load(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pid = decodeURIComponent(partnerMkId);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.partnerName) {
    const directory = await getMkCustomer(pid);
    if (directory) body.partnerName = directory.name;
  }
  const session = await auth0.getSession();
  const res = await upsertCustomerRule(doc, pid, body, session?.user?.email ?? null);
  if ("error" in res) return NextResponse.json(res, { status: res.status });
  return NextResponse.json({ rule: res, customer: await getCampaignCustomer(doc, pid) });
}

// DELETE — remove the rule (the customer falls back to market / campaign defaults).
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id, partnerMkId } = await params;
  const doc = await load(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pid = decodeURIComponent(partnerMkId);
  const removed = await deleteCustomerRule(doc, pid);
  return NextResponse.json({ ok: true, removed, customer: await getCampaignCustomer(doc, pid) });
}
