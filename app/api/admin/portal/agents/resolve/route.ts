import { NextResponse } from "next/server";
import { MAX_RESOLVE_LINES, resolveCustomerLines } from "@/lib/portal-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/portal/agents/resolve { lines: string[] } — match a pasted list
// (customer code, partner id, email or exact name per line) against the customer
// directory for the agent page's "Paste a list". Reads only; nothing is saved.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { lines?: unknown };
  if (!Array.isArray(body.lines)) return NextResponse.json({ error: "lines must be a list" }, { status: 400 });
  const lines = body.lines.filter((l): l is string => typeof l === "string");
  if (lines.length > MAX_RESOLVE_LINES) {
    return NextResponse.json({ error: `Paste at most ${MAX_RESOLVE_LINES} lines at once` }, { status: 413 });
  }
  return NextResponse.json({ results: await resolveCustomerLines(lines) });
}
