import { NextResponse } from "next/server";
import { callWarranty } from "@/lib/warranty-api";
import { auth0 } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ submissionId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { submissionId } = await params;
  let body: { text?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.text || !body.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  // Stamp the note with the logged-in admin's name + email so the timeline
  // shows who wrote what without trusting the browser.
  const session = await auth0.getSession();
  const authorName = session?.user?.name ?? session?.user?.email ?? "Admin";
  const authorEmail = session?.user?.email ?? "";

  const result = await callWarranty(
    `/api/admin/submissions/${encodeURIComponent(submissionId)}/notes`,
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
