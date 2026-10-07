import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { allCountryNames } from "@/lib/countries";
import { getVatSettings, saveVatSettings } from "@/lib/vat-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The global VAT table (Preorder → VAT rates) + every country name for the editors.
// Lives under /api/admin/preorder so the preorder section gates it.

// GET /api/admin/preorder/vat
export async function GET() {
  const settings = await getVatSettings();
  return NextResponse.json({ settings, countries: allCountryNames() });
}

// PUT — full replace: { rates: { SI: 22, AT: 20, … }, fallbackRate: number | null }
// (+ optional taxCodes; left out = kept as stored)
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { rates?: unknown; fallbackRate?: unknown; taxCodes?: unknown } | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const session = await auth0.getSession();
  const settings = await saveVatSettings(
    { rates: body.rates ?? {}, fallbackRate: body.fallbackRate ?? null, ...(body.taxCodes !== undefined ? { taxCodes: body.taxCodes } : {}) },
    session?.user?.email ?? null,
  );
  return NextResponse.json({ settings, countries: allCountryNames() });
}
