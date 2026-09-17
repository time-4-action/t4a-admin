import { NextResponse, type NextRequest } from "next/server";
import { listMkCustomers, toMkCustomerView } from "@/lib/mk-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/preorder/customers?q=&country=&page= — the Metakocka partner
// directory (campaign-independent). Used by the "add customer override" picker.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const res = await listMkCustomers({
    q: sp.get("q") ?? undefined,
    countryIso: sp.get("country") || null,
    page: Number(sp.get("page") ?? 1) || 1,
    pageSize: Number(sp.get("pageSize") ?? 30) || 30,
  });
  return NextResponse.json({ items: res.items.map(toMkCustomerView), total: res.total, page: res.page, pageSize: res.pageSize });
}
