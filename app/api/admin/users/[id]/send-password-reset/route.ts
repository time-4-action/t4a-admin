import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  const domain = process.env.AUTH0_ISSUER_BASE_URL!;
  const clientId = process.env.AUTH0_CLIENT_ID!;

  const res = await fetch(`${domain}/dbconnections/change_password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      email,
      connection: process.env.AUTH0_DB_CONNECTION ?? "Username-Password-Authentication",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[send-password-reset] Auth0 error:", res.status, text);
    return NextResponse.json({ error: text }, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
