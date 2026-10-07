import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { deleteAgent, getAgent, saveAgent } from "@/lib/portal-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ partnerMkId: string }> };

// GET    — one agent.
// PUT    { clients, note?, partnerName? } — replace the client list (the whole list:
//        a client left out loses the agent's access immediately).
// DELETE — the partner is a plain customer again (their own account only).
export async function GET(_req: Request, { params }: RouteParams) {
  const { partnerMkId } = await params;
  const agent = await getAgent(decodeURIComponent(partnerMkId));
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ agent });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const id = decodeURIComponent((await params).partnerMkId);
  const existing = await getAgent(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { clients?: unknown; note?: string | null; partnerName?: string };
  const session = await auth0.getSession();
  const agent = await saveAgent({
    partnerMkId: id,
    partnerName: body.partnerName ?? existing.partnerName,
    clients: body.clients ?? existing.clients,
    note: body.note,
    actor: session?.user?.email ?? null,
  });
  return NextResponse.json({ agent });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const id = decodeURIComponent((await params).partnerMkId);
  if (!(await deleteAgent(id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
