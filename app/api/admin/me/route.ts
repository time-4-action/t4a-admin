import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the calling user's own Auth0 id — used by the Super Admins page to
// disable self-revoke in the UI (the roles PATCH route enforces it for real).
export async function GET() {
  return NextResponse.json({ id: await getCurrentUserId() });
}
