import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { connectDB, PreorderSubmission, toObjectId } from "@/lib/preorder";
import { publishResult } from "@/lib/preorder-mk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/preorder/campaigns/[id]/submissions/publish { published: boolean, ids?: string[] }
// Show (or hide) the Metakocka order to every customer of the campaign at once —
// the campaign-wide twin of the per-preorder "Show order to customer". Only
// registered orders can be shown; each one is re-read from MK first (the same rules
// as the single publish), and the response says what happened to each.
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { published?: boolean; ids?: string[] };
  const published = body.published !== false;
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;

  await connectDB();
  const filter: Record<string, unknown> = { campaignId: oid, status: { $ne: "draft" }, resultPublishedToCustomer: !published };
  if (ids) filter._id = { $in: ids.map((x) => toObjectId(x)).filter(Boolean) };
  const docs = await PreorderSubmission.find(filter).exec();

  const session = await auth0.getSession();
  const actor = { source: "admin" as const, email: session?.user?.email ?? null };
  const results: { id: string; partnerName: string; ok: boolean; error?: string }[] = [];
  for (const doc of docs) {
    const r = await publishResult(doc, published, actor);
    results.push({ id: String(doc._id), partnerName: doc.partnerName, ok: r.ok, error: r.ok ? undefined : r.error });
  }
  return NextResponse.json({
    published,
    total: docs.length,
    done: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => !r.ok),
  });
}
