import { connectDB } from "@/lib/mongodb";
import { UserUsage } from "@/models/user-usage";
import { UserLimit } from "@/models/user-limit";
import { Conversation } from "@/models/conversation";
import { getMgmtClient } from "@/lib/mgmt";
import { NextRequest, NextResponse } from "next/server";

// Cache the management API token to avoid a round-trip on every request
let _mgmtToken: string | null = null;
let _mgmtTokenExpiry = 0;

async function getMgmtToken(): Promise<string> {
  if (_mgmtToken && Date.now() < _mgmtTokenExpiry) return _mgmtToken;
  const domain = process.env.AUTH0_ISSUER_BASE_URL!;
  const res = await fetch(`${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.AUTH0_MGMT_CLIENT_ID!,
      client_secret: process.env.AUTH0_MGMT_CLIENT_SECRET!,
      audience: `${domain}/api/v2/`,
    }),
  });
  const data = await res.json();
  _mgmtToken = data.access_token;
  _mgmtTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _mgmtToken!;
}

export async function PATCH(req: NextRequest) {
  // Extract ID from URL directly — avoids any params-decoding ambiguity
  const segments = new URL(req.url).pathname.split("/");
  const userId = decodeURIComponent(segments[segments.length - 1]);
  const payload = await req.json();

  const domain = process.env.AUTH0_ISSUER_BASE_URL!;
  const token = await getMgmtToken();
  const res = await fetch(`${domain}/api/v2/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: err.message ?? "Failed to update" }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { purge } = await req.json().catch(() => ({ purge: false }));
  const segments = new URL(req.url).pathname.split("/");
  const userId = decodeURIComponent(segments[segments.length - 1]);
  const mgmt = getMgmtClient();

  await mgmt.users.delete(userId);

  if (purge) {
    await connectDB();
    await Promise.all([
      UserUsage.deleteMany({ userId: userId }),
      UserLimit.deleteOne({ userId: userId }),
      Conversation.deleteMany({ userId: userId }),
    ]);
  }

  return NextResponse.json({ ok: true });
}
