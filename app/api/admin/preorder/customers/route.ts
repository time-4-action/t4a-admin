import { NextResponse, type NextRequest } from "next/server";
import { listMkCustomers, toMkCustomerView } from "@/lib/mk-customers";
import { customerPreorderActivity } from "@/lib/preorder-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/preorder/customers?q=&kind=&country=&page=&pageSize=&activity=1 —
// the Metakocka partner directory (campaign-independent). Used by the "add customer
// override" picker and, with `activity=1`, by Preorder → Customers (which campaigns
// each customer unlocked / submitted).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const res = await listMkCustomers({
    q: sp.get("q") ?? undefined,
    kind: sp.get("kind") === "business" || sp.get("kind") === "person" ? (sp.get("kind") as "business" | "person") : null,
    countryIso: sp.get("country") || null,
    page: Number(sp.get("page") ?? 1) || 1,
    pageSize: Number(sp.get("pageSize") ?? 30) || 30,
  });
  const items = res.items.map(toMkCustomerView);
  if (sp.get("activity") !== "1" || items.length === 0) {
    return NextResponse.json({ items, total: res.total, page: res.page, pageSize: res.pageSize });
  }

  const activity = await customerPreorderActivity(items.map((c) => c.partnerMkId));
  return NextResponse.json({ items, total: res.total, page: res.page, pageSize: res.pageSize, activity });
}
