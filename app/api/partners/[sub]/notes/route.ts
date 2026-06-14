import { NextResponse } from "next/server";
import { callPartnerPortal } from "@/lib/partner-api";
import { auth0 } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ sub: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { sub: rawSub } = await params;
  const sub = decodeURIComponent(rawSub); // segment may arrive percent-encoded
  const result = await callPartnerPortal(
    `/api/admin/partners/${encodeURIComponent(sub)}/notes`,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { sub: rawSub } = await params;
  const sub = decodeURIComponent(rawSub); // segment may arrive percent-encoded
  let body: { text?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.text || !body.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  // Stamp the note with the logged-in admin's name + email server-side so the
  // timeline shows who wrote what without trusting the browser.
  const session = await auth0.getSession();
  const authorName = session?.user?.name ?? session?.user?.email ?? "Admin";
  const authorEmail = session?.user?.email ?? "";

  const result = await callPartnerPortal(
    `/api/admin/partners/${encodeURIComponent(sub)}/notes`,
    {
      method: "POST",
      body: { text: body.text.trim(), authorName, authorEmail },
    },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
