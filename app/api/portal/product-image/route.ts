import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proxy the product catalogue image lookup so the browser never calls the
// external product API directly. Lives under /api/portal/* so both admins and
// portal customers can reach it (the only prefix customers aren't redirected
// away from). Returns { image: string | null }.
const BASE = process.env.PRODUCT_API_BASE || "https://api.time-4-action.com";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ image: null });

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BASE}/api/export/product/search?q=${encodeURIComponent(code)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return NextResponse.json({ image: null });
    const data = (await res.json()) as { data?: { image?: string }[] };
    const image = data?.data?.[0]?.image ?? null;
    return NextResponse.json({ image }, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch {
    return NextResponse.json({ image: null });
  } finally {
    clearTimeout(t);
  }
}
