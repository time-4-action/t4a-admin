import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { connectDB, PreorderSubmission, toSubmissionView, toObjectId } from "@/lib/preorder";
import { publishResult, readSubmissionOrder } from "@/lib/preorder-mk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/preorder/submissions/[id]/publish { published: boolean } — show the
// current Metakocka order to the customer (their preorder page + Documents/Orders), or
// hide it again. Publishing re-reads the live order first: a deleted order cannot be
// published, and the order's fingerprint is remembered so later MK edits show up as
// "changed since publish" for admins.
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { published?: boolean };
  const published = body.published !== false;

  await connectDB();
  const doc = await PreorderSubmission.findById(id).exec();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const session = await auth0.getSession();
  const res = await publishResult(doc, published, { source: "admin", email: session?.user?.email ?? null });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  const fresh = (await PreorderSubmission.findById(id).exec()) ?? doc;
  const allocation = await readSubmissionOrder(fresh);
  return NextResponse.json({ submission: toSubmissionView(fresh), allocation });
}
