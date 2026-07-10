import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { resolvePartnerByEmail } from "@/lib/metakocka";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The customer matching the logged-in admin's own email (the default selection
// for the document pages). Returns { partner: MkPartner | null }.
export async function GET() {
  const session = await auth0.getSession();
  const partner = await resolvePartnerByEmail(session?.user?.email);
  return NextResponse.json({ partner });
}
