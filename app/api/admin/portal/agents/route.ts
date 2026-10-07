import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { getAgent, listAgents, saveAgent } from "@/lib/portal-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Portal agents (Customers section — gated by the /api/admin/portal rule in
// lib/access.ts). An agent is a Metakocka partner who also sees the documents and
// preorders of the client partners assigned here.
//
// GET  — every agent with their clients.
// POST { partnerMkId, partnerName, clients: [{partnerMkId, partnerName}], note? } —
//      make a customer an agent (409 if they already are; edit via PUT /[partnerMkId]).
export async function GET() {
  return NextResponse.json({ agents: await listAgents() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    partnerMkId?: string;
    partnerName?: string;
    clients?: unknown;
    note?: string | null;
  };
  const partnerMkId = (body.partnerMkId ?? "").trim();
  if (!partnerMkId) return NextResponse.json({ error: "partnerMkId is required" }, { status: 400 });
  if (await getAgent(partnerMkId)) return NextResponse.json({ error: "This customer is already an agent" }, { status: 409 });
  const session = await auth0.getSession();
  const agent = await saveAgent({
    partnerMkId,
    partnerName: body.partnerName ?? "",
    clients: body.clients ?? [],
    note: body.note ?? null,
    actor: session?.user?.email ?? null,
  });
  return NextResponse.json({ agent }, { status: 201 });
}
