import { NextResponse } from "next/server";
import { cached } from "@/lib/auth0-cache";
import { connectDB } from "@/lib/mongodb";
import { PreorderCampaign } from "@/models/preorder-campaign";
import { getMkProductPrices } from "@/lib/metakocka";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/preorder/vat/mk-tax-codes — the tax codes this Metakocka account
// actually uses, with their rates. MK has no "list taxes" call, so they are discovered
// from the price lists of the products on the preorder sheets (json/product_list with
// show_tax_factor). Cached 10 min; `?fresh=1` re-reads.
export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const load = async () => {
    await connectDB();
    const campaigns = await PreorderCampaign.find({}).select("tabs.groups.rows.code tabs.groups.rows.source").lean().exec();
    const codes = new Set<string>();
    for (const c of campaigns) for (const t of c.tabs ?? []) for (const g of t.groups ?? []) for (const r of g.rows ?? []) if (r.source === "catalogue" && r.code) codes.add(r.code);
    const sample = Array.from(codes).slice(0, 150);
    const prices = sample.length ? await getMkProductPrices(sample) : {};
    const found = new Map<string, { code: string; rate: number | null; lists: Set<string> }>();
    for (const entries of Object.values(prices)) {
      for (const e of entries) {
        if (!e.tax) continue;
        const hit = found.get(e.tax) ?? { code: e.tax, rate: null, lists: new Set<string>() };
        if (e.taxRate !== undefined) hit.rate = e.taxRate;
        if (e.title) hit.lists.add(e.title);
        found.set(e.tax, hit);
      }
    }
    return {
      sampled: sample.length,
      codes: Array.from(found.values())
        .map((c) => ({ code: c.code, rate: c.rate, lists: Array.from(c.lists).slice(0, 5) }))
        .sort((a, b) => (a.rate ?? 999) - (b.rate ?? 999) || a.code.localeCompare(b.code)),
    };
  };
  const data = fresh ? await load() : await cached("mk-tax-codes", 10 * 60_000, load);
  return NextResponse.json(data);
}
