import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { toSubmissionView } from "@/lib/preorder";
import { publishSubmission } from "@/lib/preorder-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/preorder/submissions/[id]/publish { published: boolean } — show the
// current Metakocka order to the customer (their preorder page + Documents/Orders), or
// hide it again. Publishing re-reads the live order first: a deleted order cannot be
// published, and the order's fingerprint is remembered so later MK edits show up as
// "changed since publish" for admins. Logic: publishSubmission (lib/preorder-admin.ts).
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { published?: boolean };
  const published = body.published !== false;
  const session = await auth0.getSession();
  const res = await publishSubmission(id, published, { source: "admin", email: session?.user?.email ?? null });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ submission: toSubmissionView(res.doc), allocation: res.allocation });
}
