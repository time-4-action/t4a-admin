import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { toSubmissionView } from "@/lib/preorder";
import { registerSubmissionOrder } from "@/lib/preorder-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/preorder/submissions/[id]/sales-order { reprice? } — register (or
// retry) the submission's Metakocka sales order. The order is built from the FROZEN
// snapshot (exactly what the customer submitted); the service looks the order up by
// its idempotency key before creating, so calling this twice never creates two orders.
// 409 when a registration is already in flight or the order already exists.
// Logic: registerSubmissionOrder (lib/preorder-admin.ts), shared with the agent API.
export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { reprice?: boolean };
  const session = await auth0.getSession();
  const out = await registerSubmissionOrder(id, { reprice: !!body.reprice }, { source: "admin", email: session?.user?.email ?? null });
  if (out.kind === "not-found") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (out.kind === "refused") {
    return NextResponse.json(
      out.doc ? { error: out.error, submission: toSubmissionView(out.doc) } : { error: out.error },
      { status: out.status },
    );
  }
  return NextResponse.json({ submission: toSubmissionView(out.doc), result: out.result, allocation: out.allocation }, { status: out.status });
}
